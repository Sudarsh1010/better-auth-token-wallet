import type { WalletAdapter } from "../ledger/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";

export async function checkOrStore<T>(
  adapter: WalletAdapter,
  idempotencyKey: string,
  operation: () => Promise<T>,
): Promise<T> {
  if (!idempotencyKey || idempotencyKey.trim() === "") {
    throw new Error(TOKEN_WALLET_ERROR_CODES.MISSING_IDEMPOTENCY_KEY.code);
  }

  const existing = await adapter.findOne({
    model: "walletTransaction",
    where: [{ field: "idempotencyKey", value: idempotencyKey }],
  });

  if (existing) {
    const entries = await adapter.findMany({
      model: "walletEntry",
      where: [{ field: "transactionId", value: existing.id }],
    });
    return {
      transaction: existing,
      entries,
      userWallet: null,
    } as unknown as T;
  }

  return operation();
}
