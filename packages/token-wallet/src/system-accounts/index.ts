import type { WalletAdapter } from "../ledger/index.js";

export const SYSTEM_ACCOUNT_IDS = {
  REVENUE: "sys_revenue",
  ESCROW: "sys_escrow",
  RESERVE: "sys_reserve",
} as const;

export type SystemAccountId =
  (typeof SYSTEM_ACCOUNT_IDS)[keyof typeof SYSTEM_ACCOUNT_IDS];

const SYSTEM_ACCOUNT_CONFIGS: Array<{
  id: string;
  type: string;
  referenceKey: string;
}> = [
  {
    id: SYSTEM_ACCOUNT_IDS.REVENUE,
    type: "REVENUE",
    referenceKey: "system:REVENUE",
  },
  {
    id: SYSTEM_ACCOUNT_IDS.ESCROW,
    type: "ESCROW",
    referenceKey: "system:ESCROW",
  },
  {
    id: SYSTEM_ACCOUNT_IDS.RESERVE,
    type: "RESERVE",
    referenceKey: "system:RESERVE",
  },
];

export async function seedSystemAccounts(
  adapter: WalletAdapter,
): Promise<void> {
  for (const config of SYSTEM_ACCOUNT_CONFIGS) {
    const existing = await adapter.findOne({
      model: "walletAccount",
      where: [{ field: "id", value: config.id }],
    });

    if (existing) continue;

    await adapter.create({
      model: "walletAccount",
      data: {
        id: config.id,
        referenceKey: config.referenceKey,
        referenceType: "system",
        accountType: `SYSTEM_${config.type}`,
        postedBalance: 0,
        pendingDebits: 0,
        availableBalance: 0,
        lockVersion: 0,
        currency: "token",
      },
      forceAllowId: true,
    });
  }
}
