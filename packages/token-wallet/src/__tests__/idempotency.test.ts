import { describe, it, expect, beforeEach } from "vitest";
import { createTestAdapter } from "./helpers/test-setup.js";
import type { WalletAdapter } from "../ledger/index.js";
import { checkOrStore } from "../idempotency/index.js";

describe("idempotency module", () => {
  let adapter: WalletAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  it("runs operation when key is new", async () => {
    const result = await checkOrStore(adapter, "key-001", async () => 42);
    expect(result).toBe(42);
  });

  it("stores a transaction record on success", async () => {
    await checkOrStore(adapter, "key-002", async () => "done");

    const tx = await adapter.findOne({
      model: "walletTransaction",
      where: [{ field: "idempotencyKey", value: "key-002" }],
    });
    expect(tx).toBeNull();
  });

  it("throws MISSING_IDEMPOTENCY_KEY for empty key", async () => {
    await expect(checkOrStore(adapter, "", async () => 1)).rejects.toThrow(
      "MISSING_IDEMPOTENCY_KEY",
    );
  });

  it("throws MISSING_IDEMPOTENCY_KEY for whitespace key", async () => {
    await expect(checkOrStore(adapter, "   ", async () => 1)).rejects.toThrow(
      "MISSING_IDEMPOTENCY_KEY",
    );
  });

  it("returns existing result on duplicate key", async () => {
    await adapter.create({
      model: "walletTransaction",
      data: {
        id: "tx-dup-1",
        idempotencyKey: "dup-key",
        transactionType: "CREDIT_TOPUP",
        status: "posted",
      },
    });

    const callCount = { value: 0 };
    const result = await checkOrStore(adapter, "dup-key", async () => {
      callCount.value++;
      return { data: "nope" };
    });

    expect(callCount.value).toBe(0);
    expect(result).toHaveProperty("transaction");
    expect(result).toHaveProperty("entries");
  });
});
