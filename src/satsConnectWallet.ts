import type { BitcoinConnectInput } from '@exodus/bitcoin-wallet-standard';
import { BITCOIN_CHAINS, BitcoinConnect } from '@exodus/bitcoin-wallet-standard';
import type { MultichainApiClient, SessionData } from '@metamask/multichain-api-client';
import type { IdentifierArray, Wallet } from '@wallet-standard/base';
import type { StandardConnectOutput } from '@wallet-standard/features';
import { ReadonlyWalletAccount } from '@wallet-standard/wallet';
import { decodeToken } from 'jsontokens';
import {
  BitcoinDisconnect,
  BitcoinEvents,
  type BitcoinEventsListeners,
  type BitcoinEventsNames,
  type BitcoinEventsOnMethod,
  BitcoinSignAndSendTransaction,
  type BitcoinSignAndSendTransactionInput,
  type BitcoinSignAndSendTransactionOutput,
  BitcoinSignMessage,
  type BitcoinSignMessageInput,
  type BitcoinSignMessageOutput,
  BitcoinSignTransaction,
  type BitcoinSignTransactionInput,
  type BitcoinSignTransactionOutput,
  type BitcoinStandardFeatures,
} from './features';
import { metamaskIcon } from './icon';
import {
  Bip122AccountChangedNotificationsProperty,
  type BitcoinWalletOptions,
  type CaipAccountId,
  CaipScope,
} from './types/common';
import {
  AccountChangeEventName,
  type Address,
  AddressPurpose,
  AddressType,
  type BitcoinProvider,
  type CreateInscriptionResponse,
  type CreateRepeatInscriptionsResponse,
  DisconnectEventName,
  type GetAddressResponse,
  type GetCapabilitiesResponse,
  type ListenerInfo,
  type Params,
  type Requests,
  type RpcResponse,
  type SatsConnectFeature,
  SatsConnectFeatureName,
  type SendBtcTransactionOptions,
  type SendBtcTransactionResponse,
  type SignMessageOptions,
  type SignMultipleTransactionsResponse,
  type SignTransactionOptions,
  type SignTransactionResponse,
  WalletType,
} from './types/satsConnect';
import { getAddressFromCaipAccountId, isAccountChangedEvent, isSessionChangedEvent } from './utils';

/**
 * A read-only implementation of a wallet account.
 */
export class WalletStandardWalletAccount extends ReadonlyWalletAccount {
  constructor({ address, publicKey, chains }: { address: string; publicKey: Uint8Array; chains: IdentifierArray }) {
    const features: IdentifierArray = [
      SatsConnectFeatureName,
      BitcoinConnect,
      BitcoinDisconnect,
      BitcoinSignTransaction,
      BitcoinSignAndSendTransaction,
      BitcoinSignMessage,
    ];
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
  readonly #listeners: { [E in BitcoinEventsNames]?: BitcoinEventsListeners[E][] } = {};
  readonly #satsListeners: {
    [K in ListenerInfo['eventName']]?: Extract<ListenerInfo, { eventName: K }>['cb'][];
  } = {};
  readonly version = '1.0.0' as const;
  readonly name;
  readonly icon = metamaskIcon;
  readonly chains: IdentifierArray = BITCOIN_CHAINS;
  protected scope: CaipScope | undefined;
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

