# Plan: Better Auth Token Wallet Plugin

> Source PRD: `PRD.md` in project root

## Architectural decisions

Durable decisions that apply across all phases:

- **Plugin ID**: `"token-wallet"` — used for server plugin, client plugin, and TypeScript declaration merging
- **Package name**: `better-auth-token-wallet` — single package, client exported via `better-auth-token-wallet/client`
- **Routes**: All routes prefixed with `/token-wallet/` — follows Better Auth's kebab-case convention
  - `GET /token-wallet/balance`
  - `GET /token-wallet/transactions`
  - `POST /token-wallet/preflight`
  - `POST /token-wallet/postflight`
  - `POST /token-wallet/void-hold`
  - `POST /token-wallet/credit`
- **Schema (4 tables)**:
  - `walletAccount` — materialized balances (posted, pending, available) per reference per account type, with `lockVersion`
  - `walletTransaction` — groups entries, required unique `idempotencyKey`, `transactionType`, `status`, AI-aware `metadata` JSON
  - `walletEntry` — append-only debit/credit records, `entryType` (DEBIT/CREDIT), `amount` (always positive), `balanceType` (posted/pending)
  - `walletHold` — active holds with `status` (active/captured/voided/expired), `amount`, `capturedAmount`, links to capture/void transactions
- **Account types**: `USER_WALLET`, `SYSTEM_REVENUE`, `SYSTEM_ESCROW`, `SYSTEM_RESERVE`
- **Double-entry invariant**: Every transaction has SUM(debits) = SUM(credits) across all entries
- **Unit of account**: Integer AI tokens (no floating point, no currency)
- **Balance model**: Available Balance = Posted Balance - Pending Debits. Balances are materialized columns (not computed). Entries are the source of truth.
- **Strict prepaid**: Balance can never go below zero
- **Idempotency**: Required on all mutating operations via unique `idempotencyKey`
- **Concurrency**: Optimistic locking (default) via `lockVersion`, pessimistic locking (opt-in) via SELECT FOR UPDATE
- **Plugin scope**: Ledger engine only. No payments, no UI, no pricing tables.

---

## Phase 1: Wallet Account + Credit (First Money Movement)

**User stories**: 1, 2, 3, 4, 5, 6, 21, 22, 23, 24, 44, 45

### What to build

The minimum end-to-end slice: a user signs up, gets a wallet auto-created, and tokens can be credited to that wallet via the `POST /token-wallet/credit` endpoint. This phase delivers the plugin factory function, all 4 database tables (schema), the wallet account auto-creation hook, system account initialization, the first double-entry transaction (CREDIT_TOPUP), the idempotency guard, and a skeletal client plugin.

On plugin `init()`, the four system accounts (USER_WALLET template, SYSTEM_REVENUE, SYSTEM_ESCROW, SYSTEM_RESERVE) are ensured to exist. On user signup (via `databaseHooks.user.create.after`), a USER_WALLET account is auto-created for the new user with the configured `initialBalance`. The `credit` endpoint creates a CREDIT_TOPUP transaction with two entries: DEBIT SYSTEM_REVENUE and CREDIT USER_WALLET, updating the materialized posted_balance and available_balance columns. The `onTopUp` hook fires after successful credit.

The skeletal client plugin provides `$InferServerPlugin` for type inference so `authClient.tokenWallet.credit(...)` is typed.

### Acceptance criteria

- [ ] Plugin registers with id `"token-wallet"` and satisfies `BetterAuthPlugin`
- [ ] Database tables (`walletAccount`, `walletTransaction`, `walletEntry`, `walletHold`) are created via Better Auth schema migration
- [ ] System accounts (REVENUE, ESCROW, RESERVE) are initialized on plugin init
- [ ] User wallet is auto-created on signup with configurable initial balance
- [ ] `POST /token-wallet/credit` creates a balanced CREDIT_TOPUP transaction (DEBIT SYSTEM_REVENUE → CREDIT USER_WALLET)
- [ ] Posted balance and available balance are updated atomically on credit
- [ ] Idempotency key prevents duplicate credits — duplicate request returns original result
- [ ] `onTopUp` hook fires after successful credit
- [ ] Schema customization (table/field names) works via `schema` option
- [ ] Plugin works with Better Auth's built-in database adapters (Drizzle, Prisma, Kysely)
- [ ] `autoCreateWallet: false` skips auto-creation
- [ ] Client plugin provides typed access to the credit endpoint

---

## Phase 2: Balance Query + Transaction History

**User stories**: 7, 8, 9, 28, 29, 30, 31, 32

### What to build

Add read-only visibility into the wallet. The `GET /token-wallet/balance` endpoint returns posted balance, pending debits, and available balance for the authenticated user's wallet. The `GET /token-wallet/transactions` endpoint returns a paginated list of transactions with their metadata, sorted by creation date descending. Each transaction includes its entries for full audit detail.

This phase builds the balance read model — reading directly from the materialized columns on `walletAccount` (no SUM computation). The available balance is returned as `posted_balance - pending_debits` (pending will be zero until Phase 4 adds holds). Transaction listing supports limit/offset pagination and includes the AI-aware metadata JSON (model, inputTokens, outputTokens, requestId, latencyMs) and generic metadata.

