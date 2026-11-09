//! Bounden shop contract — the constitution of the store.
//!
//! Bounden is a digital-goods shop run by an autonomous agent whose entire
//! on-chain authority is exactly two methods on this contract:
//! `fulfil_order` and `issue_refund`, exercised through an allowlisted
//! function-call access key. Everything else — catalogue, prices, policy
//! bands, treasury — is governed here, in public, where anyone can inspect
//! it. The agent is bound. The money is not the agent's to move.
//!
//! Stage 1 foundation: state types and storage layout only. Methods are
//! stubbed with TODOs and land in Stage 1 proper / Stage 2.

// Borsh derives come from near_sdk macros (#[near(serializers = [borsh])]);
// near-sdk 5.x conflicts if borsh derives are also applied manually.
use near_sdk::collections::{LookupMap, UnorderedMap, Vector};
use near_sdk::BorshStorageKey;
use near_sdk::json_types::U128;
use near_sdk::{env, near, AccountId, PanicOnDefault, Timestamp};

/// Storage key prefixes for the contract's collections.
/// Legacy collections take the prefix type via IntoStorageKey, which
/// near-sdk's borsh serializer derive provides.
#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    Products,
    Orders,
    InventoryCommitments,
    FulfilmentLog,
}

/// Lifecycle of an order. Transitions are enforced by the contract, never
/// by the agent's say-so:
///
/// ```text
/// Created -> Paid -> Fulfilled
/// Created -> Cancelled            (buyer, before payment)
/// Paid    -> Refunded             (agent, within the refund band)
/// Paid    -> RefundRejected       (outside the band: owner review)
/// ```
#[derive(Clone, PartialEq, Debug)]
#[near(serializers = [borsh, json])]
pub enum OrderState {
    Created,
    Paid,
    Fulfilled,
    Cancelled,
    Refunded,
    RefundRejected,
}

/// What kind of digital good a product delivers. The catalogue is global:
/// no region-specific goods, no local currency anywhere.
#[derive(Clone, PartialEq, Debug)]
#[near(serializers = [borsh, json])]
pub enum ProductKind {
    /// A software licence key, delivered as a sealed code.
    LicenceKey,
    /// An API credit / top-up code, delivered as a sealed code.
    ApiCreditCode,
    /// A downloadable file; fulfilment releases a signed, expiring URL.
    DownloadableAsset,
}

/// A catalogue entry. Prices are USD-denominated and stored in the
/// settlement token's base units (see `payment_token` on the contract).
#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct Product {
    pub id: String,
    pub name: String,
    pub kind: ProductKind,
    /// Price in stablecoin base units (e.g. 6-decimal USD: $12.50 = 12_500_000).
    pub price_usd: U128,
    pub active: bool,
}

/// A single order, created by a buyer and settled in the payment token.
#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct Order {
    pub id: u64,
    pub buyer: AccountId,
    pub product_id: String,
    /// Amount due, copied from the product at creation time so later price
    /// changes can never rewrite an open order.
    pub amount_usd: U128,
    pub state: OrderState,
    pub created_at: Timestamp,
    pub paid_at: Option<Timestamp>,
    /// Hash of the NEAR AI Cloud attestation for the judgement call that
    /// approved fulfilment/refund, once one exists (Stage 3). The raw
    /// attestation lives with the receipt; only its hash is public.
    pub judgement_attestation_hash: Option<String>,
}

/// One sealed inventory unit. The code itself is NEVER stored on-chain:
/// contract state is public. What lives here is a commitment (hash) plus
/// the lifecycle flag. Plaintext codes sit in the worker's encrypted
/// vault; the worker is the only decryptor (Stage 2 design, docs/PLAN.md).
#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct InventoryCommitment {
    pub product_id: String,
    /// SHA-256 hex of the code, committed before any order exists.
    pub code_hash: String,
    pub consumed: bool,
    pub consumed_by_order: Option<u64>,
}

/// A public, append-only record that a fulfilment or refund happened,
/// with the evidence hashes a judge (or a customer) can verify against.
#[derive(Clone)]
#[near(serializers = [borsh, json])]
pub struct FulfilmentRecord {
    pub order_id: u64,
    /// "fulfil" or "refund" — kept as data, not an enum, so the log format
    /// can grow without a storage migration.
    pub action: String,
    /// Hash of the delivery ciphertext (code re-encrypted to the buyer),
    /// or of the refund transaction receipt.
    pub evidence_hash: String,
    pub attestation_hash: Option<String>,
    pub at: Timestamp,
}

