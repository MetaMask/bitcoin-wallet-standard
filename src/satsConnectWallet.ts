import type { BitcoinConnectFeature, BitcoinConnectInput } from '@exodus/bitcoin-wallet-standard';
import { BITCOIN_CHAINS, BitcoinConnect } from '@exodus/bitcoin-wallet-standard';
import type { MultichainApiClient, SessionData } from '@metamask/multichain-api-client';
import { decodeToken } from '@olistic/jsontokens';
import type { IdentifierArray, Wallet } from '@wallet-standard/base';
import type { StandardConnectOutput, StandardEventsListeners, StandardEventsNames } from '@wallet-standard/features';
import { ReadonlyWalletAccount } from '@wallet-standard/wallet';
import { metamaskIcon } from './icon';
import { type BitcoinWalletOptions, type CaipAccountId, CaipScope } from './types/common';
import {
  AddressPurpose,
  AddressType,
  type BitcoinProvider,
  type CreateInscriptionResponse,
  type CreateRepeatInscriptionsResponse,
  type GetAddressResponse,
  type GetCapabilitiesResponse,
  type ListenerInfo,
  type Params,
  type Requests,
  type RpcResponse,
  type SatsConnectFeature,
  SatsConnectFeatureName,
  type SendBtcTransactionResponse,
  type SignMultipleTransactionsResponse,
  type SignTransactionResponse,
  WalletType,
} from './types/satsConnect';
import { getAddressFromCaipAccountId, isAccountChangedEvent } from './utils';

/**
 * A read-only implementation of a wallet account.
 */
export class WalletStandardWalletAccount extends ReadonlyWalletAccount {
  constructor({ address, publicKey, chains }: { address: string; publicKey: Uint8Array; chains: IdentifierArray }) {
    const features: IdentifierArray = [SatsConnectFeatureName];
    super({ address, publicKey, chains, features });
    if (new.target === WalletStandardWalletAccount) {
      Object.freeze(this);
    }
  }
}

/**
 * A wallet implementation for Bitcoin.
 */
export class BitcoinWallet implements Wallet {
  readonly #listeners: { [E in StandardEventsNames]?: StandardEventsListeners[E][] } = {};
  readonly version = '1.0.0' as const;
  readonly name;
  readonly icon = metamaskIcon;
  readonly chains: IdentifierArray = BITCOIN_CHAINS;
  protected scope: IdentifierArray[number] | undefined;
  #selectedAddressOnPageLoadPromise: Promise<string | undefined> | undefined;
  #account: WalletStandardWalletAccount | undefined;
  #removeAccountsChangedListener: (() => void) | undefined;
  client: MultichainApiClient;

  constructor({ client, walletName }: BitcoinWalletOptions) {
    this.client = client;
    this.name = `${walletName ?? 'MetaMask'}` as const;
    this.#selectedAddressOnPageLoadPromise = this.getInitialSelectedAddress();
  }

  get accounts() {
    return this.#account ? [this.#account] : [];
  }

  get features(): SatsConnectFeature & BitcoinConnectFeature {
    return {
      [BitcoinConnect]: {
        version: '1.0.0',
        connect: this.#connect,
      },
      [SatsConnectFeatureName]: {
        provider: this.#getSatsConnectProvider(),
      },
    };
  }

