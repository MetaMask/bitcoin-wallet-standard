import type { SessionData } from '@metamask/multichain-api-client';
import type { WalletAccount } from '@wallet-standard/base';
import { createUnsecuredToken } from 'jsontokens';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockAddress as address,
  mockAddress2 as address2,
  mockChain as chain,
  createMockClient,
  mockCreateSession,
  mockGetSession,
  mockPublicKey as publicKey,
  mockScope as scope,
} from '../tests/mocks';
import {
  BitcoinConnect,
  BitcoinDisconnect,
  BitcoinEvents,
  BitcoinSatsConnect,
  BitcoinSignAndSendTransaction,
  BitcoinSignMessage,
  BitcoinSignTransaction,
} from './features';
import { Bip122AccountChangedNotificationsProperty, CaipScope } from './types/common';
import { Chain } from './types/common';
import {
  AccountChangeEventName,
  AddressPurpose,
  AddressType,
  BitcoinNetworkType,
  DisconnectEventName,
  MessageSigningProtocols,
  RpcErrorCode,
  SparkNetworkType,
  StacksNetworkType,
  WalletType,
} from './types/satsConnect';
import { MetaMaskWallet, WalletStandardWalletAccount } from './wallet';

describe('MetamaskWallet', () => {
  let wallet: MetaMaskWallet;
  let mockClient: ReturnType<typeof createMockClient>;
  let notificationHandler: ReturnType<typeof vi.fn>;

  const emptyBitcoinSessionPayload = () => ({
    method: 'wallet_sessionChanged' as const,
    params: { sessionScopes: {} },
  });

  const setupNotificationHandler = () => {
    notificationHandler = vi.fn();
    mockClient.onNotification.mockImplementation((handler) => {
      notificationHandler.mockImplementation((...params) => {
        handler(...params);
      });
    });
  };

  const connectAndSetAccount = async (_address = address) => {
    mockCreateSession(mockClient, [_address]);
    setupNotificationHandler();

    return wallet.features[BitcoinConnect].connect({ purposes: [AddressPurpose.Payment] });
  };

  // Helper to connect wallet and set account
  const reconnectAndSetAccount = async (_address = address) => {
    mockGetSession(mockClient, [_address]);
    setupNotificationHandler();

    return wallet.features[BitcoinConnect].connect({ purposes: [AddressPurpose.Payment] });
  };

  const connectAndSetAccountWithSatsConnect = async (_address = address) => {
    mockCreateSession(mockClient, [_address]);
    setupNotificationHandler();

    const connectResult = await wallet.features[BitcoinSatsConnect].provider.connect(
      createUnsecuredToken({
        purposes: [AddressPurpose.Payment],
      }),
    );

    return connectResult;
  };

  const reconnectAndSetAccountWithSatsConnect = async (_address = address) => {
    mockGetSession(mockClient, [_address]);
    setupNotificationHandler();

    const connectResult = wallet.features[BitcoinSatsConnect].provider.connect(
      createUnsecuredToken({
        purposes: [AddressPurpose.Payment],
      }),
    );

    return connectResult;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    wallet = new MetaMaskWallet({ client: mockClient, walletName: 'MetaMask Test' });
  });

  describe('constructor', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should initialize with correct properties', () => {
      expect(wallet.version).toBe('1.0.0');
      expect(wallet.name).toBe('MetaMask Test');
      expect(wallet.icon).toBeDefined();
      expect(wallet.chains).toEqual([Chain.MAINNET, Chain.TESTNET, Chain.REGTEST]);
      expect(wallet.accounts).toEqual([]);
    });

    it('registers wallet_sessionChanged listener and attempts session restore on construction', async () => {
      const localClient = createMockClient();
      const w = new MetaMaskWallet({ client: localClient, walletName: 'MetaMask Test' });

      expect(localClient.onNotification).toHaveBeenCalledTimes(1);
      await vi.runAllTimersAsync();
      expect(localClient.getSession).toHaveBeenCalled();
      expect(w.accounts).toEqual([]);
    });

    it('restores Bitcoin account when getSession returns a session during construction', async () => {
      const localClient = createMockClient();
      mockGetSession(localClient, [address]);
      const w = new MetaMaskWallet({ client: localClient, walletName: 'MetaMask Test' });

      await vi.runAllTimersAsync();

      expect(w.accounts.length).toBe(1);
      expect(w.accounts[0]?.address).toBe(address);
    });

    it('should initialize with default properties', () => {
      wallet = new MetaMaskWallet({ client: mockClient });
      expect(wallet.name).toBe('MetaMask');
    });

    it('should have all required features', () => {
      const features = wallet.features;
      expect(features[BitcoinConnect]).toBeDefined();
      expect(features[BitcoinDisconnect]).toBeDefined();
      expect(features[BitcoinSatsConnect]).toBeDefined();
      expect(features[BitcoinSignTransaction]).toBeDefined();
      expect(features[BitcoinSignAndSendTransaction]).toBeDefined();
      expect(features[BitcoinSignMessage]).toBeDefined();
    });
  });

  describe('connect', () => {
    it('should connect with existing session', async () => {
      const result = await reconnectAndSetAccount();

      expect(mockClient.getSession).toHaveBeenCalled();
      expect(mockClient.createSession).not.toHaveBeenCalled();
      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]?.address).toBe(address);
    });

    it('should create new session if no existing session', async () => {
      const result = await connectAndSetAccount();

      expect(mockClient.getSession).toHaveBeenCalled();
      expect(mockClient.createSession).toHaveBeenCalledWith({
        optionalScopes: {
          [scope]: {
            methods: [],
            notifications: [],
          },
        },
        sessionProperties: {
          [Bip122AccountChangedNotificationsProperty]: true,
        },
      });
      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]?.address).toBe(address);
    });
  });

  describe('events', () => {
    it('should register and trigger event listeners', async () => {
      const changeListener = vi.fn();

      wallet.features[BitcoinEvents].on('change', changeListener);

      await reconnectAndSetAccount();

      expect(changeListener).toHaveBeenCalledWith({ accounts: wallet.accounts });
    });
  });

  describe('disconnect', () => {
    it('should disconnect and clear account', async () => {
      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      await reconnectAndSetAccount();

      expect(wallet.accounts.length).toBe(1);

      await wallet.features[BitcoinDisconnect].disconnect();

      // Verify account is cleared
      expect(wallet.accounts).toEqual([]);
      expect(mockClient.revokeSession).toHaveBeenCalled();
      expect(changeListener).toHaveBeenCalledWith({ accounts: [] });
    });

    it('should not emit change when disconnecting while already disconnected', async () => {
      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      await wallet.features[BitcoinDisconnect].disconnect();

      expect(changeListener).not.toHaveBeenCalled();
    });
  });

  describe('signAndSendTransaction', () => {
    it('should sign and send transaction', async () => {
      await reconnectAndSetAccount();

      const psbt = new Uint8Array([1, 2, 3, 4]);
      const txId = 'testTxId';
      const account = wallet.accounts[0];

      mockClient.invokeMethod.mockResolvedValue({
        psbt,
        txid: txId,
      });

      // Ensure account is defined
      if (!account) {
        throw new Error('Test setup failed: account should be defined');
      }

      const results = await wallet.features[BitcoinSignAndSendTransaction].signAndSendTransaction({
        psbt,
        inputsToSign: [
          {
            account,
            signingIndexes: [0],
          },
        ],
        chain,
      });

      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signPsbt',
          params: {
            psbt: Buffer.from(psbt).toString('base64'),
            options: { fill: true, broadcast: true },
            account: { address: account.address },
          },
        },
      });

      expect(results).toEqual([
        {
          txId,
        },
      ]);
    });

    it('should throw error if no account', async () => {
      // Disconnect to clear account
      await reconnectAndSetAccount();

      const psbt = new Uint8Array([1, 2, 3, 4]);
      const txId = 'testTxId';
      const account = wallet.accounts[0];

      // Ensure account is defined
      if (!account) {
        throw new Error('Test setup failed: account should be defined');
      }

      await wallet.features[BitcoinDisconnect].disconnect();

      mockClient.invokeMethod.mockResolvedValue({
        psbt,
        txid: txId,
      });

      await expect(
        wallet.features[BitcoinSignAndSendTransaction].signAndSendTransaction({
          psbt,
          inputsToSign: [
            {
              account,
              signingIndexes: [0],
            },
          ],
          chain,
        }),
      ).rejects.toThrow('No connected account');
    });
  });

  describe('signTransaction', () => {
    it('should sign transaction', async () => {
      await connectAndSetAccount();

      const psbt = new Uint8Array([1, 2, 3, 4]);
      const account = wallet.accounts[0];
      const signedPsbt = 'base64EncodedSignedMessage';

      // Ensure account is defined
      if (!account) {
        throw new Error('Test setup failed: account should be defined');
      }

      mockClient.invokeMethod.mockResolvedValue({
        psbt: signedPsbt,
        txid: undefined,
      });

      const results = await wallet.features[BitcoinSignTransaction].signTransaction({
        psbt,
        inputsToSign: [
          {
            account,
            signingIndexes: [0],
          },
        ],
        chain,
      });

      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signPsbt',
          params: {
            psbt: Buffer.from(psbt).toString('base64'),
            options: { fill: true, broadcast: false },
            account: { address: account.address },
          },
        },
      });

      expect(results).toEqual([
        {
          signedPsbt: Buffer.from(signedPsbt, 'base64'),
        },
      ]);
    });
  });

  describe('signMessage', () => {
    it('should sign message', async () => {
      await connectAndSetAccount();
      const signature = 'signature';

      mockClient.invokeMethod.mockResolvedValue({
        signature,
      });

      const messageToSign = 'test message';
      const message = new TextEncoder().encode(messageToSign);
      const account = wallet.accounts[0] as WalletAccount;

      const results = await wallet.features[BitcoinSignMessage].signMessage({
        message,
        account,
      });

      expect(mockClient.invokeMethod).toHaveBeenCalledWith({
        scope,
        request: {
          method: 'signMessage',
          params: {
            message: messageToSign,
            account: { address: account.address },
          },
        },
      });

      expect(results).toEqual([
        {
          signature: Buffer.from(signature, 'base64'),
          signedMessage: Buffer.from(signature, 'base64'),
        },
      ]);
    });
  });

  describe('WalletStandardWalletAccount', () => {
    it('should create account with correct properties', () => {
      const account = new WalletStandardWalletAccount({
        address,
        publicKey,
        chains: wallet.chains,
      });

      expect(account.address).toBe(address);
      expect(account.publicKey).toEqual(publicKey);
      expect(account.chains).toEqual(wallet.chains);
      expect(account.features).toEqual([
        BitcoinSatsConnect,
        BitcoinConnect,
        BitcoinDisconnect,
        BitcoinSignTransaction,
        BitcoinSignAndSendTransaction,
        BitcoinSignMessage,
      ]);
    });
  });

  describe('handleSessionChangedEvent', () => {
    it('should disconnect without revoking session when session has no Bitcoin scopes', async () => {
      await connectAndSetAccount();

      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      await notificationHandler(emptyBitcoinSessionPayload());

      expect(wallet.accounts).toEqual([]);
      expect(mockClient.revokeSession).not.toHaveBeenCalled();
      expect(changeListener).toHaveBeenCalledWith({ accounts: [] });
    });

    it('updates account and emits change when wallet_sessionChanged includes a Bitcoin scope with a different first account', async () => {
      await connectAndSetAccount();

      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      await notificationHandler({
        method: 'wallet_sessionChanged' as const,
        params: {
          sessionScopes: {
            [CaipScope.MAINNET]: {
              accounts: [`${CaipScope.MAINNET}:${address2}`],
              methods: [],
              notifications: [],
            },
          },
        },
      });

      expect(wallet.accounts[0]?.address).toBe(address2);
      expect(changeListener).toHaveBeenCalledWith({ accounts: wallet.accounts });
    });

    it('ignores non-wallet_sessionChanged notifications', async () => {
      await connectAndSetAccount();

      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      await notificationHandler({
        method: 'wallet_notify',
        params: {
          notification: {
            method: 'metamask_accountsChanged',
            params: [address2],
          },
        },
      });

      expect(changeListener).not.toHaveBeenCalled();
      expect(wallet.accounts[0]?.address).toBe(address);
    });

    it('does not emit change when wallet_sessionChanged includes the same first account', async () => {
      await connectAndSetAccount();

      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      await notificationHandler({
        method: 'wallet_sessionChanged' as const,
        params: {
          sessionScopes: {
            [CaipScope.MAINNET]: {
              accounts: [`${CaipScope.MAINNET}:${address}`],
              methods: [],
              notifications: [],
            },
          },
        },
      });

      expect(changeListener).not.toHaveBeenCalled();
      expect(wallet.accounts[0]?.address).toBe(address);
    });
  });

  describe('#updateSession', () => {
    let session: SessionData;

    beforeEach(() => {
      session = {
        sessionScopes: {
          [CaipScope.MAINNET]: {
            accounts: [`${CaipScope.MAINNET}:${address}`],
            methods: [],
            notifications: [],
          },
          [CaipScope.TESTNET]: {
            accounts: [`${CaipScope.TESTNET}:${address}`],
            methods: [],
            notifications: [],
          },
        },
      };
    });

    it('should update account and scope to the first available scope in priority order', () => {
      (wallet as any).updateSession(session);

      expect(wallet.accounts[0]?.address).toBe(address);
      expect((wallet as any).scope).toBe(CaipScope.MAINNET);
    });

    it('should use the first account from the highest-priority scope', () => {
      (wallet as any).updateSession(session);

      expect(wallet.accounts[0]?.address).toBe(address);
      expect((wallet as any).scope).toBe(CaipScope.MAINNET);
    });

    it('should set account to undefined if no scopes are available', () => {
      (wallet as any).updateSession({ sessionScopes: {} });

      expect(wallet.accounts).toEqual([]);
      expect((wallet as any).scope).toBeUndefined();
    });

    it('should set account to undefined if the scope has no accounts', () => {
      (wallet as any).updateSession({
        sessionScopes: {
          [CaipScope.MAINNET]: { accounts: [] },
        },
      });

      expect(wallet.accounts).toEqual([]);
      expect((wallet as any).scope).toBeUndefined();
    });

    it('should emit a "change" event when the account is updated', () => {
      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      (wallet as any).updateSession(session);

      expect(changeListener).toHaveBeenCalledWith({ accounts: wallet.accounts });
    });

    it('should not emit a "change" event when account stays the same', () => {
      (wallet as any).updateSession(session);

      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      (wallet as any).updateSession(session);

      expect(changeListener).not.toHaveBeenCalled();
    });
  });

  describe('SatsConnect V4 request', () => {
    const expectedNetwork = {
      bitcoin: { name: BitcoinNetworkType.Mainnet },
      stacks: { name: StacksNetworkType.Mainnet },
      spark: { name: SparkNetworkType.Mainnet },
    };

    describe('getInfo', () => {
      it('should return wallet info', async () => {
        const result = await wallet.features[BitcoinSatsConnect].provider.request('getInfo', null);

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          result: {
            version: '1.0.0',
            supports: expect.any(Array),
            methods: expect.arrayContaining(['getAddresses', 'signMessage', 'sendTransfer', 'signPsbt']),
          },
        });
      });
    });

    describe('getAddresses', () => {
      it('should connect and return addresses with network info', async () => {
        await reconnectAndSetAccount(address);

        const result = await wallet.features[BitcoinSatsConnect].provider.request('getAddresses', {
          purposes: [AddressPurpose.Payment],
        });

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          result: {
            addresses: [
              {
                address,
                publicKey: Buffer.from(address).toString('hex'),
                purpose: AddressPurpose.Payment,
                addressType: AddressType.p2wpkh,
                walletType: WalletType.SOFTWARE,
              },
            ],
            network: expectedNetwork,
          },
        });
      });
    });

    describe('getAccounts', () => {
      it('should connect and return accounts list', async () => {
        await reconnectAndSetAccount(address);

        const result = await wallet.features[BitcoinSatsConnect].provider.request('getAccounts', {
          purposes: [AddressPurpose.Payment],
        });

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          result: [
            {
              address,
              publicKey: Buffer.from(address).toString('hex'),
              purpose: AddressPurpose.Payment,
              addressType: AddressType.p2wpkh,
              walletType: WalletType.SOFTWARE,
            },
          ],
        });
      });
    });

    describe('wallet_connect', () => {
      it('should connect and return full wallet connect result', async () => {
        await reconnectAndSetAccount(address);

        const result = await wallet.features[BitcoinSatsConnect].provider.request('wallet_connect', null);

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          result: {
            addresses: [expect.objectContaining({ address })],
            walletType: WalletType.SOFTWARE,
            network: expectedNetwork,
          },
        });
      });
    });

    describe('signMessage', () => {
      it('should sign message using V4 params and return structured result', async () => {
        await reconnectAndSetAccount(address);

        const signature = 'v4signature';
        mockClient.invokeMethod.mockResolvedValue({ signature });

        const result = await wallet.features[BitcoinSatsConnect].provider.request('signMessage', {
          address,
          message: 'hello',
        });

        expect(mockClient.invokeMethod).toHaveBeenCalledWith({
          scope,
          request: {
            method: 'signMessage',
            params: { message: 'hello', account: { address } },
          },
        });

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          result: {
            signature,
            address,
            protocol: MessageSigningProtocols.ECDSA,
          },
        });
      });
    });

    describe('sendTransfer', () => {
      it('should send BTC transfer using V4 amount (number in sats)', async () => {
        await reconnectAndSetAccount(address);

        const txid = 'v4txid';
        mockClient.invokeMethod.mockResolvedValue({ txid });

        const result = await wallet.features[BitcoinSatsConnect].provider.request('sendTransfer', {
          recipients: [{ address: address2, amount: 50000 }],
        });

        expect(mockClient.invokeMethod).toHaveBeenCalledWith({
          scope,
          request: {
            method: 'sendTransfer',
            params: {
              recipients: [{ address: address2, amount: '50000' }],
              account: { address },
            },
          },
        });

        expect(result).toMatchObject({ jsonrpc: '2.0', result: { txid } });
      });

      it('should return error if not connected', async () => {
        const result = await wallet.features[BitcoinSatsConnect].provider.request('sendTransfer', {
          recipients: [{ address: address2, amount: 50000 }],
        });

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          error: { code: RpcErrorCode.INTERNAL_ERROR },
        });
      });
    });

    describe('signPsbt', () => {
      it('should sign PSBT using V4 params', async () => {
        await reconnectAndSetAccount(address);

        const signedPsbt = 'signedBase64Psbt';
        mockClient.invokeMethod.mockResolvedValue({ psbt: signedPsbt, txid: undefined });

        const result = await wallet.features[BitcoinSatsConnect].provider.request('signPsbt', {
          psbt: 'originalBase64Psbt',
          broadcast: false,
        });

        expect(mockClient.invokeMethod).toHaveBeenCalledWith({
          scope,
          request: {
            method: 'signPsbt',
            params: {
              psbt: 'originalBase64Psbt',
              options: { fill: true, broadcast: false },
              account: { address },
            },
          },
        });

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          result: { psbt: signedPsbt },
        });
      });
    });

    describe('wallet_requestPermissions', () => {
      it('should connect and return true when permissions are granted', async () => {
        await reconnectAndSetAccount(address);

        const result = await wallet.features[BitcoinSatsConnect].provider.request('wallet_requestPermissions', null);

        expect(result).toMatchObject({ jsonrpc: '2.0', result: true });
      });

      it('should return ACCESS_DENIED error when no accounts found', async () => {
        // No session set up → connect will yield no accounts
        mockClient.getSession.mockResolvedValue(null);
        mockClient.createSession.mockResolvedValue({ sessionScopes: {} });

        const result = await wallet.features[BitcoinSatsConnect].provider.request('wallet_requestPermissions', null);

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          error: { code: RpcErrorCode.ACCESS_DENIED },
        });
      });
    });

    describe('wallet_disconnect', () => {
      it('should disconnect and return null result', async () => {
        await reconnectAndSetAccount(address);
        expect(wallet.accounts.length).toBe(1);

        const result = await wallet.features[BitcoinSatsConnect].provider.request('wallet_disconnect', null);

        expect(result).toMatchObject({ jsonrpc: '2.0', result: null });
        expect(wallet.accounts).toEqual([]);
        expect(mockClient.revokeSession).toHaveBeenCalled();
      });
    });

    describe('wallet_getWalletType', () => {
      it('should return software wallet type', async () => {
        const result = await wallet.features[BitcoinSatsConnect].provider.request('wallet_getWalletType', null);

        expect(result).toMatchObject({ jsonrpc: '2.0', result: WalletType.SOFTWARE });
      });
    });

    describe('unsupported methods', () => {
      it('should return METHOD_NOT_FOUND error for unknown methods', async () => {
        const result = await wallet.features[BitcoinSatsConnect].provider.request(
          'runes_getBalance' as any,
          null as any,
        );

        expect(result).toMatchObject({
          jsonrpc: '2.0',
          error: { code: RpcErrorCode.METHOD_NOT_FOUND },
        });
      });
    });
  });

  describe('SatsConnect', () => {
    describe('connect', () => {
      it('should create session and return addresses', async () => {
        const result = await connectAndSetAccountWithSatsConnect(address);

        expect(result.addresses.length).toBe(1);
        expect(result.addresses[0]?.address).toBe(address);
        expect(result.addresses[0]?.publicKey).toBe(Buffer.from(address).toString('hex'));
        expect(result.addresses[0]?.purpose).toBe(AddressPurpose.Payment);
        expect(result.addresses[0]?.addressType).toBe(AddressType.p2wpkh);

        expect(mockClient.createSession).toHaveBeenCalledWith({
          optionalScopes: {
            [scope]: {
              methods: [],
              notifications: [],
            },
          },
          sessionProperties: {
            [Bip122AccountChangedNotificationsProperty]: true,
          },
        });
      });
    });

    describe('events', () => {
      it('should correctly register and call accountChange listener', async () => {
        const changeListener = vi.fn();

        wallet.features[BitcoinSatsConnect].provider.addListener({
          eventName: AccountChangeEventName,
          cb: changeListener,
        });

        await reconnectAndSetAccountWithSatsConnect(address2);

        expect(changeListener).toHaveBeenCalledWith({
          type: AccountChangeEventName,
          addresses: [
            {
              address: address2,
              publicKey: Buffer.from(address2).toString('hex'),
              purpose: AddressPurpose.Payment,
              addressType: AddressType.p2wpkh,
              walletType: WalletType.SOFTWARE,
            },
          ],
        });
      });

      it('should correctly register and call disconnect listener', async () => {
        const disconnectListener = vi.fn();

        wallet.features[BitcoinSatsConnect].provider.addListener({
          eventName: DisconnectEventName,
          cb: disconnectListener,
        });

        await reconnectAndSetAccountWithSatsConnect(address);

        await wallet.features[BitcoinDisconnect].disconnect();

        expect(disconnectListener).toHaveBeenCalledTimes(1);
      });

      it('should correctly remove listers', async () => {
        const changeListener1 = vi.fn();
        const changeListener2 = vi.fn();
        const changeListener3 = vi.fn();

        const removeListener1 = wallet.features[BitcoinSatsConnect].provider.addListener({
          eventName: AccountChangeEventName,
          cb: changeListener1,
        });
        const removeListener2 = wallet.features[BitcoinSatsConnect].provider.addListener({
          eventName: AccountChangeEventName,
          cb: changeListener2,
        });
        const removeListener3 = wallet.features[BitcoinSatsConnect].provider.addListener({
          eventName: AccountChangeEventName,
          cb: changeListener3,
        });

        await connectAndSetAccountWithSatsConnect(address);

        removeListener2();

        await notificationHandler({
          method: 'wallet_sessionChanged' as const,
          params: {
            sessionScopes: {
              [CaipScope.MAINNET]: {
                accounts: [`${CaipScope.MAINNET}:${address2}`],
                methods: [],
                notifications: [],
              },
            },
          },
        });

        removeListener3();

        await notificationHandler({
          method: 'wallet_sessionChanged' as const,
          params: {
            sessionScopes: {
              [CaipScope.MAINNET]: {
                accounts: [`${CaipScope.MAINNET}:${address}`],
                methods: [],
                notifications: [],
              },
            },
          },
        });

        removeListener1();

        await notificationHandler({
          method: 'wallet_sessionChanged' as const,
          params: {
            sessionScopes: {
              [CaipScope.MAINNET]: {
                accounts: [`${CaipScope.MAINNET}:${address2}`],
                methods: [],
                notifications: [],
              },
            },
          },
        });

        expect(changeListener1).toHaveBeenCalledTimes(3);
        expect(changeListener2).toHaveBeenCalledTimes(1);
        expect(changeListener3).toHaveBeenCalledTimes(2);
      });
    });
  });
});
