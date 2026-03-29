import { betterAuth } from "better-auth";
import type { Auth, BetterAuthOptions } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { memoryAdapter } from "better-auth/adapters/memory";
import { tokenWallet } from "../../index.js";
import type { TokenWalletOptions } from "../../types.js";

export function createTestAuth(pluginOptions?: TokenWalletOptions): {
  auth: Auth<BetterAuthOptions>;
  client: ReturnType<typeof createAuthClient>;
} {
  const auth = betterAuth({
    emailAndPassword: { enabled: true },
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      walletAccount: [],
      walletTransaction: [],
      walletEntry: [],
      walletHold: [],
    }),
    plugins: [tokenWallet(pluginOptions)],
  });

  const client = createAuthClient({
    baseURL: "http://localhost:3000",
    fetchOptions: {
      customFetchImpl: async (
        url: string | URL | Request,
        init?: RequestInit,
      ): Promise<Response> => {
        const req = new Request(url.toString(), init);
        return auth.handler(req) as Promise<Response>;
      },
    },
  });

  return { auth: auth, client: client };
}

export async function createTestUser(
  client: ReturnType<typeof createTestAuth>["client"],
  email?: string,
): Promise<{
  user: { id: string; email: string; name: string };
  token: string | null;
}> {
  const testEmail = email ?? `test-${Date.now()}@example.com`;
  const res = await client.signUp.email({
    email: testEmail,
    password: "test1234",
    name: "Test User",
  });

  if (res.error) {
    throw new Error(
      `Failed to create test user: ${JSON.stringify(res.error)}`,
    );
  }

  return {
    user: res.data!.user,
    token: res.data!.token,
  };
}
