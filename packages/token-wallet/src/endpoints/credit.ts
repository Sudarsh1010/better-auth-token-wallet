import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError,
} from "better-auth/api";
import * as z from "zod";
import { createTransaction } from "../ledger/index.js";
import { checkOrStore } from "../idempotency/index.js";
import { creditBalance, getBalance } from "../balance/index.js";
import { getOrCreateUserWallet } from "../wallet-account/index.js";
import { SYSTEM_ACCOUNT_IDS, seedSystemAccounts } from "../system-accounts/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import type { TokenWalletOptions, TopUpContext } from "../types.js";
import type { WalletAdapter } from "../ledger/index.js";

function getAdapter(ctx: {
  context: Record<string, unknown>;
}): WalletAdapter {
  return ctx.context["adapter"] as unknown as WalletAdapter;
}

function rewriteError(error: Error): APIError | null {
  const msg = error.message;
  if (msg === TOKEN_WALLET_ERROR_CODES.INVALID_AMOUNT.code) {
    return new APIError("BAD_REQUEST", {
      ...TOKEN_WALLET_ERROR_CODES.INVALID_AMOUNT,
    });
  }
  if (msg === TOKEN_WALLET_ERROR_CODES.MISSING_IDEMPOTENCY_KEY.code) {
    return new APIError("BAD_REQUEST", {
      ...TOKEN_WALLET_ERROR_CODES.MISSING_IDEMPOTENCY_KEY,
    });
  }
  if (
    msg === TOKEN_WALLET_ERROR_CODES.SYSTEM_ACCOUNT_MISSING.code ||
    msg === TOKEN_WALLET_ERROR_CODES.CREDIT_FAILED.code
  ) {
    return new APIError("INTERNAL_SERVER_ERROR", {
      code: msg,
      message: TOKEN_WALLET_ERROR_CODES.CREDIT_FAILED.message,
    });
  }
  return null;
}

export function createCreditEndpoint(
  options?: TokenWalletOptions,
): ReturnType<typeof createAuthEndpoint<any, any, any>> {
  return createAuthEndpoint(
    "/token-wallet/credit",
    {
      method: "POST",
      body: z.object({
        amount: z.number().int().positive(),
        idempotencyKey: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
      }),
      use: [sessionMiddleware],
    },
    async (ctx) => {
      const session = ctx.context.session;
      if (!session) {
        throw new APIError("UNAUTHORIZED", { message: "Not authenticated" });
      }

      const user = session.user;
      const adapter = getAdapter(ctx);
      const referenceKey = `user:${user.id}`;
      const { amount, idempotencyKey, metadata } = ctx.body;

      try {
        const result = await checkOrStore(
          adapter,
          idempotencyKey,
          async () => {
            await seedSystemAccounts(adapter);

            const userWallet = await getOrCreateUserWallet(
              adapter,
              referenceKey,
              options?.wallet?.initialBalance ?? 0,
            );

            const revenueAccount = await adapter.findOne({
              model: "walletAccount",
              where: [{ field: "id", value: SYSTEM_ACCOUNT_IDS.REVENUE }],
            });

            if (!revenueAccount) {
              throw new Error(
                TOKEN_WALLET_ERROR_CODES.SYSTEM_ACCOUNT_MISSING.code,
              );
            }

            const txResult = await createTransaction(adapter, {
              idempotencyKey,
              transactionType: "CREDIT_TOPUP",
              entries: [
                {
                  accountId: SYSTEM_ACCOUNT_IDS.REVENUE,
                  entryType: "DEBIT" as const,
                  amount,
                  balanceType: "posted" as const,
                },
                {
                  accountId: userWallet.id,
                  entryType: "CREDIT" as const,
                  amount,
                  balanceType: "posted" as const,
                },
              ],
              ...(metadata !== undefined ? { metadata } : {}),
              referenceKey,
            });

            await creditBalance(adapter, userWallet.id, amount);
            await creditBalance(adapter, SYSTEM_ACCOUNT_IDS.REVENUE, amount);

            if (options?.hooks?.onTopUp) {
              await options.hooks.onTopUp({
                transaction:
                  txResult.transaction as unknown as TopUpContext["transaction"],
                entries:
                  txResult.entries as unknown as TopUpContext["entries"],
                user: { id: user.id as string },
                wallet: userWallet,
              });
            }

            return {
              transaction: txResult.transaction,
              entries: txResult.entries,
              userWallet,
            };
          },
        );

        const balance = await getBalance(adapter, referenceKey);

        return ctx.json({
          transaction: result.transaction,
          entries: result.entries,
          balance,
        });
      } catch (error) {
        if (error instanceof Error) {
          const apiError = rewriteError(error);
          if (apiError) throw apiError;
        }
        throw error;
      }
    },
  );
}
