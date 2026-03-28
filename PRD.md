# PRD: Better Auth Token Wallet Plugin

## Problem Statement

AI application developers using Better Auth have no built-in way to manage prepaid token wallets for their users. Today, every developer building AI-powered apps (chatbots, coding assistants, content generators) must independently solve token-based billing — tracking balances, preventing overspending during concurrent API calls, maintaining an audit trail, and handling the preflight/postflight lifecycle around AI API calls.

The existing Better Auth Stripe plugin only handles subscription billing. The API Key plugin does rate limiting but not token metering. No TypeScript-native, auth-integrated, double-entry ledger token wallet exists anywhere in the ecosystem.

Developers are forced to either bolt on external billing services (Stripe Metered Billing) with no auth integration, build ad-hoc wallet tables with no concurrency safety, or use Python-based proxy services (LiteLLM, Helicone) that don't integrate with their auth layer at all.

## Solution

A Better Auth plugin (`better-auth-token-wallet`) that provides a complete double-entry ledger engine for AI token billing, integrated directly into the auth lifecycle. The plugin manages wallet balances, holds/reservations, settlements, refunds, and a full audit trail — all exposed through 6 typed API endpoints and a matching client plugin.

The plugin is a **ledger engine only** — it does not handle payments, UI, or admin dashboards. App developers bring their own payment provider and wire it to the `credit` endpoint via payment-agnostic hooks.

### Core Flows

**Hold Mode (preflight → postflight):** Before an AI API call, the developer calls `preflight` which reserves (holds) tokens from the user's available balance. After the call completes, they call `postflight` which captures the actual tokens consumed (which may differ from the hold estimate). Unused tokens are released.

**Check Mode (simpler):** Before an AI API call, the developer calls `preflight` which only verifies sufficient balance. After the call, `postflight` directly debits the exact tokens consumed. No hold is created. Simpler but no protection against concurrent overspending.

## User Stories

### Wallet Lifecycle

1. As an app developer, I want to install the plugin and have it auto-create wallet tables in my database, so that I don't need to write manual migrations
2. As an app developer, I want wallets to be auto-created for new users on signup, so that every user has a token balance from day one
3. As an app developer, I want to configure an initial token balance (e.g., 1000 free tokens), so that new users can try the service before paying
4. As an app developer, I want to disable auto-wallet-creation and manage wallet creation explicitly, so that I can control when users get access to tokens
5. As an app developer, I want to create wallets for organizations (not just users), so that teams can share a token budget
6. As an app developer, I want each user/org to have exactly one wallet, so that balance tracking is unambiguous

### Balance Management

7. As an app developer, I want to query a user's wallet balance (posted, pending, available), so that I can display it in a dashboard
8. As an app developer, I want "available balance" to automatically account for active holds, so that I don't need to manually subtract pending tokens
9. As an app developer, I want balances to be stored as integers (never floats), so that I avoid rounding errors in financial calculations
10. As an app developer, I want a wallet balance to never go below zero (strict prepaid), so that users cannot spend tokens they don't have
11. As an app developer, I want the system to prevent overspending when multiple AI API calls hit simultaneously for the same user, so that balances remain correct under concurrency

### Preflight & Postflight (Hold Mode)

12. As an app developer, I want to call `preflight` with an estimated token cost to reserve tokens before an AI API call, so that concurrent requests don't overspend
13. As an app developer, I want `preflight` to fail immediately if available balance is insufficient, so that I can reject the request before making the expensive AI call
14. As an app developer, I want `preflight` to return a hold ID, so that I can reference it in the subsequent `postflight` call
15. As an app developer, I want to call `postflight` with a hold ID and the actual token cost after the AI call completes, so that the exact consumption is charged
16. As an app developer, I want `postflight` to release unused tokens from the hold back to available balance, so that users aren't overcharged
17. As an app developer, I want to call `void-hold` to release a hold without charging, so that I can cancel AI requests without penalty
18. As an app developer, I want voiding a hold to be idempotent, so that retrying on network failure doesn't cause errors

### Preflight & Postflight (Check Mode)

19. As an app developer, I want to use a simpler "check-then-deduct" mode that skips holds entirely, so that I can avoid hold/capture complexity for low-risk use cases
20. As an app developer, I want to configure the default preflight mode (hold vs check) at the plugin level, so that I don't need to specify it on every call

### Token Credits (Top-Ups)

21. As an app developer, I want to call `credit` to add tokens to a user's wallet, so that I can process token purchases from any payment provider
22. As an app developer, I want the `onTopUp` hook to fire after a successful credit, so that I can trigger post-payment logic (emails, analytics, etc.)
23. As an app developer, I want to add credits for organizations, not just users, so that team budgets can be topped up
24. As an app developer, I want the `credit` endpoint to be idempotent, so that retrying a payment webhook doesn't double-credit the wallet

