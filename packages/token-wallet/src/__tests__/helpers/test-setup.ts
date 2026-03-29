import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { tokenWallet } from "../../index.js";
import type { WalletAdapter } from "../../ledger/index.js";

export function createTestAdapter(): WalletAdapter {
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
