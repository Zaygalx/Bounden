//! Unit tests for the Bounden constitution. Every Stage 1 rule in
//! docs/PLAN.md has a test here: owner gate, agent gate, price band,
//! exact payment, fulfilment, refund band (cap + window), treasury lock.

use super::*;
use near_sdk::test_utils::{accounts, get_created_receipts, get_logs, VMContextBuilder};
use near_sdk::testing_env;
use near_sdk::NearToken;

/// Regression guard for the 1-yocto ft_transfer defect (see NOTES.md):
/// find the recorded receipt this call created for an `ft_transfer` to
/// `receiver` and assert the promise attached exactly 1 yoctoNEAR —
/// the deposit NEP-141 requires. The mock environment records the
/// promise this contract schedules for dispatch (the receipt appears
/// once the returned promise is consumed — hence the `drop(...)` calls
/// in the two tests that use this helper) without executing it, so this
/// proves the deposit is attached to the call this contract creates;
/// it cannot prove the token contract accepts it on-chain (that is a
/// testnet check, in the deployment stage).
fn assert_ft_transfer_receipt(receiver: &AccountId) {
    let receipts = get_created_receipts();
    let receipt = receipts
        .iter()
        .find(|r| &r.receiver_id == receiver)
        .unwrap_or_else(|| panic!("no receipt created for {}", receiver));
    assert!(
        receipt.actions.iter().any(|a| matches!(
            a,
            near_sdk::mock::MockAction::FunctionCallWeight {
                method_name,
                attached_deposit,
                ..
            } if method_name == b"ft_transfer"
                && *attached_deposit == NearToken::from_yoctonear(1)
        )),
        "ft_transfer to {} must carry exactly 1 yoctoNEAR; actions: {:?}",
        receiver,
        receipt.actions
    );
}

const PRICE: u128 = 10_000_000; // $10.00 in 6-decimal base units
const CAP: u128 = 50_000_000; // refund cap $50.00
const WINDOW_NS: u64 = 3_600_000_000_000; // 1 hour
const T0: u64 = 1_000_000_000_000; // arbitrary block timestamp

fn owner() -> AccountId {
    accounts(0)
}
fn agent() -> AccountId {
    accounts(1)
}
fn buyer() -> AccountId {
    accounts(2)
}
fn stranger() -> AccountId {
    accounts(3)
}
fn token() -> AccountId {
    "usdc.testnet".parse().unwrap()
}

fn context(predecessor: &AccountId, timestamp: u64, deposit_yocto: u128) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(accounts(4))
        .predecessor_account_id(predecessor.clone())
        .block_timestamp(timestamp)
        .attached_deposit(NearToken::from_yoctonear(deposit_yocto));
    builder
}

fn shop() -> BoundenShop {
    testing_env!(context(&owner(), T0, 0).build());
    BoundenShop::new(owner(), token(), 1000, U128(CAP), WINDOW_NS)
}

/// Shop with an agent registered and one $10 product stocked with 2 units.
fn stocked_shop() -> BoundenShop {
    let mut shop = shop();
    testing_env!(context(&owner(), T0, 0).build());
    shop.set_agent(agent(), "a".repeat(64));
    shop.add_product(
        "licence-pro".to_string(),
        "Pro Licence".to_string(),
        ProductKind::LicenceKey,
        U128(PRICE),
    );
    shop.add_inventory_commitments(
        "licence-pro".to_string(),
        vec!["b".repeat(64), "c".repeat(64)],
    );
    shop
}


/// Drive an order to Paid through the real ft_on_transfer path.
fn paid_order(shop: &mut BoundenShop) -> u64 {
    testing_env!(context(&buyer(), T0, 0).build());
    let id = shop.create_order("licence-pro".to_string());
    testing_env!(context(&token(), T0 + 1, 0).build());
    let unused = shop.ft_on_transfer(buyer(), U128(PRICE), id.to_string());
    match unused {
        PromiseOrValue::Value(v) => assert_eq!(v.0, 0, "exact payment must be fully used"),
        PromiseOrValue::Promise(_) => panic!("ft_on_transfer must not return a promise"),
    }
    id
}

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