/// The constitution itself.
#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct BoundenShop {
    /// The shop owner. The ONLY account that can change the constitution,
    /// register the agent, or withdraw from the treasury.
    pub owner_id: AccountId,
    /// The registered agent (cashier) account. It holds no full-access key
    /// over the shop; its power is a function-call key allowlisted to
    /// `fulfil_order` and `issue_refund` on this contract — nothing else.
    pub agent_account_id: Option<AccountId>,
    /// Hash of the approved agent worker code (pinned at registration;
    /// a different binary is a different, unregistered agent).
    pub agent_code_hash: Option<String>,
    /// The NEP-141 token that settles orders (a USD stablecoin).
    /// Testnet: usdc.testnet (USDC, 6 decimals) — see docs/PREFLIGHT.md.
    pub payment_token: AccountId,
    /// Prices may move at most this many basis points per owner update,
    /// so a compromised owner session still cannot silently reprice the
    /// shop to zero or to a million in one step.
    pub price_band_bps: u32,
    /// Refund policy band: the agent may auto-refund at most this much
    /// (stablecoin base units) per order…
    pub refund_cap_usd: U128,
    /// …and only within this many nanoseconds of payment.
    pub refund_window_ns: u64,
    /// product_id -> Product
    pub products: UnorderedMap<String, Product>,
    /// order id -> Order
    pub orders: LookupMap<u64, Order>,
    pub next_order_id: u64,
    /// product_id -> its sealed inventory commitments
    pub inventory: LookupMap<String, Vector<InventoryCommitment>>,
    /// Append-only public fulfilment/refund log.
    pub fulfilment_log: Vector<FulfilmentRecord>,
}

#[near]
impl BoundenShop {
    /// One-time constitution writing. Called once at deployment by the
    /// owner; every rule the agent will ever live under is set here or by
    /// later owner-only amendments.
    // TODO(stage-1): implement initialisation + owner-only setters
    // (register_agent, set_price_band, set_refund_policy, add_product,
    // stock_inventory commitments, withdraw_treasury).
    #[init]
    pub fn new(
        owner_id: AccountId,
        payment_token: AccountId,
        price_band_bps: u32,
        refund_cap_usd: U128,
        refund_window_ns: u64,
    ) -> Self {
        assert!(!env::state_exists(), "contract already initialised");
        Self {
            owner_id,
            agent_account_id: None,
            agent_code_hash: None,
            payment_token,
            price_band_bps,
            refund_cap_usd,
            refund_window_ns,
            products: UnorderedMap::new(StorageKey::Products),
            orders: LookupMap::new(StorageKey::Orders),
            next_order_id: 0,
            inventory: LookupMap::new(StorageKey::InventoryCommitments),
            fulfilment_log: Vector::new(StorageKey::FulfilmentLog),
        }
    }

    // ---- The agent's entire authority: exactly these two methods. ----

    /// Deliver a paid order: consume one sealed inventory commitment and
    /// record the delivery evidence hash. Callable ONLY by the registered
    /// agent account.
    // TODO(stage-2): implement — assert caller is agent_account_id, order
    // is Paid, judgement attestation present; consume commitment; append
    // FulfilmentRecord; move order to Fulfilled.
    pub fn fulfil_order(&mut self, _order_id: u64, _delivery_evidence_hash: String) {
        env::panic_str("TODO(stage-2): fulfil_order not yet implemented");
    }

    /// Refund a paid order from the treasury, inside the policy band only
    /// (amount <= refund_cap_usd AND now - paid_at <= refund_window_ns).
    /// Callable ONLY by the registered agent account; anything outside the
    /// band is rejected by the contract, not by the agent's goodwill.
    // TODO(stage-2): implement — assert caller, state, band; ft_transfer
    // back to buyer via the payment token; log; move order to Refunded.
    pub fn issue_refund(&mut self, _order_id: u64) {
        env::panic_str("TODO(stage-2): issue_refund not yet implemented");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn order_state_variants_exist() {
        // The state machine is the product's spine; pin its shape early.
        let states = [
            OrderState::Created,
            OrderState::Paid,
            OrderState::Fulfilled,
            OrderState::Cancelled,
            OrderState::Refunded,
            OrderState::RefundRejected,
        ];
        assert_eq!(states.len(), 6);
    }

    #[test]
    fn product_kinds_are_global() {
        let kinds = [
            ProductKind::LicenceKey,
            ProductKind::ApiCreditCode,
            ProductKind::DownloadableAsset,
        ];
        assert_eq!(kinds.len(), 3);
    }
}
