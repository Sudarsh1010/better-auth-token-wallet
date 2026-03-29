import { describe, it, expect, beforeEach } from "vitest";
import { createTestAdapter } from "./helpers/test-setup.js";
import type { WalletAdapter } from "../ledger/index.js";
import { creditBalance, getBalance, validateAmount } from "../balance/index.js";
import { seedSystemAccounts } from "../system-accounts/index.js";
import { getOrCreateUserWallet } from "../wallet-account/index.js";

describe("balance module", () => {
  let adapter: WalletAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  describe("validateAmount", () => {
    it("accepts positive integers", () => {
      expect(() => validateAmount(1)).not.toThrow();
      expect(() => validateAmount(100)).not.toThrow();
    });

    it("rejects zero", () => {
      expect(() => validateAmount(0)).toThrow("INVALID_AMOUNT");
    });

    it("rejects negative numbers", () => {
      expect(() => validateAmount(-5)).toThrow("INVALID_AMOUNT");
    });

    it("rejects decimals", () => {
      expect(() => validateAmount(1.5)).toThrow("INVALID_AMOUNT");
    });
  });

  describe("creditBalance", () => {
    it("credits posted and available balance", async () => {
      await seedSystemAccounts(adapter);
      await creditBalance(adapter, "sys_revenue", 500);

      const account = await adapter.findOne({
        model: "walletAccount",
        where: [{ field: "id", value: "sys_revenue" }],
      });
      expect(account?.postedBalance).toBe(500);
      expect(account?.availableBalance).toBe(500);
    });

    it("throws WALLET_NOT_FOUND for missing account", async () => {
      await expect(
        creditBalance(adapter, "nonexistent", 100),
      ).rejects.toThrow("WALLET_NOT_FOUND");
    });

    it("accumulates multiple credits", async () => {
      await seedSystemAccounts(adapter);
      await creditBalance(adapter, "sys_revenue", 100);
      await creditBalance(adapter, "sys_revenue", 200);

      const account = await adapter.findOne({
        model: "walletAccount",
        where: [{ field: "id", value: "sys_revenue" }],
      });
      expect(account?.postedBalance).toBe(300);
    });
  });

  describe("getBalance", () => {
    it("returns balance for existing wallet", async () => {
      await getOrCreateUserWallet(adapter, "user:alice", 250);
      const balance = await getBalance(adapter, "user:alice");

      expect(balance).toEqual({
        posted: 250,
        pending: 0,
        available: 250,
      });
    });

    it("throws WALLET_NOT_FOUND for missing wallet", async () => {
      await expect(getBalance(adapter, "user:ghost")).rejects.toThrow(
        "WALLET_NOT_FOUND",
      );
    });
  });
});
