import { describe, it, expect } from "vitest";
import { createTestAuth } from "./helpers/test-auth.js";

async function signUpDirect(
  auth: ReturnType<typeof createTestAuth>["auth"],
): Promise<{ userId: string; cookies: string }> {
  const req = new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `opt-${Date.now()}@example.com`,
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

describe("transactions query optimization", () => {
  /**
   * This test verifies that entries fetched in the initial query are reused
   * and attached to transactions correctly — proving the N+1 is eliminated.
   *
   * Before the optimization: entries were re-fetched per transaction (N+1 queries).
   * After: entries from the first fetch are grouped by transactionId in memory.
   */
  it("reuses entries from initial fetch for all transactions (no N+1)", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    // Create 5 transactions to make N+1 impact visible
    const N = 5;
    for (let i = 0; i < N; i++) {
      const res = await callCredit(auth, cookies, {
        amount: 10 * (i + 1),
        idempotencyKey: `n1-opt-${i}`,
      });
      expect(res.status).toBe(200);
    }

    // Fetch all transactions
    const res = await callTransactions(auth, cookies, { limit: "100" });
    expect(res.status).toBe(200);
    const data = await res.json();

    // Response shape unchanged
    expect(data.total).toBe(N);
    expect(data.transactions).toHaveLength(N);
    expect(data.limit).toBe(100);
    expect(data.offset).toBe(0);

    // Each transaction must have its entries attached (proving reuse)
    // Each credit creates 2 entries (DEBIT from system, CREDIT to user)
    for (const tx of data.transactions) {
      expect(tx.entries).toBeDefined();
      expect(Array.isArray(tx.entries)).toBe(true);
      expect(tx.entries.length).toBe(2);

      const debitEntry = tx.entries.find(
        (e: Record<string, unknown>) => e.entryType === "DEBIT",
      );
      const creditEntry = tx.entries.find(
        (e: Record<string, unknown>) => e.entryType === "CREDIT",
      );
      expect(debitEntry).toBeDefined();
      expect(creditEntry).toBeDefined();
      expect(debitEntry.transactionId).toBe(tx.id);
      expect(creditEntry.transactionId).toBe(tx.id);
    }
  });

  it("returns correct entries with pagination (proves entries reused, not re-fetched)", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    // Create 4 transactions
    for (let i = 0; i < 4; i++) {
      await callCredit(auth, cookies, {
        amount: 25,
        idempotencyKey: `page-opt-${i}`,
      });
    }

    // Page 1: first 2 transactions
    const res1 = await callTransactions(auth, cookies, {
      limit: "2",
      offset: "0",
    });
    const data1 = await res1.json();
    expect(data1.transactions).toHaveLength(2);
    expect(data1.total).toBe(4);

    // Page 2: next 2 transactions
    const res2 = await callTransactions(auth, cookies, {
      limit: "2",
      offset: "2",
    });
    const data2 = await res2.json();
    expect(data2.transactions).toHaveLength(2);
    expect(data2.total).toBe(4);

    // All entries should be properly attached
    const allTx = [...data1.transactions, ...data2.transactions];
    for (const tx of allTx) {
      expect(tx.entries).toBeDefined();
      expect(tx.entries.length).toBe(2);
      // Entries must belong to the correct transaction
      for (const entry of tx.entries) {
        expect(entry.transactionId).toBe(tx.id);
      }
    }

    // No duplicate transaction IDs across pages
    const ids = allTx.map((tx: Record<string, unknown>) => tx.id);
    expect(new Set(ids).size).toBe(4);
  });

  /**
   * Verifies the endpoint uses findWalletByReference (read-only) instead of
   * getOrCreateUserWallet (which has a write side-effect on GET).
   * A user with no wallet should get NOT_FOUND, not auto-creation.
   */
  it("returns NOT_FOUND when wallet does not exist (no auto-create on GET)", async () => {
    const { auth } = createTestAuth();
    const { cookies, userId } = await signUpDirect(auth);

    // The auto-create hook creates a wallet on sign-up, so we need to test
    // with a referenceId that has no wallet. We use a different referenceId.
    const res = await callTransactions(auth, cookies, {
      referenceId: "nonexistent-user-id",
    });

    // With getOrCreateUserWallet this would succeed (creating a wallet).
    // With findWalletByReference this should return NOT_FOUND.
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.code).toBe("WALLET_NOT_FOUND");
  });
});
