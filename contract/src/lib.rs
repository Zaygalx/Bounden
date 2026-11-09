//! Bounden shop contract — the constitution of the store.
//!
//! Bounden is a digital-goods shop run by an autonomous agent whose entire
//! on-chain authority is exactly two methods on this contract:
//! `fulfil_order` and `issue_refund`, exercised through an allowlisted
//! function-call access key. Everything else — catalogue, prices, policy
//! bands, treasury — is governed here, in public, where anyone can inspect
//! it. The agent is bound. The money is not the agent's to move.
//!
//! Payment: orders are created with `create_order`, then paid by sending
//! the settlement token (a NEP-141 USD stablecoin; testnet `usdc.testnet`)
//! to this contract via `ft_transfer_call`. Native NEAR is never accepted
//! as payment. The treasury is the contract's own token balance, and the
//! only way out of it is `withdraw_treasury` — owner-only, and the
//! destination is hard-coded to the owner account (no address parameter;
//! that is a deliberate constitution choice, not an oversight).
//!
//! Events: every consequential transition emits an `EVENT_JSON:` log line
//! in the NEP-297 style (`bounden_order_created`, `bounden_order_paid`,
//! `bounden_order_fulfilled`, `bounden_order_refunded`,
//! `bounden_refund_rejected`, `bounden_order_rejected_payment`,
//! `bounden_treasury_withdrawn`) so the Stage 2 worker and the attack
//! suite can observe outcomes from transaction logs.

// Borsh derives come from near_sdk macros (#[near(serializers = [borsh])]);
// near-sdk 5.x conflicts if borsh derives are also applied manually.
use near_sdk::collections::{LookupMap, UnorderedMap, Vector};
use near_sdk::json_types::U128;
use near_sdk::{env, ext_contract, near, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue, Timestamp};
use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;

/// Cross-contract interface for the NEP-141 settlement token, used to send
/// refunds and treasury withdrawals out of the contract's token balance.
#[ext_contract(ext_ft)]
pub trait FungibleTokenCore {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

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
/// Paid | Fulfilled -> Refunded    (agent, within the refund band)
/// Paid | Fulfilled -> RefundRejected (agent attempt outside the band:
///                                     the refusal is recorded, and the
///                                     owner reviews)
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

/// A read-only snapshot of the constitution, for the storefront's public
/// Constitution page and for the attack suite's pre-flight checks.
#[near(serializers = [json])]
pub struct ConstitutionView {
    pub owner_id: AccountId,
    pub agent_account_id: Option<AccountId>,
    pub agent_code_hash: Option<String>,
    pub payment_token: AccountId,
    pub price_band_bps: u32,
    pub refund_cap_usd: U128,
    pub refund_window_ns: u64,
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

/// Emit a NEP-297-style event log line. Data values are contract-internal
/// identifiers, amounts and hashes; order ids are numeric so no JSON
/// escaping hazards arise from them. Free-form strings (product ids) go
/// through serde_json so the line stays valid JSON.
fn emit_event(event: &str, data_json: String) {
    env::log_str(&format!(
        "EVENT_JSON:{{\"standard\":\"bounden\",\"version\":\"1.0.0\",\"event\":\"{}\",\"data\":[{}]}}",
        event, data_json
    ));
}

fn json_str(s: &str) -> String {
    serde_json::to_string(s).expect("string serialisation cannot fail")
}

#[near]
impl BoundenShop {
    /// One-time constitution writing. Called once at deployment by the
    /// owner; every rule the agent will ever live under is set here or by
    /// later owner-only amendments.
    #[init]
    pub fn new(
        owner_id: AccountId,
        payment_token: AccountId,
        price_band_bps: u32,
        refund_cap_usd: U128,
        refund_window_ns: u64,
    ) -> Self {
        assert!(!env::state_exists(), "contract already initialised");
        assert!(price_band_bps <= 10_000, "price band cannot exceed 100%");
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

    // ---- Owner-only administration: the constitution's amendment path. ----

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "only the shop owner may do this"
        );
    }

    fn assert_agent(&self) {
        assert_eq!(
            Some(env::predecessor_account_id()),
            self.agent_account_id,
            "only the registered agent may do this"
        );
    }

