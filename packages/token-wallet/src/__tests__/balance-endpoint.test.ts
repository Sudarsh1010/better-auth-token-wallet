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
      email: `balance-${Date.now()}@example.com`,
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

async function callBalance(
  auth: ReturnType<typeof createTestAuth>["auth"],
  cookies: string,
  params?: Record<string, string>,
): Promise<Response> {
  const url = new URL("http://localhost:3000/api/auth/token-wallet/balance");
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

describe("balance endpoint", () => {
  it("returns zeros for user with empty wallet", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callBalance(auth, cookies);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posted).toBe(0);
    expect(data.pending).toBe(0);
    expect(data.available).toBe(0);
  });

  it("returns correct balance after credit", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    await callCredit(auth, cookies, {
      amount: 500,
      idempotencyKey: "bal-credit-1",
    });

    const res = await callBalance(auth, cookies);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posted).toBe(500);
    expect(data.pending).toBe(0);
    expect(data.available).toBe(500);
  });

  it("auto-creates wallet for user without one", async () => {
    const { auth } = createTestAuth({
      wallet: { autoCreate: false },
    } satisfies TokenWalletOptions);
    const { cookies } = await signUpDirect(auth);

    const res = await callBalance(auth, cookies);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.posted).toBe(0);
    expect(data.pending).toBe(0);
    expect(data.available).toBe(0);
  });

  it("rejects organization referenceType", async () => {
    const { auth } = createTestAuth();
    const { cookies } = await signUpDirect(auth);

    const res = await callBalance(auth, cookies, {
      referenceType: "organization",
    });

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.code).toBe("ORG_NOT_SUPPORTED");
  });

  it("rejects unauthenticated request", async () => {
    const { auth } = createTestAuth();

    const res = await callBalance(auth, "");

    expect(res.status).toBe(401);
  });
});
