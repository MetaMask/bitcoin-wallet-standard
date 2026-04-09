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
  BitcoinSatsConnect,
  type BitcoinSatsConnectFeature,
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
  type CaipAccountId,
  CaipScope,
  type MetaMaskWalletOptions,
} from './types/common';
import {
  AccountChangeEventName,
  type Address,
  AddressPurpose,
  AddressType,
  BitcoinNetworkType,
  type BitcoinProvider,
  type CreateInscriptionResponse,
  type CreateRepeatInscriptionsResponse,
  DisconnectEventName,
  type GetAddressResponse,
  type GetCapabilitiesResponse,
  type ListenerInfo,
  MessageSigningProtocols,
  type Params,
  type Requests,
  RpcErrorCode,
  type RpcResponse,
  type SendBtcTransactionOptions,
  type SendBtcTransactionResponse,
  type SendTransferParams,
  type SignMessageOptions,
  type SignMessageParams,
  type SignMultipleTransactionsResponse,
  type SignPsbtParams,
  type SignTransactionOptions,
  type SignTransactionResponse,
  SparkNetworkType,
  StacksNetworkType,
  WalletType,
} from './types/satsConnect';
import { getAddressFromCaipAccountId, isSessionChangedEvent } from './utils';

/**
 * A read-only implementation of a wallet account.
 */
