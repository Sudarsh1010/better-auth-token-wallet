import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError,
} from "better-auth/api";
import * as z from "zod";
import { getOrCreateUserWallet } from "../wallet-account/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import type { WalletAdapter } from "../ledger/index.js";

function getAdapter(ctx: {
  context: Record<string, unknown>;
}): WalletAdapter {
  return ctx.context["adapter"] as unknown as WalletAdapter;
}

export function createTransactionsEndpoint(): ReturnType<typeof createAuthEndpoint<any, any, any>> {
  return createAuthEndpoint(
    "/token-wallet/transactions",
    {
      method: "GET",
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).optional(),
        offset: z.coerce.number().int().min(0).optional(),
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
      const q = ctx.query ?? {};
      const referenceType = q.referenceType ?? "user";
      const referenceId = q.referenceId ?? user.id;
      const limit = q.limit ?? 20;
      const offset = q.offset ?? 0;

      if (referenceType === "organization") {
        throw new APIError("FORBIDDEN", {
          ...TOKEN_WALLET_ERROR_CODES.ORG_NOT_SUPPORTED,
        });
      }

      const referenceKey = `user:${referenceId}`;
      const wallet = await getOrCreateUserWallet(adapter, referenceKey, 0);

      const entries = await adapter.findMany({
        model: "walletEntry",
        where: [{ field: "accountId", value: wallet.id }],
      });

      const seenTxIds = new Set<string>();
      for (const entry of entries) {
        seenTxIds.add(entry.transactionId as string);
      }

      const allTransactions = await Promise.all(
        Array.from(seenTxIds).map(async (txId) => {
          return adapter.findOne({
            model: "walletTransaction",
            where: [{ field: "id", value: txId }],
          });
        }),
      );

      allTransactions.sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt as string).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt as string).getTime() : 0;
        return bTime - aTime;
      });

      const total = allTransactions.length;
      const paged = allTransactions.slice(offset, offset + limit);

      const txsWithEntries = await Promise.all(
        paged.filter((tx): tx is Record<string, unknown> => tx !== null).map(async (tx) => {
          const txEntries = await adapter.findMany({
            model: "walletEntry",
            where: [{ field: "transactionId", value: tx.id }],
          });
          return { ...tx, entries: txEntries };
        }),
      );

      return ctx.json({
        transactions: txsWithEntries,
        total,
        limit,
        offset,
      });
    },
  );
}
