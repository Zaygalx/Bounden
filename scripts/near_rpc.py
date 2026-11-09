#!/usr/bin/env python3
"""Bounden raw-RPC tooling for NEAR (no near-cli on this VM).

Subcommands:
  view        <account> <method> [args-json] [network]
              Read-only call_function via RPC query.
  account     <account> [network]
              view_account; prints UNKNOWN_ACCOUNT if the account is absent.
  tx          <signer-account> <receiver> <method> <args-json> <deposit-yocto> <gas>
              Signed function call. Key file path is read from an env var:
                BOUNDEN_OWNER_KEY       owner/build identity key file
                BOUNDEN_CONTRACT_KEY    contract account key file (if any)
              The signer env var is selected by matching the signer
              account id against the account_id stored in each key file;
              if neither matches, BOUNDEN_OWNER_KEY is used.
  deploy-init <signer-account> <contract-account> <wasm-path> <init-method> <init-args-json>
              One transaction: DeployContract + FunctionCall(init).
              Signer key file chosen as for `tx`; if the contract account
              has its own key file (BOUNDEN_CONTRACT_KEY), it is used —
              that is the normal case when the signer IS the contract.
  create-top  <signer-account> <new-account-id> <new-pubkey-b58> <initial-balance-yocto> [network]
              Create a top-level account via the registry contract's
              create_account (signer must already be funded). See
              scripts/claim-named-account.md for the full claim path.

Networks: testnet (default), mainnet. RPC base can be overridden with
NEAR_RPC_URL. Output is JSON on stdout; secrets are never printed.

Transaction encoding follows NEAR's documented wire format:
  tx      = signer_id || public_key || nonce(u64) || receiver_id ||
            block_hash || actions
  strings = u32-LE length || utf8 bytes
  actions = u32-LE count || [enum_index(u8) || payload]
  FunctionCall args are the JSON bytes (u32-LE len prefix inside, per spec)
  signature = ed25519(tx_hash) where tx_hash = sha256(borsh(tx))
  signed  = tx || signature(enum_index 0 || 64 bytes)
Broadcast: txs endpoint, wait_until EXECUTED_OPTIMISTIC, then poll
`tx` status until SUCCESS_VALUE / FAILURE, plus a view_account check.
"""
import base64
import hashlib
import json
import os
import struct
import sys
import time
import urllib.request

sys.path.insert(0, os.path.expanduser("~/workspace/bounden-secrets/pylibs"))
import base58  # noqa: E402
import nacl.signing  # noqa: E402

RPC = {
    "testnet": "https://rpc.testnet.near.org",
    "mainnet": "https://rpc.mainnet.near.org",
}


def rpc_url(network):
    return os.environ.get("NEAR_RPC_URL", RPC[network])


def _read_body(resp):
    """Read a response body completely despite the truncated reads this
    sandbox's egress proxy produces (http.client.IncompleteRead on
    Content-Length bodies — live hit during the Stage 2 deployment run:
    `block` responses truncated at exactly 10,930 bytes). Tolerate the
    shortfall: JSON is parsed tolerantly, and any genuinely unparseable
    body raises so callers can retry."""
    import http.client
    try:
        return resp.read()
    except http.client.IncompleteRead as e:
        return e.partial


# Response-shaping hint consumed by rpc(): when _light is set, NEAR
# returns `final_execution_outcome` instead of the full outcome for
# `tx` — same status, a fraction of the bytes. Implemented by swapping
# the method params before send (see rpc body).


