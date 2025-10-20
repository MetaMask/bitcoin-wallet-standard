/**
 * This file is used to re-export types from the 'sats-connect' package.
 * We want to avoid direct dependencies on 'sats-connect' in other parts of our codebase.
 *
 * And be sure we only import types at build time, but there is no runtime code included !!!
 */
import type { BitcoinProvider } from 'sats-connect';
export type {
  BitcoinProvider,
  GetAddressResponse,
  SignTransactionResponse,
  GetCapabilitiesResponse,
  SendBtcTransactionResponse,
  CreateInscriptionResponse,
  CreateRepeatInscriptionsResponse,
  SignMultipleTransactionsResponse,
  AddListener,
  SendBtcTransactionOptions,
  ListenerInfo,
  Requests,
  RpcResponse,
  Params,
} from 'sats-connect';

/**
 * Address purposes supported by SatsConnect.
 */
export enum AddressPurpose {
  ORDINALS = 'ordinals',
  Payment = 'payment',
  STACKS = 'stacks',
  STARKNET = 'starknet',
  SPARK = 'spark',
}

/**
 * Wallet types supported by SatsConnect.
 */
export enum WalletType {
  SOFTWARE = 'software',
  LEDGER = 'ledger',
  KEYSTONE = 'keystone',
}

/**
 * Address types supported by SatsConnect.
 */
export enum AddressType {
  P2PKH = 'p2pkh',
  P2SH = 'p2sh',
  P2WPKH = 'p2wpkh',
  P2WSH = 'p2wsh',
  P2TR = 'p2tr',
  STACKS = 'stacks',
  STARKNET = 'starknet',
  SPARK = 'spark',
}

/**
 * The namespace used to identify the SatsConnect feature.
 */
export const SatsConnectFeatureName = 'sats-connect:';

/**
 * The SatsConnect feature interface.
 */
export type SatsConnectFeature = {
  [SatsConnectFeatureName]: {
    provider: BitcoinProvider;
  };
};

/**
 * SatsConnect address
 */
export interface SatsConnectAccount {
  purpose: AddressPurpose;
  publicKey: Uint8Array;
  address: string;
}
