"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import {
  setupWalletSelector,
  type WalletModuleFactory,
  type WalletSelector,
} from "@near-wallet-selector/core";
import { setupModal, type WalletSelectorModal } from "@near-wallet-selector/modal-ui";
import { setupBitteWallet } from "@near-wallet-selector/bitte-wallet";
import { setupCoin98Wallet } from "@near-wallet-selector/coin98-wallet";
import { setupHereWallet } from "@near-wallet-selector/here-wallet";
import { setupHotWallet } from "@near-wallet-selector/hot-wallet";
import { setupLedger } from "@near-wallet-selector/ledger";
import { setupMathWallet } from "@near-wallet-selector/math-wallet";
import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import { setupNearMobileWallet } from "@near-wallet-selector/near-mobile-wallet";
import { setupNightly } from "@near-wallet-selector/nightly";
import { setupRamperWallet } from "@near-wallet-selector/ramper-wallet";
import { setupSender } from "@near-wallet-selector/sender";
import { setupWelldoneWallet } from "@near-wallet-selector/welldone-wallet";
import { setupXDEFI } from "@near-wallet-selector/xdefi";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * NEAR Wallet Selector wiring for the storefront (testnet only — the
 * shop's constitution lives there). The selector lives entirely in
 * the visitor's browser: connecting a wallet creates NO account on
 * this site, and the site never sees, holds, or uses a key. Signing
 * happens inside the visitor's own wallet; this provider only hands
 * the wallet a payload to approve (see lib/purchase.ts).
 *
 * In fixture mode (no contract configured) the provider is inert:
 * children render, no wallet entry appears, nothing initialises.
 */

interface WalletContextValue {
  contractId: string | null;
  accountId: string | null;
  ready: boolean;
  connect: () => void;
  disconnect: () => Promise<void>;
  getSelector: () => Promise<WalletSelector | null>;
}

const WalletContext = createContext<WalletContextValue>({
  contractId: null,
  accountId: null,
  ready: false,
  connect: () => undefined,
  disconnect: async () => undefined,
  getSelector: async () => null,
});

export function useWallet(): WalletContextValue {
  return useContext(WalletContext);
}

export default function WalletProvider({
  contractId,
  children,
}: {
  contractId: string | null;
  children: ReactNode;
}) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const selectorRef = useRef<WalletSelector | null>(null);
  const modalRef = useRef<WalletSelectorModal | null>(null);
  const initRef = useRef<Promise<WalletSelector | null> | null>(null);

  const init = (): Promise<WalletSelector | null> => {
    if (!contractId) return Promise.resolve(null);
    if (!initRef.current) {
      initRef.current = (async () => {
        const selector = await setupWalletSelector({
          network: "testnet",
          // The full first-party module set at this selector version —
          // a visitor connects with the wallet they actually use
          // (Meteor, MyNearWallet, HERE, …), not the two we happened
          // to register first. Not registered, deliberately:
          // wallet-connect needs a WalletConnect project id this
          // project does not hold, and ethereum-wallets needs an
          // app-level wagmi config; neither is a drop-in module.
          // near-snap is also out: its bundled Node keystore imports
          // `fs` and breaks the browser build outright.
          modules: [
            setupMyNearWallet(),
            setupMeteorWallet(),
            setupHereWallet(),
            setupNearMobileWallet(),
            setupHotWallet(),
            // Bitte's and Sender's factories ship with a stricter
            // generic than the core's module list accepts; the
            // modules themselves are the standard ones, so widen
            // those two entries.
            setupBitteWallet() as WalletModuleFactory,
            setupSender() as WalletModuleFactory,
            setupNightly(),
            setupWelldoneWallet(),
            setupXDEFI(),
            setupMathWallet(),
            setupCoin98Wallet(),
            setupRamperWallet(),
            setupLedger(),
          ],
        });
        selectorRef.current = selector;
        modalRef.current = setupModal(selector, {
          contractId,
          theme: "light",
          description:
            "Connect a NEAR testnet wallet to buy from this shop. There is no account here and the site holds no keys — your wallet signs every call itself.",
        });
        const applyAccounts = (
          accounts: ReadonlyArray<{ accountId: string; active?: boolean }>,
        ) => {
          const active = accounts.find((a) => a.active) ?? accounts[0];
          setAccountId(active ? active.accountId : null);
        };
        applyAccounts(selector.store.getState().accounts);
        selector.store.observable.subscribe((state) =>
          applyAccounts(state.accounts),
        );
        setReady(true);
        return selector;
      })().catch(() => null);
    }
    return initRef.current;
  };

  useEffect(() => {
    void init();
    // Initialise once on mount; contractId is fixed for the deployment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: WalletContextValue = {
    contractId,
    accountId,
    ready,
    connect: () => {
      void init().then(() => modalRef.current?.show());
    },
    disconnect: async () => {
      const selector = await init();
      if (!selector) return;
      const wallet = await selector.wallet();
      await wallet.signOut();
      setAccountId(null);
    },
    getSelector: () => init(),
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}
