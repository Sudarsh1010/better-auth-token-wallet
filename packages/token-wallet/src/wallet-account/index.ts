import { WalletAdapter } from "../ledger/index.js";
import type { WalletAccount } from "../types.js";

/**
 * Find an existing wallet by referenceKey
 */
export async function findWalletByReference(
  adapter: WalletAdapter,
  referenceKey: string,
): Promise<WalletAccount | null> {
  const wallet = await adapter.findOne({
    model: "walletAccount",
    where: [{ field: "referenceKey", value: referenceKey }],
  });
  return wallet as WalletAccount | null;
}

/**
 * Find-or-create a user wallet
 */
export async function getOrCreateUserWallet(
  adapter: WalletAdapter,
  referenceKey: string,
  initialBalance?: number,
): Promise<WalletAccount> {
  let wallet = await findWalletByReference(adapter, referenceKey);
  if (wallet) return wallet;

  const walletData = {
    referenceKey,
    referenceType: "user",
    accountType: "USER_WALLET",
    postedBalance: initialBalance ?? 0,
    pendingDebits: 0,
    availableBalance: initialBalance ?? 0,
    lockVersion: 0,
    currency: "token",
  };

  try {
    wallet = (await adapter.create({
      model: "walletAccount",
      data: walletData,
    })) as unknown as WalletAccount;
    return wallet;
  } catch (error) {
    if (
      error instanceof Error &&
      (String(error.message).includes("duplicate") ||
        String(error.message).includes("constraint"))
    ) {
      wallet = await findWalletByReference(adapter, referenceKey);
      if (wallet) return wallet;
    }
    throw error;
  }
}

/**
 * Register the auto-create hook for databaseHooks.user.create.after
 *
 * This hook automatically creates a user wallet when a new user is created.
 */
export function registerAutoCreateHook(
  adapter: WalletAdapter,
  options?: {
    autoCreate?: boolean;
    initialBalance?: number;
  },
): (user: { id: string }) => Promise<void> {
  const { autoCreate = true, initialBalance } = options ?? {};

  return async (user: { id: string }) => {
    if (!autoCreate) return;
    const referenceKey = `user:${user.id}`;
    await getOrCreateUserWallet(adapter, referenceKey, initialBalance);
  };
}
