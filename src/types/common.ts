import type { MultichainApiClient } from '@metamask/multichain-api-client';
import { reverseMapping } from '../utils';
import { AddressType } from './satsConnect';

export type CaipChainIdStruct = `${string}:${string}`;
export type CaipAccountId = `${string}:${string}:${string}`;

export type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

export type BitcoinWalletOptions = {
  client: MultichainApiClient;
  walletName?: string;
};

export enum CaipScope {
  MAINNET = 'bip122:000000000019d6689c085ae165831e93',
  TESTNET = 'bip122:000000000933ea01ad0ee984209779ba',
  // TESTNET4 = 'bip122:00000000da84f2bafbbc53dee25a72ae',
  // SIGNET = 'bip122:00000008819873e925422c1ff0f99f7c',
  REGTEST = 'bip122:regtest',
}

/**
 * Supported scopes for bitcoin wallets.
 */
export enum Chain {
  MAINNET = 'bitcoin:mainnet',
  TESTNET = 'bitcoin:testnet',
  REGTEST = 'bitcoin:regtest',
}

export const scopeToChain: Record<CaipScope, Chain> = {
  [CaipScope.MAINNET]: Chain.MAINNET,
  [CaipScope.TESTNET]: Chain.TESTNET,
  // [Scope.Testnet4]: 'testnet4',
  // [Scope.Signet]: 'signet',
  [CaipScope.REGTEST]: Chain.REGTEST,
};
export const chainToScope = reverseMapping(scopeToChain);

export enum CaipAccountType {
  P2PKH = 'bip122:p2pkh',
  P2SH = 'bip122:p2sh',
  P2WPKH = 'bip122:p2wpkh',
  P2TR = 'bip122:p2tr',
}

export const caipToAddressType: Record<CaipAccountType, AddressType> = {
  [CaipAccountType.P2PKH]: AddressType.p2pkh,
  [CaipAccountType.P2SH]: AddressType.p2sh,
  [CaipAccountType.P2WPKH]: AddressType.p2wpkh,
  [CaipAccountType.P2TR]: AddressType.p2tr,
};

export const addressTypeToCaip = reverseMapping(caipToAddressType);

/**
 * The property name for account changed notifications from chain agnostic permission.
 *
 *  @see "@metamask/chain-agnostic-permission".KnownSessionProperties.Bip122AccountChangedNotifications
 */
export const Bip122AccountChangedNotificationsProperty = 'bip122_accountChanged_notifications';