### Refunds

25. As an app developer, I want to refund a previous transaction by creating a reversal entry, so that users get their tokens back on API errors
26. As an app developer, I want the original transaction to remain untouched after a refund (append-only ledger), so that the audit trail is never corrupted
27. As an app developer, I want the `onRefund` hook to fire after a successful refund, so that I can notify the user or log the event

### Audit & History

28. As an app developer, I want to list a user's transaction history (paginated), so that users can see their token usage over time
29. As an app developer, I want each transaction to carry AI-aware metadata (model, input/output tokens, request ID, latency), so that usage is traceable to specific AI calls
30. As an app developer, I want each transaction to carry generic JSON metadata, so that I can attach arbitrary app-specific data
31. As an app developer, I want ledger entries to be append-only (never updated or deleted), so that the audit trail is immutable
32. As an app developer, I want the double-entry invariant (total debits = total credits) to be enforced on every transaction, so that tokens are never created or destroyed outside of explicit operations

### Idempotency

33. As an app developer, I want every mutating operation (preflight, postflight, credit, void) to require an idempotency key, so that network retries never cause duplicate charges
34. As an app developer, I want duplicate requests with the same idempotency key to return the original result, so that my retry logic is simple and safe

### Concurrency

35. As an app developer, I want optimistic locking as the default concurrency strategy, so that balances are safe under concurrent access without database-level locks
36. As an app developer, I want the option to switch to pessimistic locking (SELECT FOR UPDATE) for high-contention scenarios, so that I can choose the right tradeoff for my workload
37. As an app developer, I want the optimistic locking to automatically retry with exponential backoff when a version conflict occurs, so that transient contention doesn't cause user-facing errors

### Organization Support

38. As an app developer, I want wallets to support both user-scoped and organization-scoped references, so that I can bill at the team level
39. As an app developer, I want an `authorizeReference` callback (like the Stripe plugin), so that I can verify the current user has permission to access an organization's wallet
40. As an app developer, I want organization wallets to work identically to user wallets, so that I don't need separate code paths

### Client Integration

41. As an app developer, I want a client plugin that provides typed access to all wallet endpoints, so that my frontend code is fully type-safe
42. As an app developer, I want the client plugin to infer types from the server plugin, so that I don't need to maintain duplicate type definitions
43. As an app developer, I want convenience methods on the client (not just raw endpoint calls), so that common operations are ergonomic

### Schema Customization

44. As an app developer, I want to customize table names and field names via the `schema` option (like the Stripe plugin), so that the plugin fits my existing database conventions
45. As an app developer, I want the plugin to work with any Better Auth database adapter (Drizzle, Prisma, Kysely), so that I'm not locked into a specific ORM

## Implementation Decisions

### Plugin Architecture

- The plugin follows the standard Better Auth plugin pattern: factory function returning an object satisfying `BetterAuthPlugin`
- Plugin ID: `"token-wallet"`
- Server plugin registered via `betterAuth({ plugins: [tokenWallet(options)] })`
- Client plugin registered via `createAuthClient({ plugins: [tokenWalletClient()] })`
- Uses `declare module "@better-auth/core"` for TypeScript plugin registry

### Schema Design (4 Tables)

- **walletAccount**: Stores materialized balances (posted, pending, available) per user/org per account type. Uses `lockVersion` for optimistic concurrency control. Unique constraint on `(referenceId, referenceType, accountType)`.
- **walletTransaction**: Groups entries into atomic operations. Every transaction has a required unique `idempotencyKey`, a `transactionType`, `status` (pending/posted/voided), AI-aware `metadata` JSON, and optional `referenceTxId` for linking captures to holds and refunds to originals.
- **walletEntry**: Append-only individual debit/credit records. Each entry references a transaction and an account, with an `entryType` (DEBIT/CREDIT), `amount` (always positive, direction in entryType), and `balanceType` (posted/pending). Never updated or deleted after creation.
- **walletHold**: Tracks active holds with `status` (active/captured/voided/expired), `amount`, `capturedAmount` (set on capture, may differ from hold), and links to capture/void transactions. Used to track and manage token reservations.

### Double-Entry Ledger Model

- Four system account types: USER_WALLET (per user/org), SYSTEM_REVENUE (receives consumed tokens), SYSTEM_ESCROW (holds tokens during active holds), SYSTEM_RESERVE (for refunds/adjustments)
- Every operation creates balanced debit/credit entry pairs across accounts
- Top-Up: DEBIT SYSTEM_REVENUE → CREDIT USER_WALLET
- Hold (preflight): DEBIT USER_WALLET (pending) → CREDIT SYSTEM_ESCROW (pending)
- Capture (postflight): VOID the hold entries, then DEBIT USER_WALLET (posted) → CREDIT SYSTEM_REVENUE (posted)
- Direct Debit (check mode): DEBIT USER_WALLET (posted) → CREDIT SYSTEM_REVENUE (posted)
- Refund: DEBIT SYSTEM_REVENUE → CREDIT USER_WALLET (mirror of original)
- Balance invariant: SUM(debits) = SUM(credits) for every transaction

