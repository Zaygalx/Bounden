# Downloadable assets — signed, expiring download links (DESIGN ONLY)

Status: **design note, Stage 3. No server is implemented in this
stage.** This document fixes the design so the implementation, when
built, has no open questions — and so judges can see the mechanism was
thought through rather than improvised. Implementation lands with the
worker/storefront live pass (or later); nothing below is claimed to
exist yet.

## Problem

A `DownloadableAsset` product delivers a file, not a code. The file
must reach exactly the buyer of a Fulfilled order, without:

- putting the file (or a permanent URL) on-chain — chain state is
  public and immutable;
- a standing public link anyone can share or scrape;
- trusting the storefront with vault material.

## Design

### Where files live

Files sit in the worker's vault, alongside the sealed codes:
encrypted at rest under the vault key, one object per inventory unit,
in the same FIFO order as their on-chain commitments. A file's
commitment (registered on-chain like a code's) is the SHA-256 of the
plaintext file — so a buyer can verify the file they downloaded is
the exact unit the chain consumed for their order.

### The link

On fulfilment of a downloadable-asset order, the vault mints a
download token:

```
token = base64url( payload || "." || signature )
payload = {
  "v": 1,
  "order_id": 42,                    // the Fulfilled order
  "unit_commitment": "<sha256 hex>", // the consumed on-chain commitment
  "evidence_hash": "<sha256 hex>",   // the delivery evidence hash recorded by fulfil_order
  "exp": 1794203600,                 // unix seconds; default lifetime 15 minutes
  "jti": "<128-bit random id>"       // one-time-use identifier
}
signature = HMAC-SHA256( vault_download_key, canonical_json(payload) )
```

- **Endpoint shape:** `GET /download/<token>` on a small download
  service colocated with the worker (same vault, same host). No other
  routes; no listing; no index. The token is the capability — there is
  no account system and no cookie.
- **Expiry:** `exp` is checked against the server clock on every
  request; default lifetime 15 minutes from minting. An expired link
  returns `410 Gone` with a plain-language page telling the buyer to
  request a fresh link from their order page. Re-issuance mints a NEW
  token (new `jti`); the old one stays dead.
- **One-time use:** the vault keeps a spent-`jti` set. The first valid
  `GET` marks the `jti` spent *before* streaming the body; every later
  request with the same token returns `410 Gone`. (A download that
  fails mid-stream is a support case: the owner can authorise a
  re-issue; the spent record shows the attempt. We choose strict
  one-time over resumable range requests for the demo's threat model —
  links are cheap to re-issue to the buyer of record.)
- **Hash binding to the fulfilment record:** the payload carries both
  the consumed unit's commitment and the `evidence_hash` that
  `fulfil_order` recorded on-chain for that order. The service refuses
  to mint or honour a token whose `(order_id, evidence_hash)` pair
  does not match the vault's delivery record for a Fulfilled order.
  Consequences:
  - a token cannot be transplanted to another order — the binding
    would not match;
  - anyone can audit a delivery after the fact: the on-chain
    fulfilment record names the evidence hash; the vault's record ties
    it to the file commitment; the buyer's downloaded file hashes to
    that commitment;
  - the link itself reveals nothing: the payload is signed, not
    encrypted, but contains only ids and hashes that are already
    public on-chain. The vault key never leaves the vault; the HMAC
    key is a dedicated sub-key (`vault_download_key`), separate from
    the vault encryption key, so a download-service compromise cannot
    decrypt inventory.

### What the cashier's leash means here

Minting links is a vault-local operation — it needs no NEAR call and
no power beyond what `fulfil_order` already grants. The link is
minted only for orders the contract shows as Fulfilled to this
buyer; fulfilment itself remains gated by the allowlisted key and the
contract's state machine. A prompt-injected cashier can mint links
only for genuinely fulfilled orders — it cannot fabricate a
fulfilment record to bind a link to, because the binding is checked
against the contract's state, not the worker's say-so.

### Demo vs production

Demo inventory files are small, clearly marked test assets (e.g. a
text file reading "BOUNDEN TEST ASSET — no value"). Production
changes: buyer-key delivery as in PLAN (the download token delivered
encrypted to the buyer), HTTPS-only serving, per-IP rate limits, and
range-request support behind the same one-time token (first completed
download spends the `jti`). None of those change the token format or
the binding.

## Non-goals for the implementation stage

- No DRM, no watermarking, no download counting beyond the spent set.
- No CDN: files are small; the vault host serves them directly.
- No link for non-downloadable products: codes and downloadables keep
  separate delivery paths, as the contract's product kinds already do.
