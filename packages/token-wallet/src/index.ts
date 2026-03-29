import type { BetterAuthPlugin } from "better-auth";
import { createCustomSchema } from "./schema.js";
import { TOKEN_WALLET_ERROR_CODES } from "./error-codes.js";
import type { TokenWalletOptions } from "./types.js";
import { createCreditEndpoint } from "./endpoints/credit.js";
import { registerAutoCreateHook } from "./wallet-account/index.js";
import { seedSystemAccounts } from "./system-accounts/index.js";
import type { WalletAdapter } from "./ledger/index.js";

export const tokenWallet = (options?: TokenWalletOptions): BetterAuthPlugin => {
  const schema = createCustomSchema(options?.schema);
  return {
    id: "token-wallet",
    schema,
    init: (ctx) => {
      if (!ctx.options?.database) {
        return {
          options: {
            databaseHooks: {
              user: {
                create: {
                  after: async () => {},
                },
              },
            },
          },
        };
      }

      const adapter = ctx.options.database(ctx.options) as unknown as WalletAdapter;

      // Seed system accounts eagerly on init
      seedSystemAccounts(adapter).catch(() => {});

      const hookOpts: { autoCreate?: boolean; initialBalance?: number } = {};
      if (options?.wallet?.autoCreate !== undefined) {
        hookOpts.autoCreate = options.wallet.autoCreate;
      }
      if (options?.wallet?.initialBalance !== undefined) {
        hookOpts.initialBalance = options.wallet.initialBalance;
      }
      const autoCreateFn = registerAutoCreateHook(adapter, hookOpts);

      return {
        options: {
          databaseHooks: {
            user: {
              create: {
                after: autoCreateFn,
              },
            },
          },
        },
      };
    },
    endpoints: {
      credit: createCreditEndpoint(options),
    },
    $Infer: {
      options: options as TokenWalletOptions | undefined,
    },
    $ERROR_CODES: TOKEN_WALLET_ERROR_CODES,
  };
};

export type {
  TokenWalletOptions,
  TopUpContext,
  WalletAccount,
  WalletTransaction,
  WalletEntry,
  WalletHold,
  WalletBalance,
  CreditRequest,
  CreditResponse,
  AccountType,
  TransactionType,
  EntryType,
  BalanceType,
} from "./types.js";
export { TOKEN_WALLET_ERROR_CODES } from "./error-codes.js";

declare module "better-auth" {
  interface BetterAuthPluginRegistry<AuthOptions, Options> {
    "token-wallet": ReturnType<typeof tokenWallet>;
  }
}
