import { KnownSessionProperties } from '@metamask/chain-agnostic-permission';
import type { SessionData } from '@metamask/multichain-api-client';
import type { WalletAccount } from '@wallet-standard/base';
import { createUnsecuredToken } from 'jsontokens';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  BitcoinSignAndSendTransaction,
  BitcoinSignMessage,
  BitcoinSignTransaction,
} from './features';
import { BitcoinWallet, WalletStandardWalletAccount } from './satsConnectWallet';
import { CaipScope } from './types/common';
import { Chain } from './types/common';
import { AddressPurpose, AddressType, SatsConnectFeatureName, WalletType } from './types/satsConnect';

describe('MetamaskWallet', () => {
  let wallet: BitcoinWallet;
  let mockClient: ReturnType<typeof createMockClient>;
  let notificationHandler: ReturnType<typeof vi.fn>;

  // Emit account change event
  const emitAccountChange = (address: string) => {
    notificationHandler({
      method: 'wallet_notify',
      params: {
        notification: {
          method: 'metamask_accountsChanged',
          params: [address],
        },
      },
    });
  };

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

    const connectPromise = wallet.features[BitcoinConnect].connect({ purposes: [AddressPurpose.Payment] });

    // Emit account change event
    emitAccountChange(_address);

    return connectPromise;
  };

  // Helper to connect wallet and set account
  const reconnectAndSetAccount = async (_address = address) => {
    mockGetSession(mockClient, [_address]);
    setupNotificationHandler();

    const connectPromise = wallet.features[BitcoinConnect].connect({ purposes: [AddressPurpose.Payment] });

    // Emit account change event
    emitAccountChange(_address);

    return connectPromise;
  };

  const connectAndSetAccountWithSatsConnect = async (_address = address) => {
    mockCreateSession(mockClient, [_address]);
    setupNotificationHandler();

    const connectResult = await wallet.features[SatsConnectFeatureName].provider.connect(
      createUnsecuredToken({
        purposes: [AddressPurpose.Payment],
      }),
    );

    // Emit account change event
    // emitAccountChange(_address);

    return connectResult;
  };

  const reconnectAndSetAccountWithSatsConnect = async (_address = address) => {
    mockGetSession(mockClient, [_address]);
    setupNotificationHandler();

    const connectResult = wallet.features[SatsConnectFeatureName].provider.connect(
      createUnsecuredToken({
        purposes: [AddressPurpose.Payment],
      }),
    );

    // Emit account change event
    // emitAccountChange(_address);

    return connectResult;
  };

  const waitForAccountChange = async (expectedAccount: string, retries = 3, timeout = 500) => {
    for (let i = 0; i < retries; i++) {
      const account = wallet.accounts[0]?.address;

      if (account === expectedAccount) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, timeout));
    }

    throw new Error('Account change not received');
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    wallet = new BitcoinWallet({ client: mockClient, walletName: 'MetaMask Test' });

    // Mock #getInitialSelectedAddress private method to resolve immediately with undefined
    vi.spyOn(BitcoinWallet.prototype as any, 'getInitialSelectedAddress').mockResolvedValue(undefined);
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(wallet.version).toBe('1.0.0');
      expect(wallet.name).toBe('MetaMask Test');
      expect(wallet.icon).toBeDefined();
      expect(wallet.chains).toEqual([Chain.MAINNET, Chain.TESTNET, Chain.REGTEST]);
      expect(wallet.accounts).toEqual([]);
    });

    it('should initialize with default properties', () => {
      wallet = new BitcoinWallet({ client: mockClient });
      expect(wallet.name).toBe('MetaMask');
    });

    it('should have all required features', () => {
      const features = wallet.features;
      expect(features[BitcoinConnect]).toBeDefined();
      expect(features[BitcoinDisconnect]).toBeDefined();
      expect(features[SatsConnectFeatureName]).toBeDefined();
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
          [KnownSessionProperties.Bip122AccountChangedNotifications]: true,
        },
      });
      expect(result.accounts.length).toBe(1);
      expect(result.accounts[0]?.address).toBe(address);
    });

    it('should use fallback when no accountsChanged event is received', async () => {
      mockGetSession(mockClient, [address]);

      // Simulate no accountsChanged event (timeout will trigger)
      vi.useFakeTimers();
      const connectPromise = wallet.features[BitcoinConnect].connect({ purposes: [AddressPurpose.Payment] });

      // Fast-forward timer
      await vi.runAllTimersAsync();

      vi.useRealTimers();

      const result = await connectPromise;

      expect(mockClient.getSession).toHaveBeenCalled();
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
      await reconnectAndSetAccount();

      expect(wallet.accounts.length).toBe(1);

      await wallet.features[BitcoinDisconnect].disconnect();

      // Verify account is cleared
      expect(wallet.accounts).toEqual([]);
      expect(mockClient.revokeSession).toHaveBeenCalled();
      // TODO enable this when accountsChanged event is implemented
      // expect(changeListener).toHaveBeenCalledWith({ accounts: [] });
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
        SatsConnectFeatureName,
        BitcoinConnect,
        BitcoinDisconnect,
        BitcoinSignTransaction,
        BitcoinSignAndSendTransaction,
        BitcoinSignMessage,
      ]);
    });
  });

  describe('handleAccountsChangedEvent', () => {
    it('should call the change handler with new accounts when using bitcoin standard connection', async () => {
      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      await connectAndSetAccount();
      mockGetSession(mockClient, [address, address2]);

      // Simulate accountsChanged event with no address
      await notificationHandler({
        method: 'wallet_notify',
        params: {
          notification: {
            method: 'metamask_accountsChanged',
            params: [address2],
          },
        },
      });

      expect(changeListener).toHaveBeenCalledWith({ accounts: wallet.accounts });
    });

    it('should use address from getInitialSelectedAddress', async () => {
      // Mocks
      vi.spyOn(BitcoinWallet.prototype as any, 'getInitialSelectedAddress').mockResolvedValue(address2);
      mockCreateSession(mockClient, [address, address2]);
      mockGetSession(mockClient, [address, address2]);

      // Create new wallet with mocked getInitialSelectedAddress
      const walletWithInitialAddress = new BitcoinWallet({ client: mockClient });

      // Connect and verify the address from getInitialSelectedAddress was used
      const result = await walletWithInitialAddress.features[BitcoinConnect].connect({
        purposes: [AddressPurpose.Payment],
      });
      expect(result.accounts[0]?.address).toBe(address2);
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
      (wallet as any).updateSession(session, undefined);

      expect(wallet.accounts[0]?.address).toBe(address);
      expect((wallet as any).scope).toBe(CaipScope.MAINNET);
    });

    it('should use the selectedAddress if provided and valid', () => {
      (wallet as any).updateSession(session, address);

      expect(wallet.accounts[0]?.address).toBe(address);
      expect((wallet as any).scope).toBe(CaipScope.MAINNET);
    });

    it("should default to the first account in the scope if selectedAddress doesn't exists", () => {
      (wallet as any).updateSession(session, address2);

      expect(wallet.accounts[0]?.address).toBe(address);
      expect((wallet as any).scope).toBe(CaipScope.MAINNET);
    });

    it('should fall back to the previously saved account if selectedAddress is not provided', () => {
      (wallet as any).updateSession(session, undefined);

      const previousAccount = wallet.accounts[0];
      (wallet as any).updateSession(session, undefined);

      expect(wallet.accounts[0]).toEqual(previousAccount);
    });

    it('should default to the first account in the scope if no selectedAddress or previous account exists', () => {
      (wallet as any).updateSession(session, undefined);

      expect(wallet.accounts[0]?.address).toBe(address);
      expect((wallet as any).scope).toBe(CaipScope.MAINNET);
    });

    it('should set account to undefined if no scopes are available', () => {
      (wallet as any).updateSession({ sessionScopes: {} }, undefined);

      expect(wallet.accounts).toEqual([]);
      expect((wallet as any).scope).toBeUndefined();
    });

    it('should set account to undefined if the scope has no accounts', () => {
      (wallet as any).updateSession(
        {
          sessionScopes: {
            [CaipScope.MAINNET]: { accounts: [] },
          },
        },
        undefined,
      );

      expect(wallet.accounts).toEqual([]);
      expect((wallet as any).scope).toBeUndefined();
    });

    it('should emit a "change" event when the account is updated', () => {
      const changeListener = vi.fn();
      wallet.features[BitcoinEvents].on('change', changeListener);

      (wallet as any).updateSession(session, address);

      expect(changeListener).toHaveBeenCalledWith({ accounts: wallet.accounts });
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
            [KnownSessionProperties.Bip122AccountChangedNotifications]: true,
          },
        });
      });
    });

    describe('events', () => {
      it('should correctly register and call accountChange listener', async () => {
        const changeListener = vi.fn();

        wallet.features[SatsConnectFeatureName].provider.addListener({
          eventName: 'accountChange',
          cb: changeListener,
        });

        await reconnectAndSetAccountWithSatsConnect(address2);

        expect(changeListener).toHaveBeenCalledWith({
          type: 'accountChange',
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

      it('should correctly remove listers', async () => {
        const changeListener1 = vi.fn();
        const changeListener2 = vi.fn();
        const changeListener3 = vi.fn();

        const removeListener1 = wallet.features[SatsConnectFeatureName].provider.addListener({
          eventName: 'accountChange',
          cb: changeListener1,
        });
        const removeListener2 = wallet.features[SatsConnectFeatureName].provider.addListener({
          eventName: 'accountChange',
          cb: changeListener2,
        });
        const removeListener3 = wallet.features[SatsConnectFeatureName].provider.addListener({
          eventName: 'accountChange',
          cb: changeListener3,
        });

        await connectAndSetAccountWithSatsConnect(address);

        // expect(changeListener1).toHaveBeenCalledTimes(1);
        // expect(changeListener2).toHaveBeenCalledTimes(1);
        // expect(changeListener3).toHaveBeenCalledTimes(1);

        removeListener2();

        mockGetSession(mockClient, [address2]);
        emitAccountChange(address2);
        await waitForAccountChange(address2);

        // expect(changeListener1).toHaveBeenCalledTimes(2);
        // expect(changeListener2).toHaveBeenCalledTimes(1);
        // expect(changeListener3).toHaveBeenCalledTimes(2);

        removeListener3();

        mockGetSession(mockClient, [address]);
        emitAccountChange(address);
        await waitForAccountChange(address);

        // expect(changeListener1).toHaveBeenCalledTimes(3);
        // expect(changeListener2).toHaveBeenCalledTimes(1);
        // expect(changeListener3).toHaveBeenCalledTimes(2);

        removeListener1();

        mockGetSession(mockClient, [address2]);
        emitAccountChange(address2);
        await waitForAccountChange(address2);

        expect(changeListener1).toHaveBeenCalledTimes(3);
        expect(changeListener2).toHaveBeenCalledTimes(1);
        expect(changeListener3).toHaveBeenCalledTimes(2);
      });
    });
  });
});
