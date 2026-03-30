import type { WalletAdapter } from "./ledger/index.js";

export type { WalletAdapter };

export function getAdapter(ctx: {
  context: Record<string, unknown>;
}): WalletAdapter {
  return ctx.context["adapter"] as unknown as WalletAdapter;
}