    /// Register (or rotate) the cashier agent: its account and the hash of
    /// the approved worker code. Owner-only. Rotating the agent is how a
    /// compromised or upgraded cashier is replaced — the old account loses
    /// all authority the moment this lands.
    pub fn set_agent(&mut self, agent_account_id: AccountId, agent_code_hash: String) {
        self.assert_owner();
        assert!(!agent_code_hash.is_empty(), "agent code hash must not be empty");
        self.agent_account_id = Some(agent_account_id.clone());
        self.agent_code_hash = Some(agent_code_hash);
        emit_event(
            "bounden_agent_set",
            format!("{{\"agent_account_id\":{}}}", json_str(agent_account_id.as_str())),
        );
    }

    /// Add a product to the catalogue. Owner-only. The initial price is
    /// the owner's free choice; every *later* change is band-checked (see
    /// `update_product`).
    pub fn add_product(
        &mut self,
        product_id: String,
        name: String,
        kind: ProductKind,
        price_usd: U128,
    ) {
        self.assert_owner();
        assert!(!product_id.is_empty(), "product id must not be empty");
        assert!(price_usd.0 > 0, "price must be positive");
        assert!(
            self.products.get(&product_id).is_none(),
            "product already exists; use update_product"
        );
        self.products.insert(
            &product_id,
            &Product {
                id: product_id.clone(),
                name,
                kind,
                price_usd,
                active: true,
            },
        );
        emit_event(
            "bounden_product_added",
            format!(
                "{{\"product_id\":{},\"price_usd\":\"{}\"}}",
                json_str(&product_id),
                price_usd.0
            ),
        );
    }

    /// Amend a product (name, price, active flag). Owner-only, and the
    /// PRICE BAND is enforced here: |new - current| must be at most
    /// `price_band_bps` basis points of the current price. A price move
    /// outside the band is rejected by the contract — even the owner
    /// cannot reprice the shop to zero or to a million in one step.
    /// `None` arguments leave the field unchanged.
    pub fn update_product(
        &mut self,
        product_id: String,
        name: Option<String>,
        price_usd: Option<U128>,
        active: Option<bool>,
    ) {
        self.assert_owner();
        let mut product = self
            .products
            .get(&product_id)
            .unwrap_or_else(|| env::panic_str("product not found"));
        if let Some(new_price) = price_usd {
            assert!(new_price.0 > 0, "price must be positive");
            self.assert_price_within_band(product.price_usd.0, new_price.0);
            product.price_usd = new_price;
        }
        if let Some(name) = name {
            product.name = name;
        }
        if let Some(active) = active {
            product.active = active;
        }
        self.products.insert(&product_id, &product);
        emit_event(
            "bounden_product_updated",
            format!(
                "{{\"product_id\":{},\"price_usd\":\"{}\"}}",
                json_str(&product_id),
                product.price_usd.0
            ),
        );
    }

    /// Band check in basis points of the current price, done in u128
    /// arithmetic: allowed deviation = current * bps / 10_000.
    fn assert_price_within_band(&self, current: u128, new: u128) {
        let max_delta = current.saturating_mul(self.price_band_bps as u128) / 10_000;
        let delta = current.abs_diff(new);
        assert!(
            delta <= max_delta,
            "price change outside the price band: {} -> {} exceeds {} bps",
            current,
            new,
            self.price_band_bps
        );
    }

    /// Stock sealed inventory for a product: SHA-256 commitments only.
    /// Plaintext codes must NEVER be passed here — contract state is
    /// public. Owner-only. Duplicate commitments are rejected so stock
    /// counts stay honest.
    pub fn add_inventory_commitments(&mut self, product_id: String, code_hashes: Vec<String>) {
        self.assert_owner();
        assert!(
            self.products.get(&product_id).is_some(),
            "product not found"
        );
        assert!(!code_hashes.is_empty(), "no commitments supplied");
        let mut vec = self
            .inventory
            .get(&product_id)
            .unwrap_or_else(|| Vector::new(self.inventory_prefix(&product_id)));
        for hash in &code_hashes {
            assert!(
                hash.len() == 64
                    && hash.chars().all(|c| c.is_ascii_hexdigit()),
                "commitment must be a SHA-256 hex digest (64 hex chars)"
            );
            for existing in vec.iter() {
                assert!(existing.code_hash != *hash, "duplicate inventory commitment");
            }
            vec.push(&InventoryCommitment {
                product_id: product_id.clone(),
                code_hash: hash.clone(),
                consumed: false,
                consumed_by_order: None,
            });
        }
        let total = vec.len();
        self.inventory.insert(&product_id, &vec);
        emit_event(
            "bounden_inventory_stocked",
            format!(
                "{{\"product_id\":{},\"total_commitments\":{}}}",
                json_str(&product_id),
                total
            ),
        );
    }

