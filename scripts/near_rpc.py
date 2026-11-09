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


def rpc(network, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": "b", "method": method, "params": params}).encode()
    req = urllib.request.Request(rpc_url(network), data=body,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


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


def act_function_call(method, args_bytes, gas, deposit):
    return (bytes([2]) + s(method)
            + struct.pack("<I", len(args_bytes)) + args_bytes
            + struct.pack("<Q", gas) + struct.pack("<QQ", deposit & ((1 << 64) - 1),
                                                  (deposit >> 64) & ((1 << 64) - 1)))


def act_deploy_contract(code):
    return bytes([3]) + struct.pack("<I", len(code)) + code


def act_create_account():
    return bytes([0])


def act_transfer(deposit):
    return bytes([4]) + struct.pack("<QQ", deposit & ((1 << 64) - 1),
                                    (deposit >> 64) & ((1 << 64) - 1))


def act_add_key_full(pub_bytes, nonce=0):
    # AddKey: key_nonce(u64) || public_key(0x00 || 32B) || access_key
    # access_key = nonce(u64) || permission enum: 1 = FunctionCall
    # (receiver_id, method_names vec, allowance Option<u128>: 1 + u128)
    # or 0 = FullAccess. FullAccess permission byte is just 0x00.
    return (bytes([5]) + struct.pack("<Q", nonce)
            + bytes([0]) + pub_bytes
            + struct.pack("<Q", nonce) + bytes([0]))


def sign_and_broadcast(network, signer_id, key, receiver_id, actions):
    ak = view_access_key(network, signer_id, key["pub_str"])
    if ak is None:
        raise SystemExit(f"access key not found on-chain for {signer_id}")
    nonce = ak["nonce"] + 1
    tx_bytes = build_tx(signer_id, key["pub_bytes"], nonce, receiver_id,
                        latest_block_hash(network),
                        struct.pack("<I", len(actions)) + b"".join(actions))
    digest = hashlib.sha256(tx_bytes).digest()
    sig = key["signing_key"].sign(digest).signature
    signed = tx_bytes + bytes([0]) + sig
    res = rpc(network, "broadcast_tx_commit" if False else "txs",
              {"signed_tx_base64": base64.b64encode(signed).decode(),
               "wait_until": "EXECUTED_OPTIMISTIC"})
    if "error" in res:
        raise SystemExit("broadcast error: " + json.dumps(res["error"])[:600])
    tx_hash = res["result"]["transaction"]["hash"]
    return poll_tx(network, tx_hash, signer_id)


def poll_tx(network, tx_hash, signer_id, tries=30):
    for _ in range(tries):
        res = rpc(network, "tx", {"tx_hash": tx_hash, "sender_account_id": signer_id,
                                  "wait_until": "EXECUTED"})
        result = res.get("result", {})
        status = result.get("status", {})
        if "SuccessValue" in status or "SuccessReceiptId" in status:
            return {"tx_hash": tx_hash, "status": status,
                    "receipts": [r.get("receipt_id") for r in result.get("receipts", [])]}
        if "Failure" in status:
            return {"tx_hash": tx_hash, "status": status}
        time.sleep(2)
    return {"tx_hash": tx_hash, "status": {"note": "poll timeout"}}


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
