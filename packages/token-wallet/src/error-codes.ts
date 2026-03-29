export const TOKEN_WALLET_ERROR_CODES = {
  WALLET_NOT_FOUND: { code: "WALLET_NOT_FOUND", message: "Wallet not found" },
  INVALID_AMOUNT: { code: "INVALID_AMOUNT", message: "Invalid amount" },
  DUPLICATE_IDEMPOTENCY_KEY: { code: "DUPLICATE_IDEMPOTENCY_KEY", message: "Duplicate idempotency key" },
  SYSTEM_ACCOUNT_MISSING: { code: "SYSTEM_ACCOUNT_MISSING", message: "System account missing" },
  MISSING_IDEMPOTENCY_KEY: { code: "MISSING_IDEMPOTENCY_KEY", message: "Missing idempotency key" },
  CREDIT_FAILED: { code: "CREDIT_FAILED", message: "Credit failed" },
} as const;

export type TokenWalletErrorCode = keyof typeof TOKEN_WALLET_ERROR_CODES;