    fn inventory_prefix(&self, product_id: &str) -> Vec<u8> {
        // Per-product storage prefix: "i" + product_id bytes, kept distinct
        // from the other collections' prefixes by StorageKey above.
        let mut prefix = b"i".to_vec();
        prefix.extend_from_slice(product_id.as_bytes());
        prefix
    }

    /// Withdraw accumulated stablecoin from the treasury. OWNER-ONLY, and
    /// the destination is hard-coded to the owner account — there is
    /// deliberately no address parameter, so no caller (and no compromised
    /// agent session, and no prompt injection) can redirect a withdrawal.
    /// Returns the token transfer promise; the amount moved is the
    /// contract's own token balance, which is the treasury by definition.
    #[payable]
    pub fn withdraw_treasury(&mut self, amount: U128) -> Promise {
        self.assert_owner();
        assert!(
            env::attached_deposit().as_yoctonear() == 1,
            "exactly 1 yoctoNEAR must be attached for ft_transfer"
        );
        assert!(amount.0 > 0, "amount must be positive");
        emit_event(
            "bounden_treasury_withdrawn",
            format!(
                "{{\"to\":{},\"amount\":\"{}\"}}",
                json_str(self.owner_id.as_str()),
                amount.0
            ),
        );
        ext_ft::ext(self.payment_token.clone()).ft_transfer(
            self.owner_id.clone(),
            amount,
            Some("Bounden treasury withdrawal".to_string()),
        )
    }

    // ---- Buyer flow: create, pay, (cancel). ----

    /// Create an order for a product. The price is copied from the product
    /// at creation time, so later price changes can never rewrite an open
    /// order. Payment itself happens via `ft_transfer_call` (see
    /// `ft_on_transfer`); native NEAR is not accepted.
    pub fn create_order(&mut self, product_id: String) -> u64 {
        let product = self
            .products
            .get(&product_id)
            .unwrap_or_else(|| env::panic_str("product not found"));
        assert!(product.active, "product is not active");
        let buyer = env::predecessor_account_id();
        let id = self.next_order_id;
        let order = Order {
            id,
            buyer: buyer.clone(),
            product_id: product_id.clone(),
            amount_usd: product.price_usd,
            state: OrderState::Created,
            created_at: env::block_timestamp(),
            paid_at: None,
            judgement_attestation_hash: None,
        };
        self.orders.insert(&id, &order);
        self.next_order_id = id + 1;
        emit_event(
            "bounden_order_created",
            format!(
                "{{\"order_id\":{},\"buyer\":{},\"product_id\":{},\"amount\":\"{}\"}}",
                id,
                json_str(buyer.as_str()),
                json_str(&product_id),
                order.amount_usd.0
            ),
        );
        id
    }

    /// Cancel an unpaid order. Buyer-only, and only while `Created` —
    /// once payment lands, the refund path (agent, in-band) governs.
    pub fn cancel_order(&mut self, order_id: u64) {
        let mut order = self.get_order_internal(order_id);
        assert_eq!(
            env::predecessor_account_id(),
            order.buyer,
            "only the buyer may cancel their order"
        );
        assert!(
            order.state == OrderState::Created,
            "only an unpaid (Created) order can be cancelled"
        );
        order.state = OrderState::Cancelled;
        self.orders.insert(&order_id, &order);
        emit_event(
            "bounden_order_cancelled",
            format!("{{\"order_id\":{}}}", order_id),
        );
    }

    // ---- The agent's entire authority: exactly these two methods. ----