  /**
   * Listen for up to 2 seconds to the accountsChanged event emitted on page load
   * @returns If any, the initial selected address
   */
  protected getInitialSelectedAddress(): Promise<string | undefined> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(undefined);
      }, 2000);

      const handleAccountChange = (data: any) => {
        if (isAccountChangedEvent(data)) {
          const address = data?.params?.notification?.params?.[0];
          if (address) {
            clearTimeout(timeout);
            removeNotification?.();
            resolve(address);
          }
        }
      };

      const removeNotification = this.client.onNotification(handleAccountChange);
    });
  }

  #connect = async (): Promise<StandardConnectOutput> => {
    if (this.accounts.length) {
      // Already connected
      return { accounts: this.accounts };
    }

    // Try restoring session
    await this.#tryRestoringSession();

    // Otherwise create a session on Mainnet by default
    if (!this.accounts.length) {
      await this.#createSession(CaipScope.MAINNET);
    }

    // In case user didn't select any Solana scope/account, return
    if (!this.accounts.length) {
      return { accounts: [] };
    }

    // this.#removeAccountsChangedListener = this.client.onNotification(this.#handleAccountsChangedEvent.bind(this));
    return { accounts: this.accounts };
  };

  /**
   * Updates the session and the account to connect to.
   * This method handles the logic for selecting the appropriate Solana network scope (mainnet/devnet/testnet)
   * and account to connect to based on the following priority:
   * 1. First tries to find an available scope in order: mainnet > devnet > testnet, supposing the same set of accounts
   *    is available for all Solana scopes
   * 2. For account selection:
   *    - First tries to use the selectedAddress param, most likely coming from the accountsChanged event
   *    - Falls back to the previously saved account if it exists in the scope
   *    - Finally defaults to the first account in the scope
   *
   * @param session - The session data containing available scopes and accounts
   * @param selectedAddress - The address that was selected by the user, if any
   */
  protected updateSession(session: SessionData | undefined, selectedAddress: string | undefined) {
    // Get session scopes
    const sessionScopes = new Set(Object.keys(session?.sessionScopes ?? {}));

    // Find the first available scope in priority order: mainnet > testnet > regtest.
    const scopePriorityOrder = [CaipScope.MAINNET, CaipScope.TESTNET, CaipScope.REGTEST];
    const scope = scopePriorityOrder.find((scope) => sessionScopes.has(scope));

    // If no scope is available, don't disconnect so that we can create/update a new session
    if (!scope) {
      this.#account = undefined;
      return;
    }
    const scopeAccounts = session?.sessionScopes[scope]?.accounts;

    // In case the Solana scope is available but without any accounts
    // Could happen if the user already created a session using ethereum injected provider for example or the SDK
    // Don't disconnect so that we can create/update a new session
    if (!scopeAccounts?.[0]) {
      this.#account = undefined;
      return;
    }

    let addressToConnect;
    // Try to use selectedAddress
    if (selectedAddress && scopeAccounts.includes(`${scope}:${selectedAddress}`)) {
      addressToConnect = selectedAddress;
    }
    // Otherwise try to use the previously saved address in this.#account
    else if (this.#account?.address && scopeAccounts.includes(`${scope}:${this.#account?.address}`)) {
      addressToConnect = this.#account.address;
    }
    // Otherwise select first account
    else {
      addressToConnect = getAddressFromCaipAccountId(scopeAccounts[0]);
    }

    // Update the account and scope
    this.#account = this.#getAccountFromAddress(addressToConnect);
    this.scope = scope;
    // this.#emit('change', { accounts: this.accounts });
  }

  #getAccountFromAddress(address: string) {
    return new WalletStandardWalletAccount({
      address,
      publicKey: new Uint8Array(Buffer.from(address)),
      chains: this.chains,
    });
  }

  #tryRestoringSession = async (): Promise<void> => {
    try {
      const existingSession = await this.client.getSession();

      if (!existingSession) {
        return;
      }

      // Get the account from accountChanged emitted on page load, if any
      const account = await this.#selectedAddressOnPageLoadPromise;
      this.updateSession(existingSession, account);
    } catch (error) {
      console.warn('Error restoring session', error);
    }
  };

  #createSession = async (scope: CaipScope, addresses?: string[]): Promise<void> => {
    let resolvePromise: (value: string) => void;
    const waitForAccountChangedPromise = new Promise<string>((resolve) => {
      resolvePromise = resolve;
    });

    // If there are multiple accounts, wait for the first accountChanged event to know which one to use
    const handleAccountChange = (data: any) => {
      if (!isAccountChangedEvent(data)) {
        return;
      }
      const selectedAddress = data?.params?.notification?.params?.[0];

      if (selectedAddress) {
        removeNotification();
        resolvePromise(selectedAddress);
      }
    };

    const removeNotification = this.client.onNotification(handleAccountChange);

    const session = await this.client.createSession({
      optionalScopes: {
        [scope]: {
          ...(addresses ? { accounts: addresses.map((address) => `${scope}:${address}` as CaipAccountId) } : {}),
          methods: [],
          notifications: [],
        },
      },
      sessionProperties: {
        solana_accountChanged_notifications: true,
      },
    });

    console.log('WalletStandard::#createSession', { session });

    // Wait for the accountChanged event to know which one to use, timeout after 200ms
    const selectedAddress = await Promise.race([
      waitForAccountChangedPromise,
      new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 200)),
    ]);

    this.updateSession(session, selectedAddress);
  };

  /**
   * Get the SatsConnect provider for the given client.
   *
   * @returns The SatsConnect provider.
   */
  #getSatsConnectProvider = (): BitcoinProvider => {
    return {
      connect: async (request: string): Promise<GetAddressResponse> => {
        const { payload } = decodeToken(request);
        console.log('walletStandard::SatsConnect::provider::connect', { payload }); // BitcoinConnectInput

        if (typeof payload === 'string') {
          throw new Error('Invalid request.');
        }

        const { purposes } = payload as unknown as BitcoinConnectInput;
        if (purposes.length !== 1 || purposes.at(0) !== AddressPurpose.Payment) {
          throw new Error('Only payment addresses are supported.');
        }

        await this.#connect();

        return {
          addresses: this.accounts.map(({ publicKey, address }) => ({
            address,
            publicKey: Buffer.from(publicKey).toString('hex'),
            purpose: AddressPurpose.Payment,
            addressType: AddressType.p2wpkh,
            walletType: WalletType.SOFTWARE,
          })),
        };
      },

      request: async <Method extends keyof Requests>(
        method: Method,
        options: Params<Method>,
        providerId?: string,
      ): Promise<RpcResponse<Method>> => {
        console.log('SatsConnect request', { method, options, providerId });
        throw new Error('Method not implemented.');
      },

      signTransaction: async (request: string): Promise<SignTransactionResponse> => {
        console.log('SatsConnect signTransaction', { request });
        throw new Error('Method not implemented.');
      },

      signMessage: async (request: string): Promise<string> => {
        console.log('SatsConnect signMessage', { request });
        throw new Error('Method not implemented.');
      },

      sendBtcTransaction: async (request: string): Promise<SendBtcTransactionResponse> => {
        console.log('SatsConnect sendBtcTransaction', { request });
        throw new Error('Method not implemented.');
      },

      createInscription: async (request: string): Promise<CreateInscriptionResponse> => {
        console.log('SatsConnect createInscription', { request });
        throw new Error('Method not implemented.');
      },

      createRepeatInscriptions: async (request: string): Promise<CreateRepeatInscriptionsResponse> => {
        console.log('SatsConnect createRepeatInscriptions', { request });
        throw new Error('Method not implemented.');
      },

      signMultipleTransactions: async (request: string): Promise<SignMultipleTransactionsResponse> => {
        console.log('SatsConnect signMultipleTransactions', { request });
        throw new Error('Method not implemented.');
      },

      addListener: (info: ListenerInfo): (() => void) => {
        console.log('SatsConnect addListener', { info });
        throw new Error('Method not implemented.');
      },

      getCapabilities: async (): Promise<GetCapabilitiesResponse> => {
        return ['connect', 'signTransaction', 'signMessage'];
      },
    };
  };
}
