import { registerWallet } from '@wallet-standard/wallet';
import type { MetaMaskWalletOptions } from './types/common';
import { MetaMaskWallet } from './wallet';

export function getBitcoinWalletStandard(options: MetaMaskWalletOptions) {
  return new MetaMaskWallet(options);
}

export async function registerBitcoinWalletStandard(options: MetaMaskWalletOptions) {
  registerWallet(getBitcoinWalletStandard(options));
}