### Balance Model

- Balances are materialized as columns on `walletAccount` for fast reads (no SUM needed)
- Available Balance = Posted Balance - Pending Debits
- Balances use integer type exclusively (no floating point)
- Balance can never go below zero (strict prepaid model)
- `walletEntry` table is the source of truth; `walletAccount` balances are a performance optimization
- Reconciliation utility function available for periodic verification

### Concurrency Strategy

- Default: Optimistic locking via `lockVersion` column on `walletAccount`
- On write: `UPDATE ... WHERE lockVersion = expectedVersion` — returns 0 rows = conflict, retry
- Automatic retry with exponential backoff + jitter on version conflicts
- Optional: Pessimistic locking (SELECT FOR UPDATE) configurable via `concurrency` option
- All balance modifications happen within a single database transaction

### Idempotency

- Every mutating operation requires an `idempotencyKey` parameter
- `idempotencyKey` has a UNIQUE constraint on `walletTransaction`
- On duplicate key, the existing transaction result is returned (no error, no double-processing)
- This protects against network retries in distributed systems

### Hold Lifecycle

- No automatic hold expiry in v1 (documented as a known footgun)
- Holds remain active until explicitly captured or voided
- A `void-hold` endpoint is provided for manual/cron-based cleanup of orphaned holds
- Documentation will include guidance on wiring a cron job for hold cleanup

### Endpoints (6 total)

All endpoints use Better Auth's `createAuthEndpoint` and require `sessionMiddleware`:

1. `GET /token-wallet/balance` — Returns posted, pending, and available balances
2. `GET /token-wallet/transactions` — Paginated transaction history with metadata
3. `POST /token-wallet/preflight` — Check balance and optionally create a hold (mode: "hold" or "check")
4. `POST /token-wallet/postflight` — Capture a hold with actual cost or directly debit (depending on mode)
5. `POST /token-wallet/void-hold` — Release an active hold without charging
6. `POST /token-wallet/credit` — Add tokens to a wallet (top-up)

### Auto-Wallet Creation

- Via plugin `init()` → `databaseHooks.user.create.after`
- Creates a USER_WALLET account when a new user signs up
- Configurable via `autoCreateWallet` (default: true) and `initialBalance` (default: 0)
- Organization wallets created on first access (not auto-created)

### Payment-Agnostic Hooks

- `onTopUp`: Fires after tokens are credited to a wallet
- `onDebit`: Fires after tokens are debited (postflight/capture)
- `onRefund`: Fires after a refund is processed
- `onInsufficientBalance`: Fires when a preflight check fails due to low balance
- These hooks allow app developers to integrate any payment provider or trigger any side effect

### Organization Authorization

- Follows the Stripe plugin's `authorizeReference` pattern
- App developer provides an async callback that receives `{ user, session, referenceId, referenceType, action }`
- Returns `true` to allow, `false` to deny
- Applied to all endpoints when `referenceType` is "organization"

### Client Plugin

- Uses `$InferServerPlugin` for automatic type inference from server plugin
- `getActions` provides convenience methods beyond raw endpoint access
- `pathMethods` ensures correct HTTP method mapping
- Exposes `$ERROR_CODES` for client-side error handling

### Module Decomposition (5 Deep Modules)

1. **Ledger Engine** — Creates balanced debit/credit entry pairs, validates the double-entry invariant, handles atomic writes within a database transaction
2. **Balance Manager** — Reads and updates materialized balance columns on wallet accounts with concurrency control (optimistic locking + retry, or pessimistic locking)
3. **Hold Manager** — Manages the full hold lifecycle: create (preflight), capture (postflight), void. Coordinates between Ledger Engine and Balance Manager
4. **Wallet Account Manager** — CRUD operations for wallet accounts, auto-creation on user signup, find-or-create by reference, system account initialization
5. **Idempotency Guard** — Checks for existing idempotency keys before processing, stores new keys atomically, returns existing results on duplicates

### Pricing Model

- App-defined: the plugin does not understand model pricing
- Postflight receives a pre-calculated cost from the app developer
- The plugin debits whatever integer amount is passed
- Developer is responsible for mapping model + token count → cost in their own code

### Plugin Scope

- **IN scope**: Ledger engine, wallet accounts, holds, transactions, balance queries, idempotency, concurrency control, reconciliation utility, client plugin
- **OUT of scope**: Payment processing, Stripe/webhook integration, billing UI, admin dashboard, model pricing tables, background reconciliation jobs, analytics

