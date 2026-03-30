import { describe, it, expect, vi } from "vitest";
import { credit } from "../wallet-service/index.js";
import { createTestAdapter } from "./helpers/test-setup.js";

describe("wallet-service credit", () => {
  it("returns { ok: true, data: { transaction, entries, balance } } on success", async () => {
    const adapter = createTestAdapter();
    const result = await credit(adapter, {
      amount: 100,
      idempotencyKey: "svc-test-1",
      referenceKey: "user:user-1",
      userId: "user-1",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.transaction).toBeDefined();
    expect(result.data.transaction.transactionType).toBe("CREDIT_TOPUP");
    expect(result.data.entries).toHaveLength(2);
    expect(result.data.balance.posted).toBe(100);
    expect(result.data.balance.available).toBe(100);
  });

  it("returns { ok: false, error: 'INVALID_AMOUNT' } for zero amount", async () => {
    const adapter = createTestAdapter();
    const result = await credit(adapter, {
      amount: 0,
      idempotencyKey: "svc-test-2",
      referenceKey: "user:user-2",
      userId: "user-2",
    });

    expect(result).toEqual({ ok: false, error: "INVALID_AMOUNT" });
  });

  it("returns { ok: false, error: 'MISSING_IDEMPOTENCY_KEY' } for empty key", async () => {
    const adapter = createTestAdapter();
    const result = await credit(adapter, {
      amount: 100,
      idempotencyKey: "",
      referenceKey: "user:user-3",
      userId: "user-3",
    });

    expect(result).toEqual({ ok: false, error: "MISSING_IDEMPOTENCY_KEY" });
  });

  it("returns original result on duplicate idempotency key (no double credit)", async () => {
    const adapter = createTestAdapter();
    const first = await credit(adapter, {
      amount: 100,
      idempotencyKey: "svc-dup-1",
      referenceKey: "user:user-4",
      userId: "user-4",
    });

    expect(first.ok).toBe(true);

    const second = await credit(adapter, {
      amount: 200,
      idempotencyKey: "svc-dup-1",
      referenceKey: "user:user-4",
      userId: "user-4",
    });

    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.data.balance.posted).toBe(100);
    expect(second.data.transaction.idempotencyKey).toBe("svc-dup-1");
  });

  it("fires onTopUp hook with correct context", async () => {
    const onTopUp = vi.fn();
    const adapter = createTestAdapter();
    const result = await credit(
      adapter,
      {
        amount: 100,
        idempotencyKey: "svc-hook-1",
        referenceKey: "user:user-5",
        userId: "user-5",
      },
      { hooks: { onTopUp } },
    );

    expect(result.ok).toBe(true);
    expect(onTopUp).toHaveBeenCalledOnce();
    const hookCtx = onTopUp.mock.calls[0]![0];
    expect(hookCtx.transaction.transactionType).toBe("CREDIT_TOPUP");
    expect(hookCtx.entries).toHaveLength(2);
    expect(hookCtx.user.id).toBe("user-5");
    expect(hookCtx.wallet).toBeDefined();
  });
});