    /// Deliver a paid order: consume exactly one sealed inventory
    /// commitment and record the delivery evidence hash (and the NEAR AI
    /// Cloud attestation hash for the fulfilment judgement, when Stage 3
    /// supplies one). Callable ONLY by the registered agent account.
    pub fn fulfil_order(
        &mut self,
        order_id: u64,
        delivery_evidence_hash: String,
        attestation_hash: Option<String>,
    ) {
        self.assert_agent();
        let mut order = self.get_order_internal(order_id);
        assert!(
            order.state == OrderState::Paid,
            "only a Paid order can be fulfilled"
        );
        // Consume exactly one unconsumed commitment for this product.
        let mut vec = self
            .inventory
            .get(&order.product_id)
            .unwrap_or_else(|| env::panic_str("no inventory stocked for product"));
        let mut consumed_idx: Option<u64> = None;
        for i in 0..vec.len() {
            if let Some(mut commitment) = vec.get(i) {
                if !commitment.consumed {
                    commitment.consumed = true;
                    commitment.consumed_by_order = Some(order_id);
                    vec.replace(i, &commitment);
                    consumed_idx = Some(i);
                    break;
                }
            }
        }
        assert!(consumed_idx.is_some(), "inventory exhausted for product");
        self.inventory.insert(&order.product_id, &vec);

        if let Some(att) = &attestation_hash {
            order.judgement_attestation_hash = Some(att.clone());
        }
        order.state = OrderState::Fulfilled;
        self.orders.insert(&order_id, &order);
        self.fulfilment_log.push(&FulfilmentRecord {
            order_id,
            action: "fulfil".to_string(),
            evidence_hash: delivery_evidence_hash.clone(),
            attestation_hash: attestation_hash.clone(),
            at: env::block_timestamp(),
        });
        emit_event(
            "bounden_order_fulfilled",
            format!(
                "{{\"order_id\":{},\"evidence_hash\":{}}}",
                order_id,
                json_str(&delivery_evidence_hash)
            ),
        );
    }

    /// Refund an order from the treasury, inside the policy band only:
    /// amount (the order's paid amount) <= `refund_cap_usd` AND
    /// now - paid_at <= `refund_window_ns`. Callable ONLY by the
    /// registered agent account.
    ///
    /// Refundable states follow docs/PLAN.md's state machine: `Paid`
    /// (paid, not yet fulfilled) and `Fulfilled` (delivered, refunded
    /// inside the window). A band failure on a valid agent call does NOT
    /// panic silently into ambiguity: the order moves to
    /// `RefundRejected`, a `bounden_refund_rejected` event records the
    /// refusal, and the owner reviews — exactly the state the plan names
    /// for "outside the band: owner review".
    ///
    /// Note: rejections that happen because the agent's *key* cannot call
    /// anything else (a treasury drain attempt, say) never reach this
    /// contract at all — the function-call key allowlist refuses them
    /// before execution. Those are demonstrated by the attack suite, not
    /// recorded here. What is recorded here is a legitimate agent call
    /// that the *policy band* refuses.
    #[payable]
    pub fn issue_refund(&mut self, order_id: u64, attestation_hash: Option<String>) -> PromiseOrValue<()> {
        self.assert_agent();
        let mut order = self.get_order_internal(order_id);
        assert!(
            order.state == OrderState::Paid || order.state == OrderState::Fulfilled,
            "only a Paid or Fulfilled order can be refunded"
        );
        let paid_at = order.paid_at.expect("a paid order always has paid_at");
        let amount = order.amount_usd.0;
        let within_cap = amount <= self.refund_cap_usd.0;
        let within_window =
            env::block_timestamp().saturating_sub(paid_at) <= self.refund_window_ns;
        if !(within_cap && within_window) {
            // Policy-band refusal: record it, park the order for owner
            // review, move no money.
            order.state = OrderState::RefundRejected;
            self.orders.insert(&order_id, &order);
            emit_event(
                "bounden_refund_rejected",
                format!(
                    "{{\"order_id\":{},\"amount\":\"{}\",\"within_cap\":{},\"within_window\":{}}}",
                    order_id, amount, within_cap, within_window
                ),
            );
            return PromiseOrValue::Value(());
        }
        if let Some(att) = &attestation_hash {
            order.judgement_attestation_hash = Some(att.clone());
        }
        let buyer = order.buyer.clone();
        order.state = OrderState::Refunded;
        self.orders.insert(&order_id, &order);
        self.fulfilment_log.push(&FulfilmentRecord {
            order_id,
            action: "refund".to_string(),
            // Evidence for a refund is the transfer itself; the receipt
            // resolves on-chain under this transaction.
            evidence_hash: "ft_transfer".to_string(),
            attestation_hash,
            at: env::block_timestamp(),
        });
        emit_event(
            "bounden_order_refunded",
            format!(
                "{{\"order_id\":{},\"buyer\":{},\"amount\":\"{}\"}}",
                order_id,
                json_str(buyer.as_str()),
                amount
            ),
        );
        assert!(
            env::attached_deposit().as_yoctonear() == 1,
            "exactly 1 yoctoNEAR must be attached for ft_transfer"
        );
        PromiseOrValue::Promise(ext_ft::ext(self.payment_token.clone()).ft_transfer(
            buyer,
            order.amount_usd,
            Some(format!("Bounden refund for order {}", order_id)),
        ))
    }

    // ---- Views ----