## Testing Decisions

### Testing Philosophy

- Tests verify **external behavior** (inputs → outputs → state changes), not implementation details
- The ledger is a financial system — correctness is non-negotiable. Every invariant must have a test
- Tests use SQLite for integration tests (fast, no external DB required)
- Unit tests for pure logic (Ledger Engine, Idempotency Guard)
- Integration tests for stateful operations (Balance Manager, Hold Manager, Wallet Account Manager)

### Modules Tested (All 5)

**Ledger Engine** (~15 test cases):
- Creates balanced entries (debits = credits) for all transaction types
- Rejects unbalanced entries (debits ≠ credits)
- Creates entries atomically within a database transaction
- Supports posted and pending balance types
- Links capture transactions to hold transactions via referenceTxId
- Links refund transactions to original transactions via referenceTxId

**Balance Manager** (~12 test cases):
- Reads posted, pending, and available balances correctly
- Updates posted balance on credit/debit
- Updates pending debits and available balance on hold
- Rejects operations that would make available balance negative
- Handles optimistic locking: succeeds when version matches, retries on conflict
- Handles pessimistic locking: locks rows during transaction
- Retries with exponential backoff on version conflict

**Hold Manager** (~10 test cases):
- Creates a hold that reduces available balance
- Captures a hold with exact amount (equal to hold)
- Captures a hold with amount less than hold (partial capture, returns remainder)
- Rejects capture of amount greater than hold
- Voids an active hold (returns tokens to available balance)
- Rejects capture of already-captured hold
- Rejects void of already-voided hold
- Idempotent void (voiding already-voided hold returns original result)

**Wallet Account Manager** (~8 test cases):
- Creates wallet account for a user
- Creates wallet account for an organization
- Finds existing wallet by reference (user or org)
- Creates system accounts on initialization
- Auto-creates wallet on user signup via database hook
- Respects autoCreateWallet = false
- Applies initial balance correctly

**Idempotency Guard** (~5 test cases):
- Allows first request with new idempotency key
- Returns existing result on duplicate idempotency key
- Handles concurrent requests with same key (race condition)
- Isolates idempotency across different operations

### Prior Art

- Better Auth's own test patterns for plugin testing (session middleware, adapter mocking)
- Medici's double-entry validation tests (balanced journal commit, void/reversal)
- Exchequer.io's optimistic locking benchmarks

## Out of Scope

- **Payment integration**: No Stripe, LemonSqueezy, or any payment provider wiring. The `credit` endpoint + `onTopUp` hook is the integration point.
- **Billing UI / Dashboard**: No frontend components, balance widgets, or admin panels
- **Model pricing tables**: No built-in knowledge of AI model costs. App developer passes cost directly.
- **Background reconciliation**: No cron job or background worker. A `reconcileBalances()` utility function is exported for the app to call.
- **Automatic hold expiry**: Holds remain active until explicitly captured or voided. Cleanup is the app's responsibility.
- **Multi-currency**: Token wallets track a single unit (AI tokens). No currency conversion or multi-currency wallets.
- **Transfer between wallets**: No peer-to-peer token transfers between users.
- **Budgets / spending limits**: No per-member budgets within organizations.
- **Rate limiting**: No built-in rate limiting on wallet endpoints (Better Auth has its own rate limiting system).
- **Webhook system**: No outgoing webhooks for wallet events. Use the `onTopUp`/`onDebit`/`onRefund` hooks instead.

## Further Notes

### Name & Package

- Package name: `better-auth-token-wallet`
- Single package containing both server and client exports
- Client exported via `better-auth-token-wallet/client`

### Inspiration & Prior Art

- **Uber's LedgerStore**: Multi-account double-entry architecture, authorization vs clearing separation
- **Exchequer.io**: Optimistic locking with `lockVersion`, pending/posted/available balance model, Drizzle schema
- **Medici (MongoDB)**: Double-entry validation, void/reversal patterns, pessimistic locking via document locks
- **Lefra (PostgreSQL)**: Database-enforced balance constraints via triggers, auto-created entity accounts
- **Better Auth Stripe Plugin**: Plugin structure, schema patterns, `authorizeReference` callback, `referenceId`/`customerType` pattern
- **Better Auth API Key Plugin**: Rate limiting + refill mechanism (closest existing "credit" system)

### Future Considerations

These are explicitly deferred but the schema design should not preclude them:
- TTL-based hold auto-expiry (add `expiresAt` to `walletHold`, background cleanup process)
- Low-balance alerts (`onLowBalance` hook with configurable threshold)
- Peer-to-peer wallet transfers
- Per-member org budgets
- Multi-currency support (currency field reserved on `walletAccount`)
- Background reconciliation job
