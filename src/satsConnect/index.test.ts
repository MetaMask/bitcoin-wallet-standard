import { beforeEach } from 'node:test';
import { registerWallet } from '@wallet-standard/wallet';
import { describe, expect, it, vi } from 'vitest';
import { createMockClient } from '../../tests/mocks';
import { getSatsConnectWalletStandard, registerBitcoinSatsConnectWalletStandard } from './index';
import { SatsConnectWallet } from './satsConnectWallet';

vi.mock('@wallet-standard/wallet', () => ({
  registerWallet: vi.fn(),
}));

vi.mock('./wallet', () => ({
  MetamaskWallet: vi.fn(),
}));

describe('index.ts', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  describe('getWalletStandard', () => {
    it('should return an instance of MetamaskWallet', () => {
      const mockOptions = { client: mockClient, walletName: 'MetaMask Test' };
      const wallet = getSatsConnectWalletStandard(mockOptions);

      expect(SatsConnectWallet).toHaveBeenCalledWith(mockOptions);
      expect(wallet).toBeInstanceOf(SatsConnectWallet);
    });
  });

  describe('registerBitcoinSatsConnectWalletStandard', () => {
    it('should register the wallet using registerWallet', async () => {
      const mockOptions = { client: mockClient, walletName: 'MetaMask Test' };

      await registerBitcoinSatsConnectWalletStandard(mockOptions);

      expect(SatsConnectWallet).toHaveBeenCalledWith(mockOptions);
      expect(registerWallet).toHaveBeenCalledWith(expect.any(SatsConnectWallet));
    });
  });
});
