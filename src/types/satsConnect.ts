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
  SignMessageOptions,
  SignTransactionOptions,
  SignTransactionResponse,
  SignMultipleTransactionsResponse,
  GetCapabilitiesResponse,
  SendBtcTransactionOptions,
  SendBtcTransactionResponse,
  CreateInscriptionResponse,
  CreateRepeatInscriptionsResponse,
  AddListener,
  ListenerInfo,
  Requests,
  RpcResponse,
  Params,
} from 'sats-connect';

/**
 * Address purposes supported by SatsConnect.
 * We should keep the same casing as in 'sats-connect' package.
 */
export enum AddressPurpose {
  Ordinals = 'ordinals',
  Payment = 'payment',
  Stacks = 'stacks',
  Starknet = 'starknet',
  Spark = 'spark',
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
 * We should keep the same casing as in 'sats-connect' package.
 */
export enum AddressType {
  p2pkh = 'p2pkh',
  p2sh = 'p2sh',
  p2wpkh = 'p2wpkh',
  p2wsh = 'p2wsh',
  p2tr = 'p2tr',
  stacks = 'stacks',
  starknet = 'starknet',
  spark = 'spark',
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
