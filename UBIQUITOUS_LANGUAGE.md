# Ubiquitous Language

## Wallet & Accounts

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Wallet** | A user's or organization's token balance container with posted, pending, and available amounts | Account, purse, balance |
| **Wallet Account** | A ledger account that tracks posted/pending/available balances and is one of four account types | Ledger account, balance account |
| **Account Type** | The classification of a Wallet Account: USER_WALLET, SYSTEM_REVENUE, SYSTEM_ESCROW, or SYSTEM_RESERVE | Account kind, account category |
| **Reference** | The entity that owns a Wallet — either a user or an organization, identified by a Reference Key | Owner, holder, customer |
| **Reference Key** | A single unique string identifying a Reference, formed as `"user:{userId}"` or `"org:{orgId}"` | referenceId, composite key |
| **Posted Balance** | The settled, confirmed token amount in a Wallet Account | Confirmed balance, settled balance, actual balance |
| **Pending Debits** | The total tokens currently locked by active Holds in a Wallet Account | Held amount, reserved tokens |
| **Available Balance** | The tokens free to spend, computed as Posted Balance minus Pending Debits | Free balance, spendable balance |
| **Lock Version** | An integer on Wallet Account used for optimistic concurrency control to prevent overspending | Version, revision |

## Token Lifecycle

| Term | Definition | Aliases to avoid |
| --- | --- | ---|
| **Token** | The integer unit of account in the Wallet, representing AI model consumption | Credit, unit, point |
| **Top-Up** | The act of adding tokens to a Wallet, creating a CREDIT entry | Deposit, recharge, refill |
| **Preflight** | The pre-call check that verifies sufficient Available Balance and optionally creates a Hold | Pre-check, pre-authorize, reserve |
| **Postflight** | The post-call settlement that captures a Hold (or directly debits) with the actual token cost | Settle, capture, finalize |
| **Hold** | A temporary reservation of tokens from Available Balance, created during Preflight and resolved by Capture or Void | Reservation, lock, authorization, pre-auth |
| **Capture** | The act of converting an active Hold into a settled debit for the actual amount consumed | Settlement, realization |
| **Void** | The act of releasing an active Hold without charging, returning tokens to Available Balance | Release, cancel hold, free |
| **Debit** | A reduction of tokens from a Wallet Account | Charge, deduction, spend |
| **Credit** | An addition of tokens to a Wallet Account | Top-up (when referring to the entry), deposit |
| **Refund** | A Credit that reverses a previously posted Debit, linked to the original Transaction | Reversal, return |

## Ledger (Double-Entry)

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Transaction** | A group of two or more Entries that atomically move tokens between Wallet Accounts | Journal, ledger entry group |
| **Entry** | A single debit or credit record within a Transaction, applied to one Wallet Account | Ledger line, posting |
| **Transaction Type** | The classification of a Transaction: CREDIT_TOPUP, API_DEBIT, HOLD, CAPTURE, VOID, REFUND, or ADJUSTMENT | Operation type, action |
| **Idempotency Key** | A unique string required on every mutating operation to prevent duplicate processing on retries | Dedup key, request key |
| **Reconciliation** | The process of verifying that materialized balance columns match the sum of Entries | Audit, balance check |
| **Double-Entry** | The invariant that every Transaction has equal total Debits and Credits across all its Entries | Balanced ledger, dual-entry |

## Account Types (System)

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **USER_WALLET** | A Wallet Account belonging to a user or organization that tracks their personal token balance | User account, personal wallet |
| **SYSTEM_REVENUE** | A Wallet Account that receives tokens when users consume them (the "other side" of a Debit) | Revenue account, income account |
| **SYSTEM_ESCROW** | A Wallet Account that temporarily holds tokens reserved by active Holds | Escrow account, hold account |
| **SYSTEM_RESERVE** | A Wallet Account used for refunds and manual adjustments | Reserve account, adjustment account |
| **System Account Seeding** | The act of creating the three system singleton accounts (REVENUE, ESCROW, RESERVE) on plugin initialization | System init, account setup |

