import { describe, it, expect } from "vitest";
import { tokenWallet } from "../index.js";
import { tokenWalletClient } from "../client.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";

describe("tokenWallet plugin shape", () => {
  it("has id 'token-wallet'", () => {
    const plugin = tokenWallet();
    expect(plugin.id).toBe("token-wallet");
  });

  it("has schema with 4 tables", () => {
    const plugin = tokenWallet();
    expect(plugin.schema).toBeDefined();
    const tables = Object.keys(plugin.schema!);
    expect(tables).toHaveLength(4);
    expect(tables).toContain("walletAccount");
    expect(tables).toContain("walletTransaction");
    expect(tables).toContain("walletEntry");
    expect(tables).toContain("walletHold");
  });

  it("has init function", () => {
    const plugin = tokenWallet();
    expect(typeof plugin.init).toBe("function");
  });

  it("init returns object with options.databaseHooks", () => {
    const plugin = tokenWallet();
    expect(plugin.init).toBeDefined();
    expect(typeof plugin.init).toBe("function");

    if (!plugin.init) return;
    const initResult = plugin.init({} as Parameters<typeof plugin.init>[0]);

    type InitReturn = Awaited<ReturnType<typeof plugin.init>> & {
      options: {
        databaseHooks: {
          user: { create: { after: (...args: unknown[]) => Promise<unknown> } };
        };
      };
    };
    const result = initResult as InitReturn;
    expect(result.options).toBeDefined();
    expect(result.options.databaseHooks).toBeDefined();
    expect(result.options.databaseHooks.user).toBeDefined();
    expect(result.options.databaseHooks.user.create).toBeDefined();
    expect(typeof result.options.databaseHooks.user.create.after).toBe(
      "function",
    );
  });

  it("has $Infer with options", () => {
    const plugin = tokenWallet();
    expect(plugin.$Infer).toBeDefined();
    expect(plugin.$Infer!.options).toBeUndefined();
  });

  it("has $Infer with options when options provided", () => {
    const opts = { wallet: { autoCreate: true, initialBalance: 100 } };
    const plugin = tokenWallet(opts);
    expect(plugin.$Infer!.options).toEqual(opts);
  });

  it("has $ERROR_CODES with 6 codes", () => {
    const plugin = tokenWallet();
    expect(plugin.$ERROR_CODES).toBeDefined();
    const codes = Object.keys(plugin.$ERROR_CODES!);
    expect(codes).toHaveLength(6);
    expect(codes).toContain("WALLET_NOT_FOUND");
    expect(codes).toContain("INVALID_AMOUNT");
    expect(codes).toContain("DUPLICATE_IDEMPOTENCY_KEY");
    expect(codes).toContain("SYSTEM_ACCOUNT_MISSING");
    expect(codes).toContain("MISSING_IDEMPOTENCY_KEY");
    expect(codes).toContain("CREDIT_FAILED");
  });

  it("endpoints has credit endpoint", () => {
    const plugin = tokenWallet();
    expect(plugin.endpoints).toBeDefined();
    expect(plugin.endpoints!.credit).toBeDefined();
  });
});

describe("tokenWalletClient plugin shape", () => {
  it("has id 'token-wallet'", () => {
    const client = tokenWalletClient();
    expect(client.id).toBe("token-wallet");
  });

  it("has $InferServerPlugin", () => {
    const client = tokenWalletClient();
    expect(client.$InferServerPlugin).toBeDefined();
  });

  it("has pathMethods with /token-wallet/credit as POST", () => {
    const client = tokenWalletClient();
    expect(client.pathMethods).toBeDefined();
    expect(client.pathMethods!["/token-wallet/credit"]).toBe("POST");
  });

  it("has $ERROR_CODES matching server plugin", () => {
    const client = tokenWalletClient();
    expect(client.$ERROR_CODES).toEqual(TOKEN_WALLET_ERROR_CODES);
  });
});