#[test]
#[should_panic(expected = "only the shop owner may do this")]
fn non_owner_cannot_set_agent() {
    let mut shop = shop();
    testing_env!(context(&stranger(), T0, 0).build());
    shop.set_agent(agent(), "a".repeat(64));
}

#[test]
fn owner_can_set_and_rotate_agent() {
    let mut shop = shop();
    testing_env!(context(&owner(), T0, 0).build());
    shop.set_agent(agent(), "a".repeat(64));
    assert_eq!(shop.get_constitution().agent_account_id, Some(agent()));
    shop.set_agent(stranger(), "d".repeat(64));
    assert_eq!(shop.get_constitution().agent_account_id, Some(stranger()));
}

#[test]
#[should_panic(expected = "only the shop owner may do this")]
fn non_owner_cannot_withdraw_treasury() {
    let mut shop = stocked_shop();
    testing_env!(context(&agent(), T0, 1).build());
    let _ = shop.withdraw_treasury(U128(1));
}

#[test]
fn owner_withdraws_treasury_to_owner() {
    let mut shop = stocked_shop();
    let _id = paid_order(&mut shop);
    testing_env!(context(&owner(), T0 + 2, 1).build());
    // Reaching here without a panic is the assertion: the transfer promise
    // targets the owner because the method hard-codes the destination.
    let promise = shop.withdraw_treasury(U128(PRICE));
    let logs = get_logs();
    assert!(logs.iter().any(|l| l.contains("bounden_treasury_withdrawn")));
    // The transfer goes to the token contract carrying exactly 1 yocto.
    // (The promise must be consumed first: near-sdk registers the receipt
    // when the returned promise is returned-or-dropped, not at creation.)
    drop(promise);
    assert_ft_transfer_receipt(&token());
}

#[test]
#[should_panic(expected = "price change outside the price band")]
fn price_change_outside_band_rejected() {
    let mut shop = stocked_shop();
    testing_env!(context(&owner(), T0, 0).build());
    // Band is 1000 bps = 10%: $10 -> $12 is a 20% move.
    shop.update_product("licence-pro".to_string(), None, Some(U128(12_000_000)), None);
}

#[test]
fn price_change_inside_band_accepted() {
    let mut shop = stocked_shop();
    testing_env!(context(&owner(), T0, 0).build());
    // $10 -> $11 is exactly the 10% band edge; allowed.
    shop.update_product("licence-pro".to_string(), None, Some(U128(11_000_000)), None);
    assert_eq!(
        shop.get_product("licence-pro".to_string()).unwrap().price_usd.0,
        11_000_000
    );
    // A fresh order takes the new price; the band is per update.
    testing_env!(context(&buyer(), T0, 0).build());
    let id = shop.create_order("licence-pro".to_string());
    assert_eq!(shop.get_order(id).unwrap().amount_usd.0, 11_000_000);
}

#[test]
fn underpayment_rejected_and_refunded_in_full() {
    let mut shop = stocked_shop();
    testing_env!(context(&buyer(), T0, 0).build());
    let id = shop.create_order("licence-pro".to_string());
    testing_env!(context(&token(), T0 + 1, 0).build());
    let unused = shop.ft_on_transfer(buyer(), U128(PRICE - 1), id.to_string());
    match unused {
        PromiseOrValue::Value(v) => assert_eq!(v.0, PRICE - 1, "full underpayment returned"),
        PromiseOrValue::Promise(_) => panic!("must not return a promise"),
    }
    assert_eq!(shop.get_order(id).unwrap().state, OrderState::Created);
}

#[test]
fn overpayment_rejected_and_refunded_in_full() {
    let mut shop = stocked_shop();
    testing_env!(context(&buyer(), T0, 0).build());
    let id = shop.create_order("licence-pro".to_string());
    testing_env!(context(&token(), T0 + 1, 0).build());
    let unused = shop.ft_on_transfer(buyer(), U128(PRICE + 1), id.to_string());
    match unused {
        PromiseOrValue::Value(v) => assert_eq!(v.0, PRICE + 1),
        PromiseOrValue::Promise(_) => panic!("must not return a promise"),
    }
    assert_eq!(shop.get_order(id).unwrap().state, OrderState::Created);
}