### Acceptance criteria

- [ ] `GET /token-wallet/balance` returns `{ posted, pending, available }` for the authenticated user
- [ ] Available balance is computed as posted minus pending debits
- [ ] `GET /token-wallet/transactions` returns paginated transaction list sorted by date descending
- [ ] Each transaction includes its entries (debit/credit pairs) for audit
- [ ] Transaction metadata (AI-aware fields + generic JSON) is returned in the response
- [ ] Pagination works with `limit` and `offset` query parameters
- [ ] Balances are integers (never floats) in all responses
- [ ] Entries are append-only — no update or delete operations exist

---

## Phase 3: Check-Then-Deduct (Simple Postflight)

**User stories**: 19, 20, 25, 26, 27

### What to build

The simpler billing path — no holds, just balance verification then direct debit. The `POST /token-wallet/preflight` endpoint in "check" mode verifies the user has sufficient available balance for the requested amount but does not create a hold. The `POST /token-wallet/postflight` endpoint in direct-debit mode creates an API_DEBIT transaction: DEBIT USER_WALLET (posted) → CREDIT SYSTEM_REVENUE (posted). Both the preflight check and the postflight debit happen with the idempotency guard.

Also includes refund support: the postflight endpoint accepts an optional `refund` flag that creates a reversal transaction (DEBIT SYSTEM_REVENUE → CREDIT USER_WALLET) linked to the original via `referenceTxId`. The `onDebit` and `onRefund` hooks fire after their respective operations. The `defaultPreflightMode` plugin option sets whether hold or check is the default.

### Acceptance criteria

- [ ] `POST /token-wallet/preflight` with `mode: "check"` verifies available balance >= requested amount
- [ ] Preflight returns `{ sufficient: boolean, availableBalance: number }`
- [ ] Preflight rejects (throws APIError) when available balance is insufficient
- [ ] `POST /token-wallet/postflight` without a `holdId` creates a direct API_DEBIT transaction
- [ ] Direct debit: DEBIT USER_WALLET (posted) → CREDIT SYSTEM_REVENUE (posted)
- [ ] Posted balance and available balance decrease by the debited amount
- [ ] Debit is rejected if it would make available balance negative
- [ ] Refund creates a reversal transaction linked to the original via `referenceTxId`
- [ ] Original transaction is never mutated — refund is a new transaction with mirrored entries
- [ ] `onDebit` hook fires after successful debit
- [ ] `onRefund` hook fires after successful refund
- [ ] `onInsufficientBalance` hook fires when preflight check fails
- [ ] Idempotency keys prevent duplicate debits and refunds

---

## Phase 4: Hold-Capture-Void (Full Preflight/Postflight)

**User stories**: 12, 13, 14, 15, 16, 17, 18

### What to build

The credit card auth+capture pattern for token billing. The `POST /token-wallet/preflight` endpoint in "hold" mode creates a HOLD transaction: DEBIT USER_WALLET (pending) → CREDIT SYSTEM_ESCROW (pending), reducing the user's available balance while the hold is active. A `walletHold` record is created with status "active".

The `POST /token-wallet/postflight` endpoint with a `holdId` performs a two-step capture: (A) VOID the hold by creating reversal pending entries (CREDIT USER_WALLET → DEBIT SYSTEM_ESCROW), releasing the full hold amount back to available balance, then (B) POST the actual usage as new entries: DEBIT USER_WALLET (posted) → CREDIT SYSTEM_REVENUE (posted). The hold's `capturedAmount` is set to the actual cost, and its status becomes "captured".

The `POST /token-wallet/void-hold` endpoint releases an active hold without charging: CREDIT USER_WALLET (pending) → DEBIT SYSTEM_ESCROW (pending). The hold status becomes "voided". Voiding an already-voided hold is idempotent and returns the original result.

### Acceptance criteria

- [ ] `POST /token-wallet/preflight` with `mode: "hold"` creates a HOLD transaction with pending entries
- [ ] Hold: DEBIT USER_WALLET (pending) → CREDIT SYSTEM_ESCROW (pending)
- [ ] Available balance decreases by the hold amount (pending debits increase)
- [ ] Preflight returns `{ holdId, availableBalance, sufficient: true }`
- [ ] Preflight rejects when available balance is insufficient
- [ ] `POST /token-wallet/postflight` with `holdId` performs capture:
  - [ ] Step A: Voids the hold (reverses pending entries, restores available balance)
  - [ ] Step B: Posts actual usage (DEBIT USER_WALLET posted → CREDIT SYSTEM_REVENUE posted)
  - [ ] Hold status becomes "captured", `capturedAmount` is set
- [ ] Capture with amount less than hold amount releases remainder to available balance
- [ ] Capture with amount greater than hold amount is rejected
- [ ] `POST /token-wallet/void-hold` releases full hold amount back to available balance
- [ ] Hold status becomes "voided" on void
- [ ] Voiding an already-voided hold is idempotent (returns original void result)
- [ ] Capturing an already-captured hold is rejected
- [ ] All operations use idempotency keys
- [ ] The `walletHold` table correctly tracks hold lifecycle (active → captured/voided)

