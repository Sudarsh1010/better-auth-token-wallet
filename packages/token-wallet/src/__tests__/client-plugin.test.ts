import { describe, it, expect } from "vitest";
import { tokenWalletClient } from "../client.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import { tokenWallet } from "../index.js";

describe("client plugin", () => {
  it("returns object with $InferServerPlugin", () => {
    const client = tokenWalletClient();
    expect(client.$InferServerPlugin).toBeDefined();
  });

  it("has pathMethods mapping credit to POST", () => {
    const client = tokenWalletClient();
    expect(client.pathMethods).toBeDefined();
    expect(client.pathMethods!["/token-wallet/credit"]).toBe("POST");
  });

  it("has $ERROR_CODES matching server error codes", () => {
    const client = tokenWalletClient();
    expect(client.$ERROR_CODES).toEqual(TOKEN_WALLET_ERROR_CODES);
    const codes = Object.keys(client.$ERROR_CODES!);
    expect(codes).toContain("WALLET_NOT_FOUND");
    expect(codes).toContain("INVALID_AMOUNT");
    expect(codes).toContain("DUPLICATE_IDEMPOTENCY_KEY");
    expect(codes).toContain("SYSTEM_ACCOUNT_MISSING");
    expect(codes).toContain("MISSING_IDEMPOTENCY_KEY");
    expect(codes).toContain("CREDIT_FAILED");
  });

  it("client $InferServerPlugin has expected type shape", () => {
    const client = tokenWalletClient();
    expect(client.$InferServerPlugin).toBeDefined();
    expect(typeof client.$InferServerPlugin).toBe("object");
  });

  it("all exported types are importable", () => {
    expect(typeof tokenWallet).toBe("function");
    expect(typeof tokenWalletClient).toBe("function");
    expect(typeof TOKEN_WALLET_ERROR_CODES).toBe("object");
  });
});