    fn get_order_internal(&self, order_id: u64) -> Order {
        self.orders
            .get(&order_id)
            .unwrap_or_else(|| env::panic_str("order not found"))
    }

    pub fn get_product(&self, product_id: String) -> Option<Product> {
        self.products.get(&product_id)
    }

    pub fn get_order(&self, order_id: u64) -> Option<Order> {
        self.orders.get(&order_id)
    }

    /// The whole constitution, readable by anyone — that is the point.
    pub fn get_constitution(&self) -> ConstitutionView {
        ConstitutionView {
            owner_id: self.owner_id.clone(),
            agent_account_id: self.agent_account_id.clone(),
            agent_code_hash: self.agent_code_hash.clone(),
            payment_token: self.payment_token.clone(),
            price_band_bps: self.price_band_bps,
            refund_cap_usd: self.refund_cap_usd,
            refund_window_ns: self.refund_window_ns,
        }
    }

    /// Page through the append-only fulfilment/refund log.
    pub fn get_fulfilment_log(
        &self,
        from_index: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<FulfilmentRecord> {
        let start = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50);
        self.fulfilment_log
            .iter()
            .skip(start as usize)
            .take(limit as usize)
            .collect()
    }

    pub fn fulfilment_log_len(&self) -> u64 {
        self.fulfilment_log.len()
    }

    /// How many sealed units remain for a product (commitments are public;
    /// the codes behind them are not).
    pub fn inventory_available(&self, product_id: String) -> u64 {
        match self.inventory.get(&product_id) {
            Some(vec) => vec.iter().filter(|c| !c.consumed).count() as u64,
            None => 0,
        }
    }
}

/// NEP-141 receiver: this is the ONLY way an order gets paid.
///
/// Called by the payment token contract as part of `ft_transfer_call`.
/// The buyer must pass `msg` = the order id as a decimal string (e.g.
/// "0"). Rules, all enforced before any state changes:
/// - the caller (predecessor) must be exactly `payment_token` — a fake
///   token cannot fake a payment;
/// - the sender must be the order's buyer (no third-party payments);
/// - the order must be in `Created` state;
/// - the amount must equal the order amount EXACTLY. Overpayment and
///   underpayment are both rejected by returning the full amount as
///   unused, which makes the token contract refund the sender in full —
///   no partial grabs, no dust left behind, and a
///   `bounden_order_rejected_payment` event records the refusal.
///
/// On success the order moves Created -> Paid, `paid_at` is stamped, and
/// zero tokens are returned as unused (the contract keeps the payment).
#[near]
impl FungibleTokenReceiver for BoundenShop {
    fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        assert_eq!(
            env::predecessor_account_id(),
            self.payment_token,
            "payments must arrive through the settlement token (usdc.testnet)"
        );
        let reject = |reason: &str, order_id: Option<u64>| -> PromiseOrValue<U128> {
            emit_event(
                "bounden_order_rejected_payment",
                format!(
                    "{{\"order_id\":{},\"sender\":{},\"amount\":\"{}\",\"reason\":{}}}",
                    order_id.map(|i| i.to_string()).unwrap_or_else(|| "null".to_string()),
                    json_str(sender_id.as_str()),
                    amount.0,
                    json_str(reason)
                ),
            );
            // Returning the full amount marks every token as unused; the
            // token contract refunds the sender in full.
            PromiseOrValue::Value(amount)
        };
        let order_id: u64 = match msg.trim().parse() {
            Ok(id) => id,
            Err(_) => return reject("msg is not an order id", None),
        };
        let mut order = match self.orders.get(&order_id) {
            Some(o) => o,
            None => return reject("unknown order", Some(order_id)),
        };
        if order.buyer != sender_id {
            return reject("sender is not the order buyer", Some(order_id));
        }
        if order.state != OrderState::Created {
            return reject("order is not awaiting payment", Some(order_id));
        }
        if amount.0 != order.amount_usd.0 {
            return reject("amount does not equal the order amount exactly", Some(order_id));
        }
        order.state = OrderState::Paid;
        order.paid_at = Some(env::block_timestamp());
        self.orders.insert(&order_id, &order);
        emit_event(
            "bounden_order_paid",
            format!(
                "{{\"order_id\":{},\"buyer\":{},\"amount\":\"{}\"}}",
                order_id,
                json_str(sender_id.as_str()),
                amount.0
            ),
        );
        PromiseOrValue::Value(U128(0))
    }
}

#[cfg(test)]
mod tests;
