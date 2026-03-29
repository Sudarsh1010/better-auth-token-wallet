import { describe, it, expect, beforeEach } from "vitest";
import { createTestAdapter } from "./helpers/test-setup.js";
import type { WalletAdapter } from "../ledger/index.js";
import {
  findWalletByReference,
  getOrCreateUserWallet,
  registerAutoCreateHook,
} from "../wallet-account/index.js";

describe("wallet-account module", () => {
  let adapter: WalletAdapter;

  beforeEach(() => {
    adapter = createTestAdapter();
  });

  describe("findWalletByReference", () => {
    it("returns null when wallet does not exist", async () => {
      const wallet = await findWalletByReference(adapter, "user:test123");
      expect(wallet).toBeNull();
    });

    it("returns wallet when wallet exists", async () => {
      await getOrCreateUserWallet(adapter, "user:test123", 100);
      const wallet = await findWalletByReference(adapter, "user:test123");
      expect(wallet).toBeDefined();
      expect(wallet?.referenceKey).toBe("user:test123");
      expect(wallet?.accountType).toBe("USER_WALLET");
    });
  });

  describe("getOrCreateUserWallet", () => {
    it("creates USER_WALLET with zero initial balance", async () => {
      const wallet = await getOrCreateUserWallet(adapter, "user:test123");

      expect(wallet).toBeDefined();
      expect(wallet?.referenceKey).toBe("user:test123");
      expect(wallet?.referenceType).toBe("user");
      expect(wallet?.accountType).toBe("USER_WALLET");
      expect(wallet?.postedBalance).toBe(0);
      expect(wallet?.pendingDebits).toBe(0);
      expect(wallet?.availableBalance).toBe(0);
      expect(wallet?.lockVersion).toBe(0);
      expect(wallet?.currency).toBe("token");
    });

    it("creates USER_WALLET with custom initial balance", async () => {
      const wallet = await getOrCreateUserWallet(
        adapter,
        "user:test123",
        1000,
      );

      expect(wallet).toBeDefined();
      expect(wallet?.postedBalance).toBe(1000);
      expect(wallet?.availableBalance).toBe(1000);
    });

    it("find-or-create returns existing wallet", async () => {
      const wallet1 = await getOrCreateUserWallet(adapter, "user:test123", 500);
      const wallet2 = await getOrCreateUserWallet(adapter, "user:test123", 1000);

      expect(wallet1).toEqual(wallet2);
      expect(wallet1?.postedBalance).toBe(500);
    });

    it("find-or-create creates new wallet if absent", async () => {
      const wallet1 = await getOrCreateUserWallet(adapter, "user:test123", 500);
      const wallet2 = await getOrCreateUserWallet(adapter, "user:test456", 300);

      expect(wallet1).toBeDefined();
      expect(wallet2).toBeDefined();
      expect(wallet1?.referenceKey).toBe("user:test123");
      expect(wallet2?.referenceKey).toBe("user:test456");
    });
  });

  describe("registerAutoCreateHook", () => {
    it("creates wallet on signup when autoCreate is true", async () => {
      const hook = registerAutoCreateHook(adapter, {
        autoCreate: true,
        initialBalance: 0,
      });

      await hook({ id: "user1" });

      const wallet = await findWalletByReference(adapter, "user:user1");
      expect(wallet).toBeDefined();
      expect(wallet?.referenceKey).toBe("user:user1");
    });

    it("respects autoCreate: false", async () => {
      const hook = registerAutoCreateHook(adapter, {
        autoCreate: false,
        initialBalance: 0,
      });

      await hook({ id: "user2" });

      const wallet = await findWalletByReference(adapter, "user:user2");
      expect(wallet).toBeNull();
    });

    it("passes initialBalance to created wallet", async () => {
      const hook = registerAutoCreateHook(adapter, {
        autoCreate: true,
        initialBalance: 500,
      });

      await hook({ id: "user3" });

      const wallet = await findWalletByReference(adapter, "user:user3");
      expect(wallet?.postedBalance).toBe(500);
      expect(wallet?.availableBalance).toBe(500);
    });
  });

  describe("concurrency", () => {
    it("unique referenceKey enforced", async () => {
      await getOrCreateUserWallet(adapter, "user:test123", 100);
      await getOrCreateUserWallet(adapter, "user:test123", 200);

      const wallet = await findWalletByReference(adapter, "user:test123");
      expect(wallet).toBeDefined();
      expect(wallet?.postedBalance).toBe(100);
    });
  });
});
