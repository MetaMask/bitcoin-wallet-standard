import { registerWallet } from '@wallet-standard/wallet';
import { BitcoinWallet } from './satsConnectWallet';
import type { BitcoinWalletOptions } from './types/common';

export function getBitcoinWalletStandard(options: BitcoinWalletOptions) {
  return new BitcoinWallet(options);
}

export async function registerBitcoinWalletStandard(options: BitcoinWalletOptions) {
  registerWallet(getBitcoinWalletStandard(options));
}