  get features(): SatsConnectFeature & BitcoinStandardFeatures {
    return {
      [BitcoinConnect]: {
        version: this.version,
        connect: this.#connect,
      },
      [BitcoinDisconnect]: {
        version: this.version,
        disconnect: this.#disconnect,
      },
      [BitcoinEvents]: {
        version: this.version,
        on: this.#on,
      },
      [SatsConnectFeatureName]: {
        provider: this.#getSatsConnectProvider(),
      },
      [BitcoinSignTransaction]: {
        version: this.version,
        signTransaction: async (
          ...inputs: readonly BitcoinSignTransactionInput[]
        ): Promise<readonly BitcoinSignTransactionOutput[]> => {
          const results: SignTransactionResponse[] = [];
          for (const input of inputs) {
            const result = await this.#signTransactionInternal(Buffer.from(input.psbt).toString('base64'), false);
            results.push(result);
          }
          return results.map((result) => ({ signedPsbt: Buffer.from(result.psbtBase64, 'base64') }));
        },
      },
      [BitcoinSignAndSendTransaction]: {
        version: this.version,
        signAndSendTransaction: async (
          ...inputs: readonly BitcoinSignAndSendTransactionInput[]
        ): Promise<readonly BitcoinSignAndSendTransactionOutput[]> => {
          const results: BitcoinSignAndSendTransactionOutput[] = [];
          for (const input of inputs) {
            const result = await this.#signTransactionInternal(Buffer.from(input.psbt).toString('base64'), true);
            if (!result.txId) {
              throw new Error('Transaction ID not found.');
            }
            results.push({ txId: result.txId });
          }
          return results;
        },
      },
      [BitcoinSignMessage]: {
        version: this.version,
        signMessage: async (
          ...inputs: readonly BitcoinSignMessageInput[]
        ): Promise<readonly BitcoinSignMessageOutput[]> => {
          const results: BitcoinSignMessageOutput[] = [];
          for (const input of inputs) {
            const result = await this.#signMessageInternal(Buffer.from(input.message).toString('utf-8'));
            results.push({ signedMessage: Buffer.from(result, 'base64'), signature: Buffer.from(result, 'base64') });
          }
          return results;
        },
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

    // In case user didn't select any Bitcoin scope/account, return
    if (!this.accounts.length) {
      return { accounts: [] };
    }

    this.#removeAccountsChangedListener = this.client.onNotification(this.#handleEvents.bind(this));
    return { accounts: this.accounts };
  };

  /**
   * Updates the session and the account to connect to.
   * This method handles the logic for selecting the appropriate Bitcoin network scope (mainnet/testnet/regtest)
   * and account to connect to based on the following priority:
   * 1. First tries to find an available scope in order: mainnet > testnet > regtest, supposing the same set of accounts
   *    is available for all Bitcoin scopes
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
    const sessionScopes = new Set(session ? this.#getScopesFromSession(session) : []);

    // Find the first available scope in priority order: mainnet > testnet > regtest.
    const scopePriorityOrder = [CaipScope.MAINNET, CaipScope.TESTNET, CaipScope.REGTEST];
    const scope = scopePriorityOrder.find((scope) => sessionScopes.has(scope));

    // If no scope is available, don't disconnect so that we can create/update a new session
    if (!scope) {
      this.#account = undefined;
      return;
    }
    const scopeAccounts = session?.sessionScopes[scope]?.accounts;

    // In case the Bitcoin scope is available but without any accounts
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

    const didAddressChange = this.#account?.address !== addressToConnect;

    // Update the account and scope
    this.#account = this.#getAccountFromAddress(addressToConnect);
    this.scope = scope;

    if (didAddressChange) {
      this.#emit('change', { accounts: this.accounts });
      this.#emitSatsConnectAccountChange(this.#account);
    }
  }

  #getAccountFromAddress(address: string) {
    return new WalletStandardWalletAccount({
      address,
      publicKey: new Uint8Array(Buffer.from(address)),
      chains: this.chains,
    });
  }

  async #signMessageInternal(message: string): Promise<string> {
    if (!this.scope) {
      throw new Error('Scope not found.');
    }

    const signMessageRes = await this.client.invokeMethod({
      scope: this.scope,
      request: {
        method: 'signMessage',
        params: {
          message,
          account: { address: this.#account?.address ?? '' },
        },
      },
    });

    return signMessageRes.signature;
  }

  async #signTransactionInternal(psbtBase64: string, broadcast = false): Promise<SignTransactionResponse> {
    const selectedAccount = this.#account;

    if (!selectedAccount) {
      throw new Error('No connected account');
    }

    if (!this.scope) {
      throw new Error('Scope not found.');
    }

    const signTransactionRes = await this.client.invokeMethod({
      scope: this.scope,
      request: {
        method: 'signPsbt',
        params: {
          psbt: psbtBase64,
          options: { fill: true, broadcast },
          account: { address: this.#account?.address ?? '' },
        },
      },
    });

    return {
      psbtBase64: signTransactionRes.psbt,
      txId: signTransactionRes.txid ?? undefined,
    };
  }

  /**
   * Handles the accountsChanged and sessionChanged events.
   * @param data - The event data
   */
  async #handleEvents(data: any) {
    if (isAccountChangedEvent(data)) {
      const newAddressSelected = data?.params?.notification?.params?.[0];
      if (!newAddressSelected) {
        // Disconnect if no address selected
        await this.#disconnect();
        return;
      }
      const session = await this.client.getSession();
      if (!session) {
        return;
      }
      this.updateSession(session, newAddressSelected);
    } else if (isSessionChangedEvent(data)) {
      const session = data?.params;
      if (!session) {
        return;
      }
      const scopes = this.#getScopesFromSession(session);

      if (scopes.length === 0) {
        // Disconnect if no scope selected
        await this.#disconnect();
        return;
      }
      const isAccountsEmpty = !(session?.sessionScopes?.[scopes[0] as CaipScope]?.accounts?.length > 0);
      if (isAccountsEmpty) {
        // Disconnect if no address selected
        await this.#disconnect();
        return;
      }
      this.updateSession(session, scopes[0] as CaipScope);
    }
  }

  #disconnect = async (): Promise<void> => {
    await this.client.revokeSession({ scopes: [CaipScope.MAINNET, CaipScope.TESTNET, CaipScope.REGTEST] });

    this.#account = undefined;
    this.scope = undefined;
    this.#removeAccountsChangedListener?.();
    this.#removeAccountsChangedListener = undefined;

    this.#emit('change', { accounts: [] });
    this.#emitSatsConnectDisconnect();
  };

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
        [Bip122AccountChangedNotificationsProperty]: true,
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
          throw new Error(`Only payment addresses are supported. Received: ${purposes.join(', ')}`);
        }

        await this.#connect();

        if (this.accounts.length < 1) {
          throw new Error('No accounts found');
        }

        return {
          addresses: this.accounts.map(this.#standardAccountToSatsAccount),
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

        const { payload } = decodeToken(request) as unknown as SignTransactionOptions;
        // TODO: Check payload.network vs this.scope
        // TODO: we're currently not using payload.message. BTC Snap update required if we need to use it.

        return this.#signTransactionInternal(payload.psbtBase64, payload.broadcast);
      },

      signMessage: async (request: string): Promise<string> => {
        console.log('SatsConnect signMessage', { request });

        const {
          payload: { message: messagePayload },
        } = decodeToken(request) as unknown as SignMessageOptions;

        return this.#signMessageInternal(messagePayload);
      },

      sendBtcTransaction: async (request: string): Promise<SendBtcTransactionResponse> => {
        if (!this.scope) {
          throw new Error('Scope not found.');
        }

        const { payload } = decodeToken(request) as unknown as SendBtcTransactionOptions;
        console.log('SatsConnect sendBtcTransaction', { payload });

        const sendBtcTransactionRes = await this.client.invokeMethod({
          scope: this.scope,
          request: {
            method: 'sendTransfer',
            params: {
              recipients: payload.recipients.map((recipient) => ({
                address: recipient.address,
                amount: recipient.amountSats.toString(),
              })),
              account: { address: this.#account?.address ?? '' },
            },
          },
        });

        return sendBtcTransactionRes.txid;
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

        const { payload } = decodeToken(request) as unknown as { payload: { transactions: string[] } };
        const results: SignTransactionResponse[] = [];

        for (const tx of payload.transactions) {
          const result = await this.#signTransactionInternal(tx);
          results.push(result);
        }

        return results;
      },

      addListener: (info: ListenerInfo): (() => void) => {
        if (!this.#satsListeners[info.eventName]) {
          this.#satsListeners[info.eventName] = [];
        }

        const listeners = this.#satsListeners[info.eventName];
        const eventName = info.eventName;
        const callback = info.cb;

        (listeners as typeof listeners & Extract<ListenerInfo, { eventName: typeof info.eventName }>['cb'][]).push(
          callback,
        );

        return () => {
          if (!this.#satsListeners[eventName]) {
            return;
          }

          this.#satsListeners[eventName] = this.#satsListeners[eventName]?.filter(
            (listener) => listener !== callback,
          ) as any;
        };
      },

      getCapabilities: async (): Promise<GetCapabilitiesResponse> => {
        return ['connect', 'sendBtcTransaction', 'signTransaction', 'signMessage'];
      },
    };
  };

  #getScopesFromSession(session: SessionData) {
    return Object.keys(session?.sessionScopes ?? {});
  }

  #standardAccountToSatsAccount(account: WalletStandardWalletAccount): Address {
    return {
      address: account.address,
      publicKey: Buffer.from(account.publicKey).toString('hex'),
      purpose: AddressPurpose.Payment,
      addressType: AddressType.p2wpkh,
      walletType: WalletType.SOFTWARE,
    };
  }

  #emitSatsConnectAccountChange(account: WalletStandardWalletAccount): void {
    for (const listener of this.#satsListeners[AccountChangeEventName] || []) {
      listener({
        type: AccountChangeEventName,
        addresses: [this.#standardAccountToSatsAccount(account)],
      });
    }
  }

  #emitSatsConnectDisconnect(): void {
    for (const listener of this.#satsListeners[DisconnectEventName] || []) {
      listener({
        type: DisconnectEventName,
      });
    }
  }

  #emit<E extends BitcoinEventsNames>(event: E, ...args: Parameters<BitcoinEventsListeners[E]>): void {
    for (const listener of this.#listeners[event] ?? []) {
      listener.apply(null, args);
    }
  }

  #on: BitcoinEventsOnMethod = (event, listener) => {
    if (!this.#listeners[event]) {
      this.#listeners[event] = [];
    }

    this.#listeners[event]?.push(listener);

    return (): void => this.#off(event, listener);
  };

  #off<E extends BitcoinEventsNames>(event: E, listener: BitcoinEventsListeners[E]): void {
    this.#listeners[event] = this.#listeners[event]?.filter((existingListener) => listener !== existingListener);
  }
}
