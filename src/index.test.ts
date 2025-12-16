import { registerWallet } from '@wallet-standard/wallet';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient } from '../tests/mocks';
import { getBitcoinWalletStandard, registerBitcoinWalletStandard } from './index';
import { BitcoinWallet } from './satsConnectWallet';

vi.mock('@wallet-standard/wallet', () => ({
  registerWallet: vi.fn(),
}));

vi.mock('./wallet', () => ({
  MetamaskWallet: vi.fn(),
}));

vi.mock('./satsConnectWallet', () => ({
  BitcoinWallet: vi.fn(),
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
      const wallet = getBitcoinWalletStandard(mockOptions);

      expect(BitcoinWallet).toHaveBeenCalledWith(mockOptions);
      expect(wallet).toBeInstanceOf(BitcoinWallet);
    });
  });

  describe('registerBitcoinWalletStandard', () => {
    it('should register the wallet using registerWallet', async () => {
      const mockOptions = { client: mockClient, walletName: 'MetaMask Test' };

      await registerBitcoinWalletStandard(mockOptions);

      expect(BitcoinWallet).toHaveBeenCalledWith(mockOptions);
      expect(registerWallet).toHaveBeenCalledWith(expect.any(BitcoinWallet));
    });
  });
});