#[test]
#[should_panic(expected = "payments must arrive through the settlement token")]
fn payment_from_wrong_token_rejected() {
    let mut shop = stocked_shop();
    testing_env!(context(&buyer(), T0, 0).build());
    let id = shop.create_order("licence-pro".to_string());
    // Predecessor is the buyer, not the token contract: a fake token (or a
    // direct call) cannot fake a payment.
    testing_env!(context(&buyer(), T0 + 1, 0).build());
    let _ = shop.ft_on_transfer(buyer(), U128(PRICE), id.to_string());
}

#[test]
fn exact_payment_moves_order_to_paid() {
    let mut shop = stocked_shop();
    let id = paid_order(&mut shop);
    let order = shop.get_order(id).unwrap();
    assert_eq!(order.state, OrderState::Paid);
    assert_eq!(order.paid_at, Some(T0 + 1));
    let logs = get_logs();
    assert!(logs.iter().any(|l| l.contains("bounden_order_paid")));
}

#[test]
fn fulfil_consumes_one_commitment_and_logs() {
    let mut shop = stocked_shop();
    let id = paid_order(&mut shop);
    assert_eq!(shop.inventory_available("licence-pro".to_string()), 2);
    testing_env!(context(&agent(), T0 + 2, 0).build());
    shop.fulfil_order(id, "e".repeat(64), Some("f".repeat(64)));
    let order = shop.get_order(id).unwrap();
    assert_eq!(order.state, OrderState::Fulfilled);
    assert_eq!(order.judgement_attestation_hash, Some("f".repeat(64)));
    assert_eq!(shop.inventory_available("licence-pro".to_string()), 1);
    assert_eq!(shop.fulfilment_log_len(), 1);
    let log = shop.get_fulfilment_log(Some(0), Some(10));
    assert_eq!(log[0].action, "fulfil");
    assert_eq!(log[0].order_id, id);
}

#[test]
#[should_panic(expected = "only the registered agent may do this")]
fn non_agent_cannot_fulfil() {
    let mut shop = stocked_shop();
    let id = paid_order(&mut shop);
    testing_env!(context(&buyer(), T0 + 2, 0).build());
    shop.fulfil_order(id, "e".repeat(64), None);
}

#[test]
#[should_panic(expected = "only a Paid order can be fulfilled")]
fn second_fulfil_of_same_order_fails() {
    let mut shop = stocked_shop();
    let id = paid_order(&mut shop);
    testing_env!(context(&agent(), T0 + 2, 0).build());
    shop.fulfil_order(id, "e".repeat(64), None);
    shop.fulfil_order(id, "e".repeat(64), None);
}

#[test]
fn refund_within_cap_and_window_succeeds() {
    let mut shop = stocked_shop();
    let id = paid_order(&mut shop);
    // ZERO attached deposit: the only authorised caller is the agent's
    // function-call leash key, which protocol rules bar from attaching
    // any deposit (v3 fix — the v2 assert made this path un-executable
    // by the leash; see NOTES.md). The refund must succeed anyway.
    testing_env!(context(&agent(), T0 + 100, 0).build());
    let result = shop.issue_refund(id, None);
    assert!(matches!(result, PromiseOrValue::Promise(_)));
    assert_eq!(shop.get_order(id).unwrap().state, OrderState::Refunded);
    assert_eq!(shop.fulfilment_log_len(), 1);
    assert_eq!(shop.get_fulfilment_log(None, None)[0].action, "refund");
    // The refund transfer STILL goes to the token contract carrying
    // exactly 1 yocto — now attached by the contract itself, out of
    // its own balance. Regression guard unchanged.
    // (Drop the promise first: its receipt registers on drop/return.)
    drop(result);
    assert_ft_transfer_receipt(&token());
}

