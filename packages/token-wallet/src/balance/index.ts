import type { WalletAdapter } from "../ledger/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import type { WalletBalance } from "../types.js";

export function validateAmount(amount: number): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(TOKEN_WALLET_ERROR_CODES.INVALID_AMOUNT.code);
  }
}

export async function creditBalance(
  adapter: Omit<WalletAdapter, "transaction">,
  accountId: string,
  amount: number,
): Promise<void> {
  validateAmount(amount);

  const account = await adapter.findOne({
    model: "walletAccount",
    where: [{ field: "id", value: accountId }],
  });

  if (!account) {
    throw new Error(TOKEN_WALLET_ERROR_CODES.WALLET_NOT_FOUND.code);
  }

  const currentPosted = (account.postedBalance as number) ?? 0;
  const currentAvailable = (account.availableBalance as number) ?? 0;
  const currentLockVersion = (account.lockVersion as number) ?? 0;
  const expectedLockVersion = currentLockVersion + 1;

  await adapter.update({
    model: "walletAccount",
    update: {
      postedBalance: currentPosted + amount,
      availableBalance: currentAvailable + amount,
      lockVersion: expectedLockVersion,
    },
    where: [
      { field: "id", value: accountId },
      { field: "lockVersion", value: currentLockVersion },
    ],
  });

  const updated = await adapter.findOne({
    model: "walletAccount",
    where: [{ field: "id", value: accountId }],
  });

  if (!updated || (updated.lockVersion as number) !== expectedLockVersion) {
    throw new Error(TOKEN_WALLET_ERROR_CODES.CONCURRENCY_CONFLICT.code);
  }
}

export async function getBalance(
  adapter: WalletAdapter,
  referenceKey: string,
): Promise<WalletBalance> {
  const account = await adapter.findOne({
    model: "walletAccount",
    where: [{ field: "referenceKey", value: referenceKey }],
  });

  if (!account) {
    throw new Error(TOKEN_WALLET_ERROR_CODES.WALLET_NOT_FOUND.code);
  }

  return {
    posted: (account.postedBalance as number) ?? 0,
    pending: (account.pendingDebits as number) ?? 0,
    available: (account.availableBalance as number) ?? 0,
  };
}
