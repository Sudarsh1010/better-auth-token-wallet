import {
  createAuthEndpoint,
  sessionMiddleware,
  APIError,
} from "better-auth/api";
import * as z from "zod";
import { credit } from "../wallet-service/index.js";
import { TOKEN_WALLET_ERROR_CODES } from "../error-codes.js";
import type { TokenWalletErrorCode } from "../error-codes.js";
import type { TokenWalletOptions } from "../types.js";
import { getAdapter } from "../adapter.js";

const ERROR_STATUS_MAP = {
  INVALID_AMOUNT: "BAD_REQUEST",
  MISSING_IDEMPOTENCY_KEY: "BAD_REQUEST",
  CONCURRENCY_CONFLICT: "CONFLICT",
  SYSTEM_ACCOUNT_MISSING: "INTERNAL_SERVER_ERROR",
  CREDIT_FAILED: "INTERNAL_SERVER_ERROR",
  WALLET_NOT_FOUND: "INTERNAL_SERVER_ERROR",
  DUPLICATE_IDEMPOTENCY_KEY: "INTERNAL_SERVER_ERROR",
  ORG_NOT_SUPPORTED: "INTERNAL_SERVER_ERROR",
} as const satisfies Record<TokenWalletErrorCode, string>;

export function createCreditEndpoint(
  options?: TokenWalletOptions,
): ReturnType<typeof createAuthEndpoint<any, any, any>> {
  return createAuthEndpoint(
    "/token-wallet/credit",
    {
      method: "POST",
      body: z.object({
        amount: z.number().int().positive(),
        idempotencyKey: z.string().min(1),
        metadata: z.record(z.unknown()).optional(),
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
      const { amount, idempotencyKey, metadata } = ctx.body;

      const result = await credit(
        adapter,
        {
          amount,
          idempotencyKey,
          metadata,
          referenceKey: `user:${user.id}`,
          userId: user.id as string,
        },
        options,
      );

      if (result.ok) {
        return ctx.json(result.data);
      }

      const status = ERROR_STATUS_MAP[result.error];
      const errorInfo = TOKEN_WALLET_ERROR_CODES[result.error];
      throw new APIError(status, errorInfo);
    },
  );
}