#[test]
fn refund_of_fulfilled_order_within_band_succeeds() {
    let mut shop = stocked_shop();
    let id = paid_order(&mut shop);
    testing_env!(context(&agent(), T0 + 2, 0).build());
    shop.fulfil_order(id, "e".repeat(64), None);
    testing_env!(context(&agent(), T0 + 100, 0).build());
    let result = shop.issue_refund(id, None);
    assert!(matches!(result, PromiseOrValue::Promise(_)));
    assert_eq!(shop.get_order(id).unwrap().state, OrderState::Refunded);
}

#[test]
fn refund_above_cap_is_rejected_and_recorded() {
    // Refund cap below the order price: the agent's call is legitimate,
    // the policy band refuses. PLAN: state -> RefundRejected + event.
    testing_env!(context(&owner(), T0, 0).build());
    let mut shop = BoundenShop::new(owner(), token(), 1000, U128(5_000_000), WINDOW_NS);
    testing_env!(context(&owner(), T0, 0).build());
    shop.set_agent(agent(), "a".repeat(64));
    shop.add_product(
        "licence-pro".to_string(),
        "Pro Licence".to_string(),
        ProductKind::LicenceKey,
        U128(PRICE),
    );
    let id = paid_order(&mut shop);
    testing_env!(context(&agent(), T0 + 100, 0).build());
    let result = shop.issue_refund(id, None);
    assert!(matches!(result, PromiseOrValue::Value(())));
    assert_eq!(shop.get_order(id).unwrap().state, OrderState::RefundRejected);
    let logs = get_logs();
    assert!(logs.iter().any(|l| l.contains("bounden_refund_rejected")));
}

#[test]
fn refund_after_window_is_rejected_and_recorded() {
    let mut shop = stocked_shop();
    let id = paid_order(&mut shop);
    // paid_at = T0 + 1; jump beyond the 1-hour window. Zero deposit,
    // as the leash key must send (v3).
    testing_env!(context(&agent(), T0 + 1 + WINDOW_NS + 1, 0).build());
    let result = shop.issue_refund(id, None);
    assert!(matches!(result, PromiseOrValue::Value(())));
    assert_eq!(shop.get_order(id).unwrap().state, OrderState::RefundRejected);
    // No transfer may be scheduled on a band rejection: no receipt to
    // the token contract exists. (An in-band call WOULD create one —
    // see refund_within_cap_and_window_succeeds.)
    let receipts = get_created_receipts();
    assert!(
        receipts.iter().all(|r| r.receiver_id != token()),
        "out-of-band refund must not schedule any token transfer; receipts: {:?}",
        receipts.iter().map(|r| &r.receiver_id).collect::<Vec<_>>()
    );
}

#[test]
#[should_panic(expected = "only the registered agent may do this")]
fn non_agent_cannot_refund() {
    let mut shop = stocked_shop();
    let id = paid_order(&mut shop);
    testing_env!(context(&owner(), T0 + 100, 1).build());
    let _ = shop.issue_refund(id, None);
}

#[test]
fn constitution_view_is_complete() {
    let shop = stocked_shop();
    let c = shop.get_constitution();
    assert_eq!(c.owner_id, owner());
    assert_eq!(c.agent_account_id, Some(agent()));
    assert_eq!(c.payment_token, token());
    assert_eq!(c.price_band_bps, 1000);
    assert_eq!(c.refund_cap_usd.0, CAP);
    assert_eq!(c.refund_window_ns, WINDOW_NS);
}

#[test]
fn buyer_can_cancel_unpaid_order() {
    let mut shop = stocked_shop();
    testing_env!(context(&buyer(), T0, 0).build());
    let id = shop.create_order("licence-pro".to_string());
    shop.cancel_order(id);
    assert_eq!(shop.get_order(id).unwrap().state, OrderState::Cancelled);
}

#[test]
#[should_panic(expected = "duplicate inventory commitment")]
fn duplicate_commitment_rejected() {
    let mut shop = stocked_shop();
    testing_env!(context(&owner(), T0, 0).build());
    shop.add_inventory_commitments("licence-pro".to_string(), vec!["b".repeat(64)]);
}





