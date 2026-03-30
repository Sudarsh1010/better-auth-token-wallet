import { describe, it, expect, vi } from "vitest";
import { createTestAuth } from "./helpers/test-auth.js";
import { SYSTEM_ACCOUNT_IDS } from "../system-accounts/index.js";
import type { TokenWalletOptions } from "../types.js";

async function signUpDirect(
  auth: ReturnType<typeof createTestAuth>["auth"],
): Promise<{ userId: string; cookies: string }> {
  const req = new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `credit-${Date.now()}@example.com`,
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

describe("credit endpoint", () => {
  it("creates CREDIT_TOPUP transaction with balanced entries", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "credit-test-1",
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.transaction).toBeDefined();
    expect(data.transaction.transactionType).toBe("CREDIT_TOPUP");
    expect(data.transaction.idempotencyKey).toBe("credit-test-1");
    expect(data.transaction.status).toBe("posted");

    expect(data.entries).toHaveLength(2);
    const debitEntry = data.entries.find(
      (e: Record<string, unknown>) => e.entryType === "DEBIT",
    );
    const creditEntry = data.entries.find(
      (e: Record<string, unknown>) => e.entryType === "CREDIT",
    );
    expect(debitEntry).toBeDefined();
    expect(creditEntry).toBeDefined();
    expect(debitEntry.accountId).toBe(SYSTEM_ACCOUNT_IDS.REVENUE);
    expect(debitEntry.amount).toBe(100);
    expect(creditEntry.amount).toBe(100);
  });

  it("increases posted and available balance by credited amount", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 250,
      idempotencyKey: "balance-test-1",
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.balance).toBeDefined();
    expect(data.balance.posted).toBe(250);
    expect(data.balance.available).toBe(250);
  });

  it("returns original result on duplicate idempotency key", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const first = await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "dup-key-1",
    });
    expect(first.status).toBe(200);
    const data1 = await first.json();

    const second = await callCredit(auth, cookies, {
      amount: 50,
      idempotencyKey: "dup-key-1",
    });
    expect(second.status).toBe(200);
    const data2 = await second.json();

    expect(data2.transaction.idempotencyKey).toBe("dup-key-1");
    expect(data2.balance.posted).toBe(100);
  });

  it("rejects missing idempotency key", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 100,
    });

    expect(res.status).toBe(400);
  });

  it("rejects invalid amount (zero)", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 0,
      idempotencyKey: "zero-amount",
    });

    expect(res.status).toBe(400);
  });

  it("rejects invalid amount (negative)", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: -50,
      idempotencyKey: "neg-amount",
    });

    expect(res.status).toBe(400);
  });

  it("fires onTopUp hook with correct context", async () => {
    const onTopUp = vi.fn();
    const { auth } = createTestAuth({
      hooks: { onTopUp },
    } satisfies TokenWalletOptions);
    const { cookies, userId } = await signUpDirect(auth);

    await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "hook-test-1",
    });

    expect(onTopUp).toHaveBeenCalledOnce();
    const hookCtx = onTopUp.mock.calls[0]![0];
    expect(hookCtx.transaction.transactionType).toBe("CREDIT_TOPUP");
    expect(hookCtx.entries).toHaveLength(2);
    expect(hookCtx.user.id).toBe(userId);
    expect(hookCtx.wallet).toBeDefined();
  });

  it("accumulates multiple credits correctly", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "accum-1",
    });
    const res2 = await callCredit(auth, cookies, {
      amount: 150,
      idempotencyKey: "accum-2",
    });

    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.balance.posted).toBe(250);
    expect(data2.balance.available).toBe(250);
  });

  it("creates wallet for user without existing wallet", async () => {
    const { auth } = createTestAuth({
      wallet: { autoCreate: false },
    } satisfies TokenWalletOptions);
    const { cookies } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "no-wallet-1",
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.balance.posted).toBe(100);
  });

  it("stores referenceKey on credit transaction", async () => {
    const { auth } = createTestAuth();
    const { cookies, userId } = await signUpDirect(auth);

    const res = await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "refkey-test-1",
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    // The credit endpoint response includes the transaction object
    // referenceKey should be set to "user:{userId}"
    expect(data.transaction.referenceKey).toBe(`user:${userId}`);
  });
});