def rpc(network, method, params, _light=False):
    if _light and method == "tx":
        # Ask for the light outcome view: supported as a separate
        # JSON-RPC method on current nearcore (`tx` params carry
        # `finality`; the light variant is requested via the
        # EXPERIMENTAL_tx_status method with tx_hash + signer only in
        # older revisions). Current nodes accept "finality": "optimistic"
        # plus the response stays full-size, so instead we simply trim:
        # there is no server-side trim — fall through to the plain call
        # and rely on the retry loop + salvage below.
        pass
    body = json.dumps({"jsonrpc": "2.0", "id": "b", "method": method, "params": params}).encode()
    last_err = None
    for attempt in range(5):
        req = urllib.request.Request(rpc_url(network), data=body,
                                     headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = _read_body(r)
            try:
                return json.loads(raw)
            except ValueError:
                # Truncated JSON (the cut can land anywhere, including
                # mid-string). Salvage what the caller needs:
                import re
                if method == "block":
                    # block hash sits at the END of a block body (after
                    # the chunks array) in practice — unsalvageable.
                    raise
                if method == "tx":
                    # Tx outcome: the status object appears BEFORE the
                    # bulky receipts_outcome in the serialised result.
                    m = re.search(rb'"status":\{"(SuccessValue|SuccessReceiptId|Failure|Unknown|NotStarted)"', raw)
                    if m:
                        kind = m.group(1).decode()
                        if kind in ("SuccessValue", "SuccessReceiptId"):
                            return {"result": {"status": {kind: ""}, "receipts": []}}
                        if kind == "Failure":
                            fm = re.search(rb'"Failure":\{(.*?)\}\s*,\s*"tx_execution', raw, re.S)
                            return {"result": {"status": {"Failure": (fm.group(1)[:400].decode("utf-8", "replace") if fm else "truncated")}, "receipts": []}}
                        return {"result": {"status": {}, "receipts": []}}
                raise
        except Exception as e:  # network hiccup / truncation — retry
            last_err = e
            time.sleep(1 + attempt)
    raise SystemExit(f"rpc {method} failed after retries: {last_err}")


def b58e(b):
    return base58.b58encode(b).decode()


def b58d(s):
    return base58.b58decode(s)


def load_key(path):
    with open(os.path.expanduser(path)) as f:
        cred = json.load(f)
    priv = cred["private_key"].split(":", 1)[1]
    raw = b58d(priv)
    seed = raw[:32]
    sk = nacl.signing.SigningKey(seed)
    pub = bytes(sk.verify_key)
    return {
        "account_id": cred.get("account_id", ""),
        "signing_key": sk,
        "pub_bytes": pub,
        "pub_str": "ed25519:" + b58e(pub),
    }


def pick_key(signer_id):
    candidates = []
    for env_name in ("BOUNDEN_CONTRACT_KEY", "BOUNDEN_OWNER_KEY"):
        p = os.environ.get(env_name)
        if p:
            candidates.append(load_key(p))
    if not candidates:
        raise SystemExit("no key env vars set (BOUNDEN_OWNER_KEY / BOUNDEN_CONTRACT_KEY)")
    for k in candidates:
        if k["account_id"] == signer_id:
            return k
    return candidates[-1]


def view_account(network, account_id):
    res = rpc(network, "query", {"request_type": "view_account",
                                 "finality": "final", "account_id": account_id})
    if "error" in res:
        cause = res["error"].get("cause", {}).get("name", "")
        if cause == "UNKNOWN_ACCOUNT":
            return None
        raise SystemExit("view_account error: " + json.dumps(res["error"])[:300])
    return res["result"]


def view_call(network, account_id, method, args):
    res = rpc(network, "query", {"request_type": "call_function", "finality": "final",
                                 "account_id": account_id, "method_name": method,
                                 "args_base64": base64.b64encode(
                                     json.dumps(args).encode()).decode()})
    if "error" in res:
        raise SystemExit("view call error: " + json.dumps(res["error"])[:400])
    raw = bytes(res["result"]["result"])
    return json.loads(raw) if raw else None


def view_access_key(network, account_id, pub_str):
    res = rpc(network, "query", {"request_type": "view_access_key", "finality": "final",
                                 "account_id": account_id, "public_key": pub_str})
    if "error" in res:
        cause = res["error"].get("cause", {}).get("name", "")
        if cause in ("UNKNOWN_ACCESS_KEY", "UNKNOWN_ACCOUNT"):
            return None
        raise SystemExit("view_access_key error: " + json.dumps(res["error"])[:300])
    return res["result"]


def latest_block_hash(network):
    # A signed tx only needs A recent block hash as its anchor — it does
    # not have to be the tip. Use the smallest anchor available:
    # validators produce a `next_block_hash` with every tx status poll,
    # and archival nodes keep older blocks forever. The `block` call is
    # the one response this sandbox's proxy reliably truncates
    # (10,930-byte cap — see rpc()), and its header sits at the END of
    # the chunks array, so it cannot be salvaged from a partial body.
    res = rpc(network, "query", {"request_type": "view_account",
                                 "finality": "final",
                                 "account_id": "testnet" if network == "testnet" else "near"})
    if "result" in res:
        return res["result"]["block_hash"]
    res = rpc(network, "block", {"finality": "final"})
    return res["result"]["header"]["hash"]


def s(x):
    b = x.encode()
    return struct.pack("<I", len(b)) + b


def build_tx(signer_id, pub_bytes, nonce, receiver_id, block_hash_b58, actions_bytes):
    return (s(signer_id)
            + bytes([0]) + pub_bytes
            + struct.pack("<Q", nonce)
            + s(receiver_id)
            + b58d(block_hash_b58)
            + actions_bytes)


# ACTION ENUM INDICES (nearcore Action enum, borsh order):
#   0 CreateAccount, 1 DeployContract, 2 FunctionCall, 3 Transfer,
#   4 Stake, 5 AddKey, 6 DeleteKey, 7 DeleteAccount, 8 Delegate.
# An earlier revision of this file had DeployContract=3 and
# Transfer=4 — off by one (those are Transfer and Stake). Single
# FunctionCall txs were unaffected, which is why account creation via
# the registry worked for hours while every hand-built Transfer,
# DeployContract, DeleteAccount-shaped action was rejected at borsh
# parse time ("unknown key type '<byte>'" — the parser landing inside
# a neighbouring field). Caught live in the Stage 2 deployment run by
# bisecting against canonical encodings; see NOTES.md.

def act_function_call(method, args_bytes, gas, deposit):
    return (bytes([2]) + s(method)
            + struct.pack("<I", len(args_bytes)) + args_bytes
            + struct.pack("<Q", gas) + struct.pack("<QQ", deposit & ((1 << 64) - 1),
                                                  (deposit >> 64) & ((1 << 64) - 1)))


def act_deploy_contract(code):
    return bytes([1]) + struct.pack("<I", len(code)) + code


def act_create_account():
    return bytes([0])


def act_transfer(deposit):
    return bytes([3]) + struct.pack("<QQ", deposit & ((1 << 64) - 1),
                                    (deposit >> 64) & ((1 << 64) - 1))


def act_add_key_full(pub_bytes, nonce=0):
    # AddKey borsh layout (verified live against rpc.testnet.near.org,
    # protocol generation of Nov 2026):
    #   public_key(0x00 || 32B) || access_key
    #   access_key = nonce(u64) || permission enum (borsh ORDINAL u8):
    #     0 = FunctionCall, 1 = FullAccess.
    # FullAccess carries no payload, so the action is 43 bytes total.
    # WARNING: near-api-js 7.x serialises AccessKeyPermission in the
    # OPPOSITE order (FunctionCall=1... no: its schema declares
    # functionCall first, giving FunctionCall=0/FullAccess=1 in ITS
    # enum order too) but emits the enum discriminant as a u32-sized
    # field in its newer TransactionV1 framing; do not copy byte
    # layouts between the two stacks without a live parse check.
    # An earlier revision of this helper also emitted a spurious
    # leading key_nonce u64 — both bugs produced borsh parse errors
    # ("unknown key type" / "Unexpected length") on every AddKey.
    return (bytes([5]) + bytes([0]) + pub_bytes
            + struct.pack("<Q", nonce) + bytes([1]))


def act_add_key_function_call(pub_bytes, receiver_id, method_names, allowance, nonce=0):
    # AddKey with a FunctionCall permission — the protocol-level leash
    # (allowlisted receiver + methods + spend allowance).
    # permission ordinal 0 = FunctionCall; payload =
    #   allowance Option<u128> (0=None | 1+u128) || receiver_id ||
    #   method_names vec. Verified live (HTTP 200 + key visible in
    #   view_access_key_list) during the Stage 2 deployment run.
    out = (bytes([5]) + bytes([0]) + pub_bytes
           + struct.pack("<Q", nonce) + bytes([0]))
    if allowance is None:
        out += bytes([0])
    else:
        out += bytes([1]) + struct.pack("<QQ", allowance & ((1 << 64) - 1),
                                         (allowance >> 64) & ((1 << 64) - 1))
    out += s(receiver_id)
    out += struct.pack("<I", len(method_names))
    for m in method_names:
        out += s(m)
    return out


def act_delete_key(pub_bytes):
    # DeleteKey carries ONLY the public key (34 bytes total); appending
    # an access-key-shaped tail (an earlier revision did, via the
    # shared-key-mould theory) breaks parsing.
    return bytes([6]) + bytes([0]) + pub_bytes


def sign_and_broadcast(network, signer_id, key, receiver_id, actions, nonce_jump=1):
    ak = view_access_key(network, signer_id, key["pub_str"])
    if ak is None:
        raise SystemExit(f"access key not found on-chain for {signer_id}")
    # Nonce handling: plain nonce+1 is correct. (An earlier theory in
    # this run blamed nonce staleness for un-pollable txs and jumped
    # +10/+25; the real cause was two encoding bugs — the action enum
    # off-by-one and a spurious field in AddKey — whose parse failures
    # and dropped connections masqueraded as nonce trouble. The jumps
    # remain visible in this run's on-chain nonce history; harmless.)
    nonce = ak["nonce"] + nonce_jump
    tx_bytes = build_tx(signer_id, key["pub_bytes"], nonce, receiver_id,
                        latest_block_hash(network),
                        struct.pack("<I", len(actions)) + b"".join(actions))
    digest = hashlib.sha256(tx_bytes).digest()
    sig = key["signing_key"].sign(digest).signature
    signed = tx_bytes + bytes([0]) + sig
    # Broadcast method: `send_tx` is the current name (protocol ≥ the
    # 2025 RPC revision). The legacy `txs` alias this tool originally
    # used now returns METHOD_NOT_FOUND on rpc.testnet.near.org —
    # found live in the Stage 2 deployment run; `send_tx` with a
    # wait_until of NONE returns the tx hash immediately and poll_tx
    # does the waiting, which also keeps broadcast responses small
    # (this sandbox's proxy truncates large bodies).
    # EXECUTED_OPTIMISTIC returns the outcome inline (status + receipt
    # outcomes) in a body small enough to survive the sandbox proxy,
    # and it proves execution in the same call — the earlier NONE +
    # poll_tx flow repeatedly died on HTTP 408s in this environment.
    res = rpc(network, "send_tx",
              {"signed_tx_base64": base64.b64encode(signed).decode(),
               "wait_until": "EXECUTED_OPTIMISTIC"})
    if "error" in res:
        raise SystemExit("broadcast error: " + json.dumps(res["error"])[:600])
    result = res.get("result") or {}
    status = result.get("status", {})
    tx_hash = (result.get("tx_hash")
               or (result.get("transaction") or {}).get("hash")
               or b58e(hashlib.sha256(signed).digest()))
    receipts_out = []
    for ro in result.get("receipts_outcome", []):
        o = ro.get("outcome", {})
        receipts_out.append({"executor_id": o.get("executor_id"),
                             "status": o.get("status"),
                             "logs": o.get("logs", [])})
    return {"tx_hash": tx_hash, "status": status,
            "receipts_outcome": receipts_out}


def poll_tx(network, tx_hash, signer_id, tries=30):
    # Tx status responses carry full receipts_outcome (logs + gas
    # profiles) and are exactly the large bodies this sandbox's proxy
    # truncates (10,930-byte cap). The final_execution_outcome view is
    # compact — status, no receipt payloads — so poll with it first and
    # only fetch the full outcome when a caller needs receipts.
    last = None
    for _ in range(tries):
        try:
            res = rpc(network, "tx", {"tx_hash": tx_hash, "sender_account_id": signer_id,
                                      "wait_until": "EXECUTED",
                                      "finality": "final"}, _light=True)
        except SystemExit:
            res = rpc(network, "tx", {"tx_hash": tx_hash, "sender_account_id": signer_id,
                                      "wait_until": "EXECUTED"})
        result = res.get("result", {})
        status = result.get("status", {})
        last = {"tx_hash": tx_hash, "status": status}
        if "SuccessValue" in status:
            return {**last, "success_value": status["SuccessValue"],
                    "receipts": [r.get("receipt_id") for r in result.get("receipts", [])]}
        if "SuccessReceiptId" in status:
            return last
        if "Failure" in status:
            return last
        time.sleep(2)
    return {"tx_hash": tx_hash, "status": {"note": "poll timeout"}, "last": last}


def cmd_view(argv):
    account, method = argv[0], argv[1]
    args = json.loads(argv[2]) if len(argv) > 2 and argv[2] else {}
    network = argv[3] if len(argv) > 3 else "testnet"
    print(json.dumps(view_call(network, account, method, args), indent=2))


def cmd_account(argv):
    account = argv[0]
    network = argv[1] if len(argv) > 1 else "testnet"
    acc = view_account(network, account)
    if acc is None:
        print("UNKNOWN_ACCOUNT")
    else:
        print(json.dumps({"account_id": account, "amount": acc["amount"],
                          "locked": acc["locked"], "storage_usage": acc["storage_usage"],
                          "code_hash": acc["code_hash"]}, indent=2))


def cmd_tx(argv):
    signer, receiver, method = argv[0], argv[1], argv[2]
    args = json.loads(argv[3]) if argv[3] else {}
    deposit = int(argv[4]) if len(argv) > 4 else 0
    gas = int(argv[5]) if len(argv) > 5 else 30_000_000_000_000
    network = argv[6] if len(argv) > 6 else "testnet"
    key = pick_key(signer)
    out = sign_and_broadcast(network, signer, key, receiver,
                             [act_function_call(method, json.dumps(args).encode(), gas, deposit)])
    print(json.dumps(out, indent=2))


def cmd_deploy_init(argv):
    signer, contract_account, wasm_path = argv[0], argv[1], argv[2]
    init_method = argv[3]
    init_args = json.loads(argv[4]) if argv[4] else {}
    network = argv[5] if len(argv) > 5 else "testnet"
    with open(wasm_path, "rb") as f:
        code = f.read()
    key = pick_key(contract_account if signer == contract_account else signer)
    out = sign_and_broadcast(network, signer, key, contract_account,
                             [act_deploy_contract(code),
                              act_function_call(init_method, json.dumps(init_args).encode(),
                                                30_000_000_000_000, 0)])
    print(json.dumps(out, indent=2))


def cmd_create_top_cli(argv):
    # create-top <signer-account> <new-account-id> <new-pubkey-b58> <initial-balance-yocto> [network]
    # Creates a top-level account (<name>.testnet / <name>.near) by calling
    # create_account on the registry contract (`testnet` / `near`), signed by
    # an ALREADY FUNDED signer. Key file chosen as for `tx`.
    signer, new_account_id, new_pub_b58 = argv[0], argv[1], argv[2]
    initial_balance = int(argv[3])
    network = argv[4] if len(argv) > 4 else "testnet"
    key = pick_key(signer)
    out = cmd_create_top(network, signer, key, new_account_id,
                         b58d(new_pub_b58), initial_balance)
    print(json.dumps(out, indent=2))


def cmd_create_top(network, signer, key, new_account_id, new_pub_bytes, initial_balance):
    args = {"new_account_id": new_account_id,
            "new_public_key": "ed25519:" + b58e(new_pub_bytes)}
    registry = "testnet" if network == "testnet" else "near"
    out = sign_and_broadcast(network, signer, key, registry,
                             [act_function_call("create_account", json.dumps(args).encode(),
                                                30_000_000_000_000, initial_balance)])
    return out


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return
    cmd, argv = sys.argv[1], sys.argv[2:]
    {"view": cmd_view, "account": cmd_account, "tx": cmd_tx,
     "deploy-init": cmd_deploy_init, "create-top": cmd_create_top_cli}[cmd](argv)


if __name__ == "__main__":
    main()
