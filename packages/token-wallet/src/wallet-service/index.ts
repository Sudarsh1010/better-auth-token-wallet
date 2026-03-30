import type { WalletAdapter } from "../ledger/index.js";
import { createTransaction } from "../ledger/index.js";
import { checkOrStore } from "../idempotency/index.js";
import { creditBalance, getBalance } from "../balance/index.js";
import { getOrCreateUserWallet } from "../wallet-account/index.js";
import { SYSTEM_ACCOUNT_IDS, seedSystemAccounts } from "../system-accounts/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import type { TokenWalletErrorCode } from "../error-codes.js";
import type { TokenWalletOptions, TopUpContext, WalletBalance } from "../types.js";

export type WalletServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: TokenWalletErrorCode };

export interface CreditInput {
  amount: number;
  idempotencyKey: string;
  referenceKey: string;
  userId: string;
  metadata?: Record<string, unknown>;
}

export interface CreditResult {
  transaction: Record<string, unknown>;
  entries: Record<string, unknown>[];
  balance: WalletBalance;
}

const VALID_ERROR_CODES = new Set<string>(
  Object.values(TOKEN_WALLET_ERROR_CODES).map((e) => e.code),
);

export async function credit(
  adapter: WalletAdapter,
  input: CreditInput,
  options?: TokenWalletOptions,
): Promise<WalletServiceResult<CreditResult>> {
  const { amount, idempotencyKey, referenceKey, userId, metadata } = input;

  if (!Number.isInteger(amount) || amount <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }

  if (!idempotencyKey || idempotencyKey.trim() === "") {
    return { ok: false, error: "MISSING_IDEMPOTENCY_KEY" };
  }

  try {
    const result = await checkOrStore(adapter, idempotencyKey, async () => {
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
        throw new Error(TOKEN_WALLET_ERROR_CODES.SYSTEM_ACCOUNT_MISSING.code);
      }

      return adapter.transaction(async (tx) => {
        const txResult = await createTransaction(
          adapter,
          {
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
          },
          tx,
        );

        await creditBalance(tx, userWallet.id, amount);
        await creditBalance(tx, SYSTEM_ACCOUNT_IDS.REVENUE, amount);

        if (options?.hooks?.onTopUp) {
          await options.hooks.onTopUp({
            transaction: txResult.transaction as unknown as TopUpContext["transaction"],
            entries: txResult.entries as unknown as TopUpContext["entries"],
            user: { id: userId },
            wallet: userWallet,
          });
        }

        return {
          transaction: txResult.transaction,
          entries: txResult.entries,
          userWallet,
        };
      });
    });

    const balance = await getBalance(adapter, referenceKey);

    return {
      ok: true,
      data: {
        transaction: result.transaction,
        entries: result.entries,
        balance,
      },
    };
  } catch (error) {
    if (error instanceof Error && VALID_ERROR_CODES.has(error.message)) {
      return { ok: false, error: error.message as TokenWalletErrorCode };
    }
    throw error;
  }
}