## Preflight Modes

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Hold Mode** | A Preflight strategy that creates a Hold to reserve tokens before the operation, then Captures the actual cost in Postflight | Authorize-then-capture, two-phase |
| **Check Mode** | A Preflight strategy that only verifies Available Balance without creating a Hold, then directly debits in Postflight | Simple mode, check-then-deduct |

## People & Entities

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **User** | A person authenticated via Better Auth who owns a USER_WALLET | Customer, account, login |
| **Organization** | A group entity (via Better Auth's organization plugin) that can own a USER_WALLET shared by members | Team, company, group, tenant |
| **App Developer** | The developer integrating the Token Wallet plugin into their AI application | Developer, integrator, consumer |

## Concurrency

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Optimistic Locking** | A concurrency strategy where writes check the Lock Version and retry if it changed | OCC, version checking |
| **Pessimistic Locking** | A concurrency strategy where database rows are locked with SELECT FOR UPDATE during reads | Row locking, DB lock |

## Error Handling

| Term | Definition | Aliases to avoid |
| --- | --- | --- |
| **Error Code** | A specific string identifier for a failure condition in a wallet operation (e.g., WALLET_NOT_FOUND, INVALID_AMOUNT) | Error type, failure code |

Phase 1 error codes: WALLET_NOT_FOUND, INVALID_AMOUNT, DUPLICATE_IDEMPOTENCY_KEY, SYSTEM_ACCOUNT_MISSING, MISSING_IDEMPOTENCY_KEY, CREDIT_FAILED

## Relationships

- A **Reference** (user or organization) has exactly one **USER_WALLET** Wallet Account
- A **Wallet** has one **Posted Balance**, one **Pending Debits** total, and one **Available Balance**
- A **Transaction** contains two or more **Entries** (double-entry invariant: SUM(debits) = SUM(credits))
- A **Hold** belongs to one **Transaction** and one **Wallet Account**
- A **Capture** references one **Hold** and one **Transaction** (the capture creates a new Transaction)
- A **Void** references one **Hold** and creates a reversal Transaction
- A **Refund** references one original **Transaction** and creates a reversal Transaction
- A **Top-Up** Credits a **USER_WALLET** and Debits **SYSTEM_REVENUE**
- A **Hold** (in Hold Mode) Debits a **USER_WALLET** (pending) and Credits **SYSTEM_ESCROW** (pending)
- A **Capture** Voids the Hold and creates a new Transaction that Debits **USER_WALLET** (posted) and Credits **SYSTEM_REVENUE** (posted)
- An **Available Balance** is always Posted Balance minus Pending Debits
- A **Wallet** balance can never go below zero (strict prepaid)
- A **Reference Key** uniquely identifies a **Reference** (format: `"user:{id}"` or `"org:{id}"`)
- **System Account Seeding** creates three system Wallet Accounts on plugin initialization
- A **CREDIT_TOPUP** Transaction always involves two entries: DEBIT **SYSTEM_REVENUE** and CREDIT **USER_WALLET**

## Example dialogue

> **Dev:** "When a **User** calls the AI API, I run **Preflight** in **Hold Mode** for 500 **Tokens**. But what if the actual cost turns out to be only 300?"
>
> **Domain expert:** "**Preflight** creates a **Hold** that reserves 500 from the **Available Balance**. After the API returns, **Postflight** does a **Capture** — it **Voids** the 500-token **Hold** and creates a new **Transaction** that **Debits** 300 from the **USER_WALLET** and **Credits** 300 to **SYSTEM_REVENUE**. The remaining 200 returns to **Available Balance**."
>
> **Dev:** "What if the API call fails entirely — should I still **Capture**?"
>
> **Domain expert:** "No — call **Void** instead. That releases the full 500-token **Hold** back to **Available Balance** without any **Debit**."
>
> **Dev:** "And if the app crashes between **Preflight** and **Postflight**?"
>
> **Domain expert:** "The **Hold** stays active. The 500 **Tokens** remain locked in **Pending Debits** indefinitely. The **App Developer** must call **Void** explicitly — or wire up a cron job using the **Void** endpoint to clean up orphaned **Holds**."
>
> **Dev:** "What if two API calls hit at the same time and the **User** only has 600 **Tokens Available**?"
>
> **Domain expert:** "The first **Preflight** succeeds — it reserves 500. The second sees **Available Balance** is now 100, which is insufficient, so it's rejected. If both somehow reach the write simultaneously, **Optimistic Locking** via the **Lock Version** prevents the second write — it retries with the updated balance."

## Example dialogue (Phase 1: Credit Flow)

> **Dev:** "When a **User** signs up, how does their **Wallet** get created?"
>
> **Domain expert:** "The plugin registers a **database hook** on user creation. When the **User** is created, a **USER_WALLET** **Wallet Account** is auto-created with the configured **Initial Balance**. If that hook fails for any reason, the **Credit Endpoint** uses a **find-or-create** pattern to self-heal — it creates the missing wallet on the first **Top-Up**."
>
> **Dev:** "What if I **Top-Up** 1000 **Tokens** for a **User** — how does the **Double-Entry** work?"
>
> **Domain expert:** "The **Credit Endpoint** creates a **CREDIT_TOPUP** **Transaction** with two **Entries**: DEBIT 1000 from **SYSTEM_REVENUE** and CREDIT 1000 to the **USER_WALLET**. Both the **Posted Balance** and **Available Balance** increase by 1000. The **Double-Entry** invariant holds: SUM(debits) = SUM(credits) = 1000."
>
> **Dev:** "What if the payment webhook fires twice?"
>
> **Domain expert:** "Every **Top-Up** requires an **Idempotency Key**. The second request with the same key finds the existing **Transaction** and returns the original result — no second **Credit**, no balance change."

## Flagged ambiguities

- **"Account"** was used ambiguously throughout the design conversation — sometimes meaning a Better Auth user account, sometimes a Wallet Account, and sometimes the account types (USER_WALLET, SYSTEM_REVENUE, etc.). **Canonical usage:** "Wallet Account" for the ledger entity, "User" or "Organization" for the Better Auth entity. Never use "account" alone.
- **"Credit"** was used to mean both the act of topping up tokens AND the ledger entry direction. **Canonical usage:** "Credit" for the entry direction (Credit entry), "Top-Up" for the operation of adding tokens.
- **"Hold" vs "Reservation" vs "Lock"** — these were used interchangeably in early discussion. **Canonical term:** "Hold" everywhere. "Reservation" and "Lock" should be avoided to prevent confusion with database locks (Optimistic/Pessimistic Locking).
- **"Balance"** alone is ambiguous — it could mean posted, pending, or available. **Canonical usage:** Always qualify as "Posted Balance", "Pending Debits", or "Available Balance". Never say just "balance".
- **"Capture" vs "Settle" vs "Postflight"** — Capture is the specific act of resolving a Hold with actual cost. Postflight is the endpoint that triggers Capture. Settle is too vague. **Canonical:** "Capture" for the ledger operation, "Postflight" for the API endpoint.
- **"Preflight"** is used as both an endpoint name and a concept. The endpoint `/token-wallet/preflight` can operate in Hold Mode or Check Mode — these are distinct strategies, not synonyms for Preflight itself.
- **"referenceId + referenceType"** was used in the original PRD to identify a Reference as two separate fields. **Canonical usage**: A single **Reference Key** string (e.g., `"user:abc123"`) replaces the two-field approach. The original fields are merged for simplicity and to enable single-field unique constraints.
- **"Initial Balance"** could mean either the starting column value or a real CREDIT_TOPUP transaction. **Canonical usage**: When `initialBalance > 0`, a real **CREDIT_TOPUP** **Transaction** is created (ledger integrity), not just a column set.

