# Bounden storefront

The shop's public face: catalogue, checkout explainer, order status,
and the **Constitution page** — every power the cashier agent holds,
read from the chain and published. Minimal Next.js (App Router),
mobile-first, neutral English copy, USD prices. Deployable to Vercel
as-is.

## Modes

- **Fixture mode (default).** When `BOUNDEN_CONTRACT_ACCOUNT_ID` is
  not set, every page renders clearly labelled sample data from
  `src/lib/fixtures.ts`, under a visible FIXTURE MODE banner. The app
  builds and demos locally with no chain at all.
- **Live mode.** With a contract configured, pages read the shop
  contract server-side via NEAR RPC view calls (`get_product`,
  `inventory_available`, `get_order`, `get_constitution`, and
  `view_access_key` for the cashier's leash). If a live read fails,
  pages fall back to fixture data and say so in the banner — fixture
  data is never presented as chain state.

A "Demo inventory" notice is shown on every page in both modes.

## Pages

| Route | What it does |
|---|---|
| `/` | Catalogue (products read via the data layer) + order lookup |
| `/products/[id]` | Product detail and delivery semantics per kind |
| `/checkout/[id]` | How payment works: `create_order`, then pay the contract via `ft_transfer_call` on Circle's NEAR testnet USDC contract (msg = the order id). The cashier never touches payment. Explainer only at this stage — buying is a wallet action; the storefront holds no keys and signs nothing |
| `/orders/[id]` | Order status read from `get_order`, including the judgement attestation hash when one is recorded |
| `/constitution` | The demo's Act 3: the constitution from `get_constitution` plus the agent key's permission object (receiver, method allowlist, allowance) — every power the agent holds, listed publicly, with the powers it does NOT hold alongside |
| `/about` | How inventory stays secret on a public chain |

## Configuration (env only, no secrets — view calls are public)

| Variable | Meaning |
|---|---|
| `BOUNDEN_CONTRACT_ACCOUNT_ID` | Shop contract account. Empty = fixture mode |
| `BOUNDEN_PRODUCT_IDS` | Comma-separated product ids for the catalogue (the contract has no list-products view) |
| `BOUNDEN_AGENT_PUBLIC_KEY` | The cashier's leashed public key; the Constitution page reads its permission object |
| `NEAR_RPC_URL` | Default `https://rpc.testnet.near.org` |

## Run

```bash
npm install
npm run dev        # fixture mode out of the box
npm run build && npm run start
```

## Deploy to Vercel

Import the repo, set the project root directory to `web/`, and set
the env vars above in the project settings. No build customisation is
needed. Pages are server-rendered per request (`force-dynamic`), so
live chain reads are never baked in at build time.
