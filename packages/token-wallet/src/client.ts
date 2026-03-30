import type { BetterAuthClientPlugin } from "better-auth/client";
import type { tokenWallet } from "./index.js";
import { TOKEN_WALLET_ERROR_CODES } from "./error-codes.js";

export const tokenWalletClient = (): BetterAuthClientPlugin => {
  return {
    id: "token-wallet",
    $InferServerPlugin: {} as ReturnType<typeof tokenWallet>,
    pathMethods: {
      "/token-wallet/credit": "POST" as const,
      "/token-wallet/balance": "GET" as const,
      "/token-wallet/transactions": "GET" as const,
    },
    $ERROR_CODES: TOKEN_WALLET_ERROR_CODES,
  };
};
