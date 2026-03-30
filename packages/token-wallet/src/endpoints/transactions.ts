import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError,
} from "better-auth/api";
import * as z from "zod";
import { findWalletByReference } from "../wallet-account/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import { getAdapter } from "../adapter.js";

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
      const wallet = await findWalletByReference(adapter, referenceKey);
      if (!wallet) {
        throw new APIError("NOT_FOUND", {
          ...TOKEN_WALLET_ERROR_CODES.WALLET_NOT_FOUND,
        });
      }

      const userEntries = await adapter.findMany({
        model: "walletEntry",
        where: [{ field: "accountId", value: wallet.id }],
      });

      const seenTxIds = new Set<string>();
      for (const entry of userEntries) {
        seenTxIds.add(entry.transactionId as string);
      }

      const txIdArray = Array.from(seenTxIds);

      const [allTransactions, entriesResults] = await Promise.all([
        Promise.all(
          txIdArray.map((txId) =>
            adapter.findOne({
              model: "walletTransaction",
              where: [{ field: "id", value: txId }],
            }),
          ),
        ),
        Promise.all(
          txIdArray.map(async (txId) => {
            const entries = await adapter.findMany({
              model: "walletEntry",
              where: [{ field: "transactionId", value: txId }],
            });
            return [txId, entries] as const;
          }),
        ),
      ]);

      const entriesByTxId = new Map(entriesResults);

      allTransactions.sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt as string).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt as string).getTime() : 0;
        return bTime - aTime;
      });

      const total = allTransactions.length;
      const paged = allTransactions.slice(offset, offset + limit);

      const txsWithEntries = paged
        .filter((tx): tx is Record<string, unknown> => tx !== null)
        .map((tx) => ({
          ...tx,
          entries: entriesByTxId.get(tx.id as string) ?? [],
        }));

      return ctx.json({
        transactions: txsWithEntries,
        total,
        limit,
        offset,
      });
    },
  );
}
