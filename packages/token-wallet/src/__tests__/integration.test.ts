import { describe, it, expect, vi } from "vitest";
import { createTestAuth } from "./helpers/test-auth.js";
import { SYSTEM_ACCOUNT_IDS } from "../system-accounts/index.js";
import type { WalletAdapter } from "../ledger/index.js";
import type { TokenWalletOptions } from "../types.js";

async function signUpDirect(
  auth: ReturnType<typeof createTestAuth>["auth"],
): Promise<{ userId: string; cookies: string }> {
  const req = new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `intg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
      password: "test1234",
      name: "Test User",
    }),
  });
  const res = await auth.handler(req);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sign up failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as Record<string, Record<string, unknown>>;
  const setCookieHeaders = res.headers.getSetCookie();
  const cookies = setCookieHeaders.map((c) => c.split(";")[0]).join("; ");
  return {
    userId: data.user?.id as string,
    cookies,
  };
}

async function callCredit(
  auth: ReturnType<typeof createTestAuth>["auth"],
  cookies: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const req = new Request(
    "http://localhost:3000/api/auth/token-wallet/credit",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookies,
      },
      body: JSON.stringify(body),
    },
  );
  return auth.handler(req);
}

function getAdapter(
  auth: ReturnType<typeof createTestAuth>["auth"],
): WalletAdapter {
  const factory = auth.options.database;
  return factory(auth.options) as unknown as WalletAdapter;
}

describe("integration: full credit lifecycle", () => {
  it("happy path: create user → credit → verify balance → duplicate returns 200", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res1 = await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "lifecycle-1",
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.balance).toEqual({ posted: 100, available: 100, pending: 0 });

    const res2 = await callCredit(auth, cookies, {
      amount: 200,
      idempotencyKey: "lifecycle-2",
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.balance).toEqual({ posted: 300, available: 300, pending: 0 });

    const res3 = await callCredit(auth, cookies, {
      amount: 999,
      idempotencyKey: "lifecycle-1",
    });
    expect(res3.status).toBe(200);
    const data3 = await res3.json();
    expect(data3.balance.posted).toBe(300);

    const res4 = await callCredit(auth, cookies, {
      amount: 1,
      idempotencyKey: "lifecycle-verify",
    });
    expect(res4.status).toBe(200);
    const data4 = await res4.json();
    expect(data4.balance.posted).toBe(301);
  });
});

describe("integration: double-entry invariant", () => {
  it("SUM(debits) === SUM(credits) after credit", async () => {
    const { auth } = createTestAuth();
    const adapter = getAdapter(auth);
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 150,
      idempotencyKey: "double-entry-1",
    });
    expect(res.status).toBe(200);
    const data = await res.json();

    const txId = data.transaction.id;
    const entries = await adapter.findMany({
      model: "walletEntry",
      where: [{ field: "transactionId", value: txId }],
    });

    const debitSum = entries
      .filter((e) => e.entryType === "DEBIT")
      .reduce((sum, e) => sum + (e.amount as number), 0);
    const creditSum = entries
      .filter((e) => e.entryType === "CREDIT")
      .reduce((sum, e) => sum + (e.amount as number), 0);

    expect(debitSum).toBe(150);
    expect(creditSum).toBe(150);
    expect(debitSum).toBe(creditSum);
  });
});

describe("integration: system accounts updated", () => {
  it("sys_revenue postedBalance reflects total credits", async () => {
    const { auth } = createTestAuth();
    const adapter = getAdapter(auth);
    const { cookies } = await signUpDirect(auth);

    await callCredit(auth, cookies, {
      amount: 500,
      idempotencyKey: "sys-account-1",
    });

    const revenueAccount = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: SYSTEM_ACCOUNT_IDS.REVENUE }],
    });

    expect(revenueAccount).toBeDefined();
    expect(revenueAccount!.postedBalance).toBe(500);
  });
});

describe("integration: multiple users isolated", () => {
  it("credits to userA do not affect userB balance", async () => {
    const { auth } = createTestAuth();

    const userA = await signUpDirect(auth);
    const userB = await signUpDirect(auth);

    await callCredit(auth, userA.cookies, {
      amount: 100,
      idempotencyKey: "iso-userA-1",
    });
    const resA = await callCredit(auth, userA.cookies, {
      amount: 100,
      idempotencyKey: "iso-userA-1b",
    });
    expect(resA.status).toBe(200);

    await callCredit(auth, userB.cookies, {
      amount: 200,
      idempotencyKey: "iso-userB-1",
    });
    const resB = await callCredit(auth, userB.cookies, {
      amount: 200,
      idempotencyKey: "iso-userB-1b",
    });
    expect(resB.status).toBe(200);

    const resACheck = await callCredit(auth, userA.cookies, {
      amount: 1,
      idempotencyKey: "iso-userA-check",
    });
    const dataACheck = await resACheck.json();
    expect(dataACheck.balance.posted).toBe(201);

    const resBCheck = await callCredit(auth, userB.cookies, {
      amount: 1,
      idempotencyKey: "iso-userB-check",
    });
    const dataBCheck = await resBCheck.json();
    expect(dataBCheck.balance.posted).toBe(401);
  });
});

describe("integration: error scenarios", () => {
  it("rejects credit with amount 0", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 0,
      idempotencyKey: "err-zero",
    });
    expect(res.status).toBe(400);
  });

  it("rejects credit with negative amount", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: -10,
      idempotencyKey: "err-neg",
    });
    expect(res.status).toBe(400);
  });

  it("rejects credit without authentication", async () => {
    const { auth } = createTestAuth();

    const res = await callCredit(auth, "", {
      amount: 100,
      idempotencyKey: "err-noauth",
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it("returns original result on duplicate idempotency key", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res1 = await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "err-dup-key",
    });
    expect(res1.status).toBe(200);

    const res2 = await callCredit(auth, cookies, {
      amount: 200,
      idempotencyKey: "err-dup-key",
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.transaction.idempotencyKey).toBe("err-dup-key");
    expect(data2.balance.posted).toBe(100);
  });
});

describe("integration: onTopUp hook", () => {
  it("calls onTopUp hook with correct context", async () => {
    const onTopUp = vi.fn();
    const { auth } = createTestAuth({
      hooks: { onTopUp },
    } satisfies TokenWalletOptions);
    const { userId, cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "hook-intg-1",
    });
    expect(res.status).toBe(200);

    expect(onTopUp).toHaveBeenCalledOnce();
    const hookCtx = onTopUp.mock.calls[0]![0];

    expect(hookCtx.transaction.transactionType).toBe("CREDIT_TOPUP");
    expect(hookCtx.transaction.idempotencyKey).toBe("hook-intg-1");
    expect(hookCtx.transaction.status).toBe("posted");
    expect(hookCtx.entries).toHaveLength(2);
    expect(hookCtx.user.id).toBe(userId);
    expect(hookCtx.wallet).toBeDefined();
    expect(hookCtx.wallet.postedBalance).toBeDefined();
  });
});

describe("integration: balance invariant after multiple operations", () => {
  it("available === posted (no pending debits in Phase 1)", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "invariant-1",
    });
    await callCredit(auth, cookies, {
      amount: 200,
      idempotencyKey: "invariant-2",
    });
    const res3 = await callCredit(auth, cookies, {
      amount: 50,
      idempotencyKey: "invariant-3",
    });

    expect(res3.status).toBe(200);
    const data = await res3.json();
    expect(data.balance.posted).toBe(350);
    expect(data.balance.available).toBe(350);
    expect(data.balance.pending).toBe(0);
    expect(data.balance.available).toBe(data.balance.posted);
  });
});

describe("integration: schema customization", () => {
  it("credit flow works with custom schema options", async () => {
    const { auth } = createTestAuth({
      schema: {
        walletAccount: {
          fields: { postedBalance: "posted_balance" },
        },
      },
    } satisfies TokenWalletOptions);
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "schema-custom-1",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.balance.posted).toBe(100);
    expect(data.balance.available).toBe(100);
  });
});