export class WalletStandardWalletAccount extends ReadonlyWalletAccount {
  constructor({ address, publicKey, chains }: { address: string; publicKey: Uint8Array; chains: IdentifierArray }) {
    const features: IdentifierArray = [
      BitcoinSatsConnect,
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
export class MetaMaskWallet implements Wallet {
  readonly #listeners: { [E in BitcoinEventsNames]?: BitcoinEventsListeners[E][] } = {};
  readonly #satsListeners: {
    [K in ListenerInfo['eventName']]?: Extract<ListenerInfo, { eventName: K }>['cb'][];
  } = {};
  readonly version = '1.0.0' as const;
  readonly name;
  readonly icon = metamaskIcon;
  readonly chains: IdentifierArray = BITCOIN_CHAINS;
  static readonly bitcoinScopes = [CaipScope.MAINNET, CaipScope.TESTNET, CaipScope.REGTEST];
  protected scope: CaipScope | undefined;
  #account: WalletStandardWalletAccount | undefined;
  #removeSessionChangedListener: (() => void) | undefined;
  client: MultichainApiClient;

  constructor({ client, walletName }: MetaMaskWalletOptions) {
    this.client = client;
    this.name = `${walletName ?? 'MetaMask'}` as const;

    this.#tryRestoringSession();
    this.#removeSessionChangedListener = this.client.onNotification(this.#handleSessionChangedEvent.bind(this));
  }

  get accounts() {
    return this.#account ? [this.#account] : [];
  }

  get features(): BitcoinSatsConnectFeature & BitcoinStandardFeatures {
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
      [BitcoinSatsConnect]: {
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

    this.#removeSessionChangedListener?.();
    this.#removeSessionChangedListener = this.client.onNotification(this.#handleSessionChangedEvent.bind(this));

    return { accounts: this.accounts };
  };

  /**
   * Updates the session and the account to connect to.
   * This method handles the logic for selecting the appropriate Bitcoin network scope (mainnet/testnet/regtest)
   * and account to connect to based on the following priority: mainnet > testnet > regtest. It assumes the same
   * set of accounts is available for all Bitcoin scopes and will take the first account found from the scopes above.
   *
   * @param session - The session data containing available scopes and accounts
   */
  protected updateSession(session: SessionData | undefined) {
    // Get session scopes
    const sessionScopes = new Set(Object.keys(session?.sessionScopes ?? {}));

    // Find the first available scope in priority order: mainnet > testnet > regtest.
    const scope = MetaMaskWallet.bitcoinScopes.find((s) => sessionScopes.has(s));

    // If no scope is available, don't disconnect so that we can create/update a new session
    if (!scope) {
      this.#account = undefined;
      return;
    }
    const selectedAccountId = session?.sessionScopes[scope]?.accounts?.[0];

    // In case the Bitcoin scope is available but without any accounts
    // Could happen if the user already created a session using ethereum injected provider for example or the SDK
    // Don't disconnect so that we can create/update a new session
    if (!selectedAccountId) {
      this.#account = undefined;
      return;
    }

    const addressToConnect = getAddressFromCaipAccountId(selectedAccountId);

    // Update the account and scope
    const previousAccount = this.#account;
    this.#account = this.#getAccountFromAddress(addressToConnect);
    this.scope = scope;

    if (this.#account.address !== previousAccount?.address) {
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

  async #sendTransferInternal(recipients: { address: string; amount: string }[]): Promise<string> {
    if (!this.scope) {
      throw new Error('Scope not found.');
    }
    const result = await this.client.invokeMethod({
      scope: this.scope,
      request: {
        method: 'sendTransfer',
        params: {
          recipients,
          account: { address: this.#account?.address ?? '' },
        },
      },
    });
    return result.txid;
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
   * Handles the wallet_sessionChanged event.
   * Updates internal state to connected (with correct change event) when the session has Bitcoin scopes,
   * or to disconnected when it does not.
   * @param data - The event data
   */
  async #handleSessionChangedEvent(data: any) {
    if (!isSessionChangedEvent(data)) {
      return;
    }

    const sessionScopes = Object.keys(data.params.sessionScopes);
    const hasBitcoinScope = sessionScopes.some((s) => MetaMaskWallet.bitcoinScopes.includes(s as CaipScope));

    if (hasBitcoinScope) {
      this.updateSession(data.params);
    } else {
      // An empty sessionChanged event means that the Bitcoin scope was revoked outside of Wallet Standard.
      // We don't revoke the session in this case to avoid side effects on EVM scopes
      await this.#disconnect({ revokeSession: false });
    }
  }

  #disconnect = async (options: { revokeSession?: boolean } = {}): Promise<void> => {
    const wasConnected = Boolean(this.#account);
    const { revokeSession = true } = options;
    this.#account = undefined;
    this.scope = undefined;

    if (wasConnected) {
      this.#emit('change', { accounts: this.accounts });
      this.#emitSatsConnectDisconnect();
    }

    if (revokeSession) {
      this.#removeSessionChangedListener?.();
      this.#removeSessionChangedListener = undefined;
      await this.client.revokeSession({ scopes: [...MetaMaskWallet.bitcoinScopes] });
    }
  };

  #tryRestoringSession = async (): Promise<void> => {
    try {
      const existingSession = await this.client.getSession();

      if (!existingSession) {
        return;
      }

      this.updateSession(existingSession);
    } catch (error) {
      console.warn('Error restoring session', error);
    }
  };

  #createSession = async (scope: CaipScope, addresses?: string[]): Promise<void> => {
    const session = await this.client.createSession({
      optionalScopes: {
        [scope]: {
          ...(addresses ? { accounts: addresses.map((address) => `${scope}:${address}` as CaipAccountId) } : {}),
          methods: [],
          notifications: [],
        },
      },
      sessionProperties: {
        // Previously this was needed to enable metamask_accountsChanged events for Bitcoin.
        // This isn't needed for that purpose since we now encode selected accounts in the 
        // wallet_sessionChanged events. However this is still needed to help the wallet identify 
        // our injected bitcoin provider until we migrate to a more accurate property name.
        [Bip122AccountChangedNotificationsProperty]: true,
      },
    });

    this.updateSession(session);
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

      /**
       * SatsConnect V4 JSON-RPC request handler.
       *
       * Implements the `BitcoinProvider.request` interface from sats-connect v4.
       *
       * @see {@link https://docs.xverse.app/sats-connect} SatsConnect V4 documentation
       * @see {@link https://github.com/secretkeylabs/sats-connect} sats-connect GitHub
       *
       * Supported methods:
       * - `getInfo`                 — Returns wallet metadata (version, supported methods)
       * - `getAddresses`            — Connects and returns addresses with network info {@link https://docs.xverse.app/sats-connect/bitcoin-methods/getaddresses}
       * - `getAccounts`             — Connects and returns the accounts list
       * - `wallet_connect`          — Connects and returns addresses, network and wallet type
       * - `wallet_requestPermissions` — Requests wallet connection permissions
       * - `wallet_disconnect`       — Disconnects the wallet session
       * - `wallet_getWalletType`    — Returns the wallet type (SOFTWARE)
       * - `signMessage`             — Signs an arbitrary message {@link https://docs.xverse.app/sats-connect/bitcoin-methods/signmessage}
       * - `sendTransfer`            — Sends BTC to one or more recipients {@link https://docs.xverse.app/sats-connect/bitcoin-methods/sendtransfer}
       * - `signPsbt`                — Signs a base64-encoded PSBT, optionally broadcasting it {@link https://docs.xverse.app/sats-connect/bitcoin-methods/signpsbt}
       *
       * @param method - The RPC method name
       * @param options - Method-specific parameters
       * @param _providerId - Unused provider identifier (SatsConnect compat)
       * @returns A JSON-RPC 2.0 response object with either `result` or `error`
       */
      request: async <Method extends keyof Requests>(
        method: Method,
        options: Params<Method>,
        _providerId?: string,
      ): Promise<RpcResponse<Method>> => {
        const success = (result: unknown): RpcResponse<Method> =>
          ({ jsonrpc: '2.0', id: null, result }) as RpcResponse<Method>;

        const error = (code: RpcErrorCode, message: string): RpcResponse<Method> =>
          ({ jsonrpc: '2.0', id: null, error: { code, message } }) as RpcResponse<Method>;

        const network = {
          bitcoin: { name: BitcoinNetworkType.Mainnet },
          stacks: { name: StacksNetworkType.Mainnet },
          spark: { name: SparkNetworkType.Mainnet },
        };

        switch (method as string) {
          case 'getInfo': {
            return success({
              version: this.version,
              supports: [],
              methods: [
                'getAddresses',
                'getAccounts',
                'signMessage',
                'sendTransfer',
                'signPsbt',
                'wallet_connect',
                'wallet_disconnect',
                'wallet_getWalletType',
                'wallet_requestPermissions',
              ],
            });
          }

          case 'getAddresses':
          case 'getAccounts':
          case 'wallet_connect':
          case 'wallet_requestPermissions': {
            await this.#connect();
            if (!this.accounts.length) {
              return error(RpcErrorCode.ACCESS_DENIED, 'No accounts found');
            }
            if (method === 'wallet_requestPermissions') {
              return success(true);
            }
            const addresses = this.accounts.map(this.#standardAccountToSatsAccount);
            if (method === 'getAccounts') {
              return success(addresses);
            }
            if (method === 'getAddresses') {
              return success({ addresses, network });
            }
            // wallet_connect
            return success({ id: '', addresses, walletType: WalletType.SOFTWARE, network });
          }

          case 'signMessage': {
            const params = options as SignMessageParams;
            const signature = await this.#signMessageInternal(params.message);
            return success({
              signature,
              messageHash: '',
              address: this.#account?.address ?? '',
              protocol: MessageSigningProtocols.ECDSA,
            });
          }

          case 'sendTransfer': {
            if (!this.scope) {
              return error(RpcErrorCode.INTERNAL_ERROR, 'Scope not found.');
            }
            const { recipients } = options as SendTransferParams;
            const txid = await this.#sendTransferInternal(
              recipients.map((r) => ({ address: r.address, amount: r.amount.toString() })),
            );
            return success({ txid });
          }

          case 'signPsbt': {
            const { psbt, broadcast } = options as SignPsbtParams;
            const result = await this.#signTransactionInternal(psbt, broadcast);
            return success({ psbt: result.psbtBase64, txid: result.txId });
          }

          case 'wallet_disconnect': {
            await this.#disconnect();
            return success(null);
          }

          case 'wallet_getWalletType': {
            return success(WalletType.SOFTWARE);
          }

          default: {
            return error(RpcErrorCode.METHOD_NOT_FOUND, `Method "${String(method)}" is not supported.`);
          }
        }
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
        const { payload } = decodeToken(request) as unknown as SendBtcTransactionOptions;
        console.log('SatsConnect sendBtcTransaction', { payload });

        return this.#sendTransferInternal(
          payload.recipients.map((r) => ({ address: r.address, amount: r.amountSats.toString() })),
        );
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
