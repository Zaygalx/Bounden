#!/usr/bin/env bash
# Serve the shipped storefront build locally (live mode, live contract)
# for the film capture. Same env shape as the production deployment.
set -euo pipefail
export BOUNDEN_CONTRACT_ACCOUNT_ID=bounden11.testnet
export BOUNDEN_PRODUCT_IDS=licence-pro,api-credit-basic
export BOUNDEN_AGENT_PUBLIC_KEY=ed25519:8ixy4dmqQkoyx493d1Fa6yVLAr6HjQMCideisgcCTws4
export BOUNDEN_RENDEZVOUS_SECRET="$(cat "$HOME/workspace/bounden-secrets/rendezvous-secret.txt")"
# Capture-only: pin the server-side read rotation to the endpoint that
# answers reliably from this sandbox (near.org medians ~3.8s here and
# drags every page load). Production keeps its full rotation; this env
# override is the app's own documented knob.
export NEAR_RPC_URLS=https://rpc.testnet.fastnear.com
export BLOB_READ_WRITE_TOKEN="$(grep "^BLOB_READ_WRITE_TOKEN=" "$HOME/workspace/.deploy/bounden-web/.env.local" | cut -d= -f2-)"
cd ~/workspace/bounden/web
exec npx next start -p 3100
