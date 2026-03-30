import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import type { EntryType, BalanceType } from "../types.js";

export interface WalletAdapter {
  findOne(args: {
    model: string;
    where: Array<{ field: string; value: unknown }>;
  }): Promise<Record<string, unknown> | null>;

  findMany(args: {
    model: string;
    where?: Array<{ field: string; value: unknown }>;
    sortBy?: { field: string; direction: "asc" | "desc" };
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>[]>;

  create(args: {
    model: string;
    data: Record<string, unknown>;
    forceAllowId?: boolean;
  }): Promise<Record<string, unknown>>;

  update(args: {
    model: string;
    update: Record<string, unknown>;
    where: Array<{ field: string; value: unknown }>;
  }): Promise<Record<string, unknown>>;

  transaction<T>(
    callback: (tx: Omit<WalletAdapter, "transaction">) => Promise<T>,
  ): Promise<T>;

  count(args: {
    model: string;
    where?: Array<{ field: string; value: unknown }>;
  }): Promise<number>;
}

export function validateBalance(
  entries: Array<{ entryType: EntryType; amount: number }>,
): boolean {
  const debitSum = entries
    .filter((e) => e.entryType === "DEBIT")
    .reduce((sum, e) => sum + e.amount, 0);

  const creditSum = entries
    .filter((e) => e.entryType === "CREDIT")
    .reduce((sum, e) => sum + e.amount, 0);

  return debitSum === creditSum;
}

export async function createTransaction(
  adapter: WalletAdapter,
  params: {
    idempotencyKey: string;
    transactionType: string;
    entries: Array<{
      accountId: string;
      entryType: EntryType;
      amount: number;
      balanceType: BalanceType;
    }>;
    metadata?: Record<string, unknown>;
    referenceTxId?: string;
    referenceKey?: string;
  },
  txAdapter?: Omit<WalletAdapter, "transaction">,
): Promise<{
  transaction: Record<string, unknown>;
  entries: Record<string, unknown>[];
}> {
  if (params.entries.length === 0) {
    throw new Error("Entries cannot be empty");
  }

  if (!validateBalance(params.entries)) {
    throw new Error(TOKEN_WALLET_ERROR_CODES.CREDIT_FAILED.code);
  }

  for (const entry of params.entries) {
    if (!Number.isInteger(entry.amount) || entry.amount <= 0) {
      throw new Error(TOKEN_WALLET_ERROR_CODES.INVALID_AMOUNT.code);
    }
  }

  const execute = async (
    tx: Omit<WalletAdapter, "transaction">,
  ) => {
    const transactionData: Record<string, unknown> = {
      idempotencyKey: params.idempotencyKey,
      transactionType: params.transactionType,
      status: "posted",
    };
    if (params.metadata !== undefined) {
      transactionData.metadata = params.metadata;
    }
    if (params.referenceTxId !== undefined) {
      transactionData.referenceTxId = params.referenceTxId;
    }
    if (params.referenceKey !== undefined) {
      transactionData.referenceKey = params.referenceKey;
    }

    const transaction = await tx.create({
      model: "walletTransaction",
      data: transactionData,
    });

    const createdEntries: Record<string, unknown>[] = [];
    for (const entry of params.entries) {
      const created = await tx.create({
        model: "walletEntry",
        data: {
          transactionId: transaction.id,
          accountId: entry.accountId,
          entryType: entry.entryType,
          amount: entry.amount,
          balanceType: entry.balanceType,
        },
      });
      createdEntries.push(created);
    }

    return { transaction, entries: createdEntries };
  };

  if (txAdapter) {
    return execute(txAdapter);
  }

  return adapter.transaction(execute);
}