---

## Phase 5: Concurrency Safety (Optimistic + Pessimistic Locking)

**User stories**: 10, 11, 35, 36, 37

### What to build

The concurrency layer that prevents overspending under load. The Balance Manager uses optimistic locking by default: on every balance update, it reads the current `lockVersion`, applies the change in memory, then writes with `WHERE lockVersion = expectedVersion`. If the version changed (concurrent write), the operation is retried with exponential backoff + full jitter up to a configurable max retries (default 5).

The pessimistic locking option uses SELECT FOR UPDATE within the database transaction, blocking other transactions from reading the same row until the lock is released. This is configured via the `concurrency` plugin option ("optimistic" | "pessimistic").

This phase includes concurrency stress tests: spawn N simultaneous preflight/postflight operations against the same wallet and verify that (a) no balance goes negative, (b) total debits + available balance + pending debits = initial balance + total credits, and (c) all operations succeed or fail gracefully.

### Acceptance criteria

- [ ] Optimistic locking: balance updates check `lockVersion` and increment on write
- [ ] On version conflict (concurrent write), the operation is retried automatically
- [ ] Retry uses exponential backoff with jitter (configurable max retries, default 5)
- [ ] After max retries exhausted, a clear error is thrown (not a silent failure)
- [ ] Pessimistic locking option locks rows with SELECT FOR UPDATE during the transaction
- [ ] `concurrency: "optimistic"` (default) and `concurrency: "pessimistic"` options work
- [ ] Stress test: 10 concurrent preflight+postflight cycles for same user — no balance goes negative
- [ ] Stress test: total tokens are conserved (debits + available + pending = credits)
- [ ] Stress test: all operations either succeed or return a clear error (no data corruption)

---

## Phase 6: Organization Support + Authorization

**User stories**: 38, 39, 40

### What to build

Extend every endpoint to support organization-scoped wallets alongside user-scoped wallets. All endpoints accept optional `referenceType` ("user" | "organization") and `referenceId` parameters. When `referenceType` is "organization", the plugin checks the `authorizeReference` callback before allowing access. When omitted, defaults to the current user's wallet.

Organization wallets are NOT auto-created on org creation (unlike user wallets). They are created on first access (top-up or balance check) via a find-or-create pattern. The `authorizeReference` callback receives `{ user, session, referenceId, referenceType, action }` and returns true/false. If no callback is provided, organization access is denied by default.

This follows the same pattern as the Better Auth Stripe plugin's `authorizeReference` for consistency with the ecosystem.

### Acceptance criteria

- [ ] All 6 endpoints accept `referenceType` ("user" | "organization") and `referenceId` parameters
- [ ] When omitted, defaults to the authenticated user's wallet (`referenceType: "user"`)
- [ ] Organization wallets are created on first access (find-or-create)
- [ ] `authorizeReference` callback is called for all organization-scoped operations
- [ ] If `authorizeReference` returns false, the operation is rejected with FORBIDDEN
- [ ] If `authorizeReference` is not configured, organization access is denied by default
- [ ] User-scoped wallets work identically with or without organization support enabled
- [ ] All double-entry flows (top-up, debit, hold, capture, void, refund) work for organizations
- [ ] Transaction history can be queried for organization wallets

---

## Phase 7: Client Plugin + Error Codes + Polish

**User stories**: 41, 42, 43, 33, 34

### What to build

The full client-side experience. The client plugin uses `$InferServerPlugin` to inherit all types from the server plugin, so `authClient.tokenWallet.credit(...)` has full type inference for request/response shapes. The `getActions` function adds convenience methods beyond raw endpoint access (e.g., a `useWallet`-style atom for reactive balance, helper methods that wrap common preflight→AI call→postflight patterns).

Error codes are defined via `defineErrorCodes` and exposed on both server and client (`$ERROR_CODES`). TypeScript declaration merging registers the plugin in `BetterAuthPluginRegistry` so `ctx.getPlugin("token-wallet")` works.

Final integration test pass against SQLite covering all 6 endpoints end-to-end, all hooks firing correctly, idempotency under load, and organization authorization. Documentation inline via JSDoc on all exported types and functions.

### Acceptance criteria

- [ ] Client plugin uses `$InferServerPlugin` for automatic type inference from server
- [ ] `authClient.tokenWallet.*` provides typed access to all 6 endpoints
- [ ] `getActions` provides convenience methods for common patterns
- [ ] Error codes defined and exposed on client plugin (`$ERROR_CODES`)
- [ ] Plugin registered via `declare module "@better-auth/core"` for TypeScript plugin registry
- [ ] `pathMethods` ensures correct HTTP methods on client (POST for mutating, GET for queries)
- [ ] All exported types and functions have JSDoc documentation
- [ ] Full integration test suite passes: all 6 endpoints, all hooks, idempotency, org authorization
- [ ] Package exports: `better-auth-token-wallet` (server) and `better-auth-token-wallet/client` (client)
