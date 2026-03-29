import { describe, it, expect } from "vitest";
import type { BetterAuthPlugin } from "better-auth";
import { betterAuth } from "better-auth";
import { createAuthClient } from "better-auth/client";
import { memoryAdapter } from "better-auth/adapters/memory";
import { tokenWalletSchema } from "../schema.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";

/**
 * SPIKE: Validate that plugin init() can inject databaseHooks.user.create.after
 * and that the hook fires when a user signs up. If this fails, we must
 * use endpoint hooks instead for wallet auto-creation.
 */
describe("spike: databaseHooks injection", () => {
  function createAuthWithPlugin(plugin: BetterAuthPlugin) {
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
      plugins: [plugin],
    });
    const client = createAuthClient({
      baseURL: "http://localhost:3000",
      fetchOptions: {
        customFetchImpl: async (url, init) => {
          const req = new Request(url.toString(), init);
          return auth.handler(req);
        },
      },
    });
    return { auth, client };
  }

  it("fires user.create.after hook on signup", async () => {
    let hookFired = false;
    let capturedUser: unknown = null;

    const testPlugin: BetterAuthPlugin = {
      id: "token-wallet",
      schema: tokenWalletSchema,
      init: () => ({
        options: {
          databaseHooks: {
            user: {
              create: {
                after: async (user: unknown) => {
                  hookFired = true;
                  capturedUser = user;
                },
              },
            },
          },
        },
      }),
      endpoints: {},
      $Infer: { options: undefined },
      $ERROR_CODES: TOKEN_WALLET_ERROR_CODES,
    };

    const { client } = createAuthWithPlugin(testPlugin);

    const res = await client.signUp.email({
      email: "hook-test@example.com",
      password: "test1234",
      name: "Hook Test User",
    });

    expect(res.error).toBeFalsy();
    expect(res.data?.user).toBeDefined();

    // databaseHooks.after is fire-and-forget (post-transaction) — wait briefly
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(hookFired).toBe(true);
    expect(capturedUser).toBeDefined();
  });

  it("hook receives the created user object", async () => {
    let capturedUser: Record<string, unknown> | null = null;

    const testPlugin: BetterAuthPlugin = {
      id: "token-wallet",
      schema: tokenWalletSchema,
      init: () => ({
        options: {
          databaseHooks: {
            user: {
              create: {
                after: async (user: Record<string, unknown>) => {
                  capturedUser = user;
                },
              },
            },
          },
        },
      }),
      endpoints: {},
      $Infer: { options: undefined },
      $ERROR_CODES: TOKEN_WALLET_ERROR_CODES,
    };

    const { client } = createAuthWithPlugin(testPlugin);

    const res = await client.signUp.email({
      email: "user-verify@example.com",
      password: "test1234",
      name: "User Verify",
    });

    expect(res.error).toBeFalsy();

    // databaseHooks.after is fire-and-forget (post-transaction) — wait briefly
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(capturedUser).not.toBeNull();
    expect(capturedUser!.email).toBe("user-verify@example.com");
    expect(capturedUser!.id).toBeDefined();
    expect(typeof capturedUser!.id).toBe("string");
  });

  it("actual tokenWallet plugin does not crash on signup", async () => {
    const { tokenWallet } = await import("../index.js");
    const { client } = createAuthWithPlugin(tokenWallet());

    const res = await client.signUp.email({
      email: "real-plugin@example.com",
      password: "test1234",
      name: "Real Plugin Test",
    });

    expect(res.error).toBeFalsy();
    expect(res.data?.user).toBeDefined();
    expect(res.data?.user.email).toBe("real-plugin@example.com");
  });
});
