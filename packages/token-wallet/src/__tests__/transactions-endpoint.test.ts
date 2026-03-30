import { describe, it, expect } from "vitest";
import { createTestAuth } from "./helpers/test-auth.js";
import type { TokenWalletOptions } from "../types.js";

async function signUpDirect(
  auth: ReturnType<typeof createTestAuth>["auth"],
): Promise<{ userId: string; cookies: string }> {
  const req = new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `tx-${Date.now()}@example.com`,
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

async function callTransactions(
  auth: ReturnType<typeof createTestAuth>["auth"],
  cookies: string,
  params?: Record<string, string>,
): Promise<Response> {
  const url = new URL("http://localhost:3000/api/auth/token-wallet/transactions");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  const req = new Request(url.toString(), {
    method: "GET",
    headers: { Cookie: cookies },
  });
  return auth.handler(req);
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

describe("transactions endpoint", () => {
  it("returns empty list for new user", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callTransactions(auth, cookies);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transactions).toEqual([]);
    expect(data.total).toBe(0);
    expect(data.limit).toBe(20);
    expect(data.offset).toBe(0);
  });

  it("returns transactions after credits", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "tx-credit-1",
    });

    const res = await callTransactions(auth, cookies);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.transactions.length).toBe(1);
    expect(data.total).toBe(1);
    expect(data.transactions[0].transactionType).toBe("CREDIT_TOPUP");
    expect(data.transactions[0].entries).toBeDefined();
    expect(data.transactions[0].entries.length).toBe(2);
  });

  it("entries are embedded with debit and credit", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    await callCredit(auth, cookies, {
      amount: 250,
      idempotencyKey: "tx-entry-1",
    });

    const res = await callTransactions(auth, cookies);
    const data = await res.json();

    const entries = data.transactions[0].entries;
    const debitEntry = entries.find((e: Record<string, unknown>) => e.entryType === "DEBIT");
    const creditEntry = entries.find((e: Record<string, unknown>) => e.entryType === "CREDIT");
    expect(debitEntry).toBeDefined();
    expect(creditEntry).toBeDefined();
    expect(debitEntry.amount).toBe(250);
    expect(creditEntry.amount).toBe(250);
  });

  it("default pagination is limit=20, offset=0", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callTransactions(auth, cookies);
    const data = await res.json();
    expect(data.limit).toBe(20);
    expect(data.offset).toBe(0);
  });

  it("custom limit and offset work", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    // Create 3 transactions
    for (let i = 0; i < 3; i++) {
      await callCredit(auth, cookies, {
        amount: 100,
        idempotencyKey: `pag-${i}`,
      });
    }

    const res = await callTransactions(auth, cookies, { limit: "2", offset: "0" });
    const data = await res.json();
    expect(data.transactions.length).toBe(2);
    expect(data.total).toBe(3);
    expect(data.limit).toBe(2);
    expect(data.offset).toBe(0);
  });

  it("offset beyond total returns empty with correct total", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    await callCredit(auth, cookies, {
      amount: 100,
      idempotencyKey: "off-1",
    });

    const res = await callTransactions(auth, cookies, { offset: "100" });
    const data = await res.json();
    expect(data.transactions).toEqual([]);
    expect(data.total).toBe(1);
  });

  it("user isolation: users see only their own transactions", async () => {
    const { auth } = createTestAuth();

    // User A
    const userA = await signUpDirect(auth);
    await callCredit(auth, userA.cookies, {
      amount: 100,
      idempotencyKey: "iso-a-1",
    });

    // User B
    const userB = await signUpDirect(auth);
    await callCredit(auth, userB.cookies, {
      amount: 200,
      idempotencyKey: "iso-b-1",
    });

    // User A sees 1 transaction
    const resA = await callTransactions(auth, userA.cookies);
    const dataA = await resA.json();
    expect(dataA.total).toBe(1);

    // User B sees 1 transaction
    const resB = await callTransactions(auth, userB.cookies);
    const dataB = await resB.json();
    expect(dataB.total).toBe(1);
  });

  it("rejects organization referenceType", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callTransactions(auth, cookies, {
      referenceType: "organization",
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("ORG_NOT_SUPPORTED");
  });

  it("rejects unauthenticated request", async () => {
    const { auth } = createTestAuth();

    const res = await callTransactions(auth, "");

    expect(res.status).toBe(401);
  });

  it("validates limit: rejects negative", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callTransactions(auth, cookies, { limit: "-1" });
    expect(res.status).toBe(400);
  });

  it("validates limit: rejects zero", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callTransactions(auth, cookies, { limit: "0" });
    expect(res.status).toBe(400);
  });

  it("validates limit: rejects >100", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callTransactions(auth, cookies, { limit: "101" });
    expect(res.status).toBe(400);
  });

  it("validates offset: rejects negative", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callTransactions(auth, cookies, { offset: "-1" });
    expect(res.status).toBe(400);
  });
});
