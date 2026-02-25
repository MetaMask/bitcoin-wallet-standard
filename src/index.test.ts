import { registerWallet } from '@wallet-standard/wallet';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockClient } from '../tests/mocks';
import { getBitcoinWalletStandard, registerBitcoinWalletStandard } from './index';
import { MetaMaskWallet } from './wallet';

vi.mock('@wallet-standard/wallet', () => ({
  registerWallet: vi.fn(),
}));

vi.mock('./wallet', () => ({
  MetaMaskWallet: vi.fn(),
}));

vi.mock('./wallet', () => ({
  MetaMaskWallet: vi.fn(),
}));

describe('index.ts', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
  });

  describe('getWalletStandard', () => {
    it('should return an instance of MetaMaskWallet', () => {
      const mockOptions = { client: mockClient, walletName: 'MetaMask Test' };
      const wallet = getBitcoinWalletStandard(mockOptions);

      expect(MetaMaskWallet).toHaveBeenCalledWith(mockOptions);
      expect(wallet).toBeInstanceOf(MetaMaskWallet);
    });
  });

  describe('registerBitcoinWalletStandard', () => {
    it('should register the wallet using registerWallet', async () => {
      const mockOptions = { client: mockClient, walletName: 'MetaMask Test' };

      await registerBitcoinWalletStandard(mockOptions);

      expect(MetaMaskWallet).toHaveBeenCalledWith(mockOptions);
      expect(registerWallet).toHaveBeenCalledWith(expect.any(MetaMaskWallet));
    });
  });
});
