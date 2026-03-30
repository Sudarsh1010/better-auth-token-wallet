import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestAdapter } from "./helpers/test-setup.js";
import type { WalletAdapter } from "../ledger/index.js";
import { creditBalance } from "../balance/index.js";
import { seedSystemAccounts } from "../system-accounts/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";

describe("optimistic locking", () => {
  let adapter: WalletAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  it("increments lockVersion from 0 to 1 on first credit", async () => {
    await seedSystemAccounts(adapter);

    const before = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: "sys_revenue" }],
    });
    expect(before?.lockVersion).toBe(0);

    await creditBalance(adapter, "sys_revenue", 500);

    const after = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: "sys_revenue" }],
    });
    expect(after?.lockVersion).toBe(1);
    expect(after?.postedBalance).toBe(500);
  });

  it("increments lockVersion from 1 to 2 on second credit", async () => {
    await seedSystemAccounts(adapter);

    await creditBalance(adapter, "sys_revenue", 100);
    await creditBalance(adapter, "sys_revenue", 200);

    const account = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: "sys_revenue" }],
    });
    expect(account?.lockVersion).toBe(2);
    expect(account?.postedBalance).toBe(300);
  });

  it("accumulates multiple credits with correct lockVersion", async () => {
    await seedSystemAccounts(adapter);

    for (let i = 1; i <= 5; i++) {
      await creditBalance(adapter, "sys_revenue", 100);
    }

    const account = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: "sys_revenue" }],
    });
    expect(account?.lockVersion).toBe(5);
    expect(account?.postedBalance).toBe(500);
  });

  it("throws CONCURRENCY_CONFLICT when lockVersion is stale", async () => {
    await seedSystemAccounts(adapter);
    await creditBalance(adapter, "sys_revenue", 100);

    const findOneSpy = vi.spyOn(adapter, "findOne");
    findOneSpy.mockResolvedValueOnce({
      id: "sys_revenue",
      postedBalance: 100,
      availableBalance: 100,
      pendingDebits: 0,
      lockVersion: 1,
    });
    findOneSpy.mockResolvedValueOnce({
      id: "sys_revenue",
      postedBalance: 100,
      availableBalance: 100,
      pendingDebits: 0,
      lockVersion: 42,
    });

    await expect(
      creditBalance(adapter, "sys_revenue", 50),
    ).rejects.toThrow(TOKEN_WALLET_ERROR_CODES.CONCURRENCY_CONFLICT.code);

    findOneSpy.mockRestore();
  });
});
