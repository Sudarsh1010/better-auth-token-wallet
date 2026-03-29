import { describe, it, expect, beforeEach } from "vitest";
import { createTestAdapter } from "./helpers/test-setup.js";
import type { WalletAdapter } from "../ledger/index.js";
import { seedSystemAccounts, SYSTEM_ACCOUNT_IDS } from "../system-accounts/index.js";

describe("system-accounts module", () => {
  let adapter: WalletAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  it("creates all three system accounts", async () => {
    await seedSystemAccounts(adapter);

    const revenue = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: SYSTEM_ACCOUNT_IDS.REVENUE }],
    });
    const escrow = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: SYSTEM_ACCOUNT_IDS.ESCROW }],
    });
    const reserve = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: SYSTEM_ACCOUNT_IDS.RESERVE }],
    });

    expect(revenue).toBeDefined();
    expect(escrow).toBeDefined();
    expect(reserve).toBeDefined();
  });

  it("sets correct account types", async () => {
    await seedSystemAccounts(adapter);

    const revenue = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: SYSTEM_ACCOUNT_IDS.REVENUE }],
    });
    const escrow = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: SYSTEM_ACCOUNT_IDS.ESCROW }],
    });
    const reserve = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: SYSTEM_ACCOUNT_IDS.RESERVE }],
    });

    expect(revenue?.accountType).toBe("SYSTEM_REVENUE");
    expect(escrow?.accountType).toBe("SYSTEM_ESCROW");
    expect(reserve?.accountType).toBe("SYSTEM_RESERVE");
  });

  it("initializes all balances to zero", async () => {
    await seedSystemAccounts(adapter);

    for (const id of Object.values(SYSTEM_ACCOUNT_IDS)) {
      const account = await adapter.findOne({
        model: "walletAccount",
        where: [{ field: "id", value: id }],
      });
      expect(account?.postedBalance).toBe(0);
      expect(account?.pendingDebits).toBe(0);
      expect(account?.availableBalance).toBe(0);
    }
  });

  it("is idempotent — seeding twice does not duplicate", async () => {
    await seedSystemAccounts(adapter);
    await seedSystemAccounts(adapter);

    const all = await adapter.findMany({
      model: "walletAccount",
      where: [{ field: "referenceType", value: "system" }],
    });

    const uniqueIds = new Set(all.map((a) => a.id));
    expect(uniqueIds.size).toBe(3);
  });
});
