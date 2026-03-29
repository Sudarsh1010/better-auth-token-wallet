import { describe, it, expect } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import {
  validateBalance,
  createTransaction,
} from "../ledger/index.js";
import type { WalletAdapter } from "../ledger/index.js";
import { tokenWallet } from "../index.js";

function createTestAdapter(): WalletAdapter {
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
    plugins: [tokenWallet()],
  });
  const factory = auth.options.database;
  return factory(auth.options) as WalletAdapter;
}

async function seedAccounts(adapter: WalletAdapter) {
  await adapter.create({
    model: "walletAccount",
    data: {
      id: "sys_revenue",
      referenceKey: "system:REVENUE",
      referenceType: "system",
      accountType: "SYSTEM_REVENUE",
      postedBalance: 0,
      pendingDebits: 0,
      availableBalance: 0,
      lockVersion: 0,
      currency: "token",
    },
    forceAllowId: true,
  });
  await adapter.create({
    model: "walletAccount",
    data: {
      referenceKey: "user:test",
      referenceType: "user",
      accountType: "USER_WALLET",
      postedBalance: 0,
      pendingDebits: 0,
      availableBalance: 0,
      lockVersion: 0,
      currency: "token",
    },
  });
}

describe("ledger: validateBalance", () => {
  it("returns true for balanced DEBIT/CREDIT entries", () => {
    const result = validateBalance([
      { entryType: "DEBIT", amount: 100 },
      { entryType: "CREDIT", amount: 100 },
    ]);
    expect(result).toBe(true);
  });

  it("returns false for unbalanced entries", () => {
    const result = validateBalance([
      { entryType: "DEBIT", amount: 100 },
      { entryType: "CREDIT", amount: 50 },
    ]);
    expect(result).toBe(false);
  });

  it("returns true for empty entries (0 === 0)", () => {
    expect(validateBalance([])).toBe(true);
  });
});

describe("ledger: createTransaction", () => {
  it("creates balanced CREDIT_TOPUP transaction", async () => {
    const adapter = createTestAdapter();
    await seedAccounts(adapter);

    const result = await createTransaction(adapter, {
      idempotencyKey: "topup-001",
      transactionType: "CREDIT_TOPUP",
      entries: [
        { accountId: "sys_revenue", entryType: "DEBIT", amount: 100, balanceType: "posted" },
        { accountId: "user:test", entryType: "CREDIT", amount: 100, balanceType: "posted" },
      ],
    });

    expect(result.transaction).toBeDefined();
    expect(result.transaction.idempotencyKey).toBe("topup-001");
    expect(result.transaction.transactionType).toBe("CREDIT_TOPUP");
    expect(result.transaction.status).toBe("posted");
    expect(result.entries).toHaveLength(2);
  });

  it("rejects unbalanced entries", async () => {
    const adapter = createTestAdapter();
    await seedAccounts(adapter);

    await expect(
      createTransaction(adapter, {
        idempotencyKey: "bad-001",
        transactionType: "CREDIT_TOPUP",
        entries: [
          { accountId: "sys_revenue", entryType: "DEBIT", amount: 100, balanceType: "posted" },
          { accountId: "user:test", entryType: "CREDIT", amount: 50, balanceType: "posted" },
        ],
      }),
    ).rejects.toThrow("CREDIT_FAILED");
  });

  it("creates entries atomically within transaction", async () => {
    const adapter = createTestAdapter();
    await seedAccounts(adapter);

    const result = await createTransaction(adapter, {
      idempotencyKey: "atomic-001",
      transactionType: "CREDIT_TOPUP",
      entries: [
        { accountId: "sys_revenue", entryType: "DEBIT", amount: 200, balanceType: "posted" },
        { accountId: "user:test", entryType: "CREDIT", amount: 200, balanceType: "posted" },
      ],
    });

    expect(result.entries).toHaveLength(2);
    const txId = result.transaction.id;
    expect(result.entries[0].transactionId).toBe(txId);
    expect(result.entries[1].transactionId).toBe(txId);
  });

  it("supports posted balance type", async () => {
    const adapter = createTestAdapter();
    await seedAccounts(adapter);

    const result = await createTransaction(adapter, {
      idempotencyKey: "posted-001",
      transactionType: "CREDIT_TOPUP",
      entries: [
        { accountId: "sys_revenue", entryType: "DEBIT", amount: 50, balanceType: "posted" },
        { accountId: "user:test", entryType: "CREDIT", amount: 50, balanceType: "posted" },
      ],
    });

    expect(result.entries[0].balanceType).toBe("posted");
    expect(result.entries[1].balanceType).toBe("posted");
  });

  it("links entries to transaction and account correctly", async () => {
    const adapter = createTestAdapter();
    await seedAccounts(adapter);

    const result = await createTransaction(adapter, {
      idempotencyKey: "link-001",
      transactionType: "CREDIT_TOPUP",
      entries: [
        { accountId: "sys_revenue", entryType: "DEBIT", amount: 75, balanceType: "posted" },
        { accountId: "user:test", entryType: "CREDIT", amount: 75, balanceType: "posted" },
      ],
    });

    const [debit, credit] = result.entries;
    expect(debit.accountId).toBe("sys_revenue");
    expect(debit.entryType).toBe("DEBIT");
    expect(debit.amount).toBe(75);
    expect(debit.transactionId).toBe(result.transaction.id);

    expect(credit.accountId).toBe("user:test");
    expect(credit.entryType).toBe("CREDIT");
    expect(credit.amount).toBe(75);
    expect(credit.transactionId).toBe(result.transaction.id);
  });

  it("rejects negative, zero, and decimal amounts", async () => {
    const adapter = createTestAdapter();
    await seedAccounts(adapter);

    const makeEntries = (amount: number) => [
      { accountId: "sys_revenue", entryType: "DEBIT" as const, amount, balanceType: "posted" as const },
      { accountId: "user:test", entryType: "CREDIT" as const, amount, balanceType: "posted" as const },
    ];

    await expect(
      createTransaction(adapter, {
        idempotencyKey: "neg-001",
        transactionType: "CREDIT_TOPUP",
        entries: makeEntries(-100),
      }),
    ).rejects.toThrow("INVALID_AMOUNT");

    await expect(
      createTransaction(adapter, {
        idempotencyKey: "zero-001",
        transactionType: "CREDIT_TOPUP",
        entries: makeEntries(0),
      }),
    ).rejects.toThrow("INVALID_AMOUNT");

    await expect(
      createTransaction(adapter, {
        idempotencyKey: "decimal-001",
        transactionType: "CREDIT_TOPUP",
        entries: makeEntries(1.5),
      }),
    ).rejects.toThrow("INVALID_AMOUNT");
  });
});
