export interface TokenWalletOptions {
  wallet?: {
    autoCreate?: boolean;
    initialBalance?: number;
  };
  schema?: Record<string, { tableName?: string; fields?: Record<string, string> }>;
  hooks?: {
    onTopUp?: (ctx: TopUpContext) => Promise<void> | void;
  };
}

export interface TopUpContext {
  transaction: WalletTransaction;
  entries: WalletEntry[];
  user: { id: string };
  wallet: WalletAccount;
}

export interface WalletAccount {
  id: string;
  referenceKey: string;
  referenceType: string;
  accountType: string;
  postedBalance: number;
  pendingDebits: number;
  availableBalance: number;
  lockVersion: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletTransaction {
  id: string;
  idempotencyKey: string;
  transactionType: string;
  status: string;
  metadata?: Record<string, unknown>;
  referenceTxId?: string;
  createdAt: Date;
}

export interface WalletEntry {
  id: string;
  transactionId: string;
  accountId: string;
  entryType: "DEBIT" | "CREDIT";
  amount: number;
  balanceType: "posted" | "pending";
  createdAt: Date;
}

export interface WalletHold {
  id: string;
  transactionId: string;
  accountId: string;
  status: "active" | "captured" | "voided" | "expired";
  amount: number;
  capturedAmount?: number;
  captureTransactionId?: string;
  voidTransactionId?: string;
  createdAt: Date;
}

export interface WalletBalance {
  posted: number;
  pending: number;
  available: number;
}

export type AccountType = "USER_WALLET" | "SYSTEM_REVENUE" | "SYSTEM_ESCROW" | "SYSTEM_RESERVE";
export type TransactionType = "CREDIT_TOPUP" | "API_DEBIT" | "HOLD" | "CAPTURE" | "VOID" | "REFUND" | "ADJUSTMENT";
export type EntryType = "DEBIT" | "CREDIT";
export type BalanceType = "posted" | "pending";

export interface CreditRequest {
  amount: number;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
}

export interface CreditResponse {
  transaction: WalletTransaction;
  entries: WalletEntry[];
  balance: WalletBalance;
}
