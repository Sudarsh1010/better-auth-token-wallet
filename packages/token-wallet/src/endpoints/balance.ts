import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError,
} from "better-auth/api";
import * as z from "zod";
import { getBalance } from "../balance/index.js";
import { getOrCreateUserWallet } from "../wallet-account/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import type { WalletAdapter } from "../ledger/index.js";

function getAdapter(ctx: {
  context: Record<string, unknown>;
}): WalletAdapter {
  return ctx.context["adapter"] as unknown as WalletAdapter;
}

export function createBalanceEndpoint(): ReturnType<
  typeof createAuthEndpoint<any, any, any>
> {
  return createAuthEndpoint(
    "/token-wallet/balance",
    {
      method: "GET",
      query: z.object({
        referenceType: z.string().optional(),
        referenceId: z.string().optional(),
      }),
      use: [sessionMiddleware],
    },
    async (ctx) => {
      const session = ctx.context.session;
      if (!session) {
        throw new APIError("UNAUTHORIZED", { message: "Not authenticated" });
      }

      const user = session.user;
      const adapter = getAdapter(ctx);
      const referenceType = ctx.query?.referenceType ?? "user";
      const referenceId = ctx.query?.referenceId ?? user.id;

      if (referenceType === "organization") {
        throw new APIError("FORBIDDEN", {
          ...TOKEN_WALLET_ERROR_CODES.ORG_NOT_SUPPORTED,
        });
      }

      const referenceKey = `user:${referenceId}`;
      await getOrCreateUserWallet(adapter, referenceKey, 0);
      const balance = await getBalance(adapter, referenceKey);

      return ctx.json({
        posted: balance.posted,
        pending: balance.pending,
        available: balance.available,
      });
    },
  );
}
