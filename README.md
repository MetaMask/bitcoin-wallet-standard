# MetaMask Bitcoin Wallet Standard

This TypeScript module is maintained in the style of the MetaMask team.

## Installation

`yarn add @metamask/bitcoin-wallet-standard`

or

`npm install @metamask/bitcoin-wallet-standard``

# Usage

## Manually Registering `@metamask/bitcoin-wallet-standard`

```typescript
import { getMultichainClient, getDefaultTransport } from '@metamask/multichain-api-client';
import { registerBitcoinWalletStandard } from '@metamask/bitcoin-wallet-standard';

const client = getMultichainClient({ transport: getDefaultTransport() });

registerBitcoinWalletStandard({ client });
```

## Connecting with wallet standard

```
import { type Wallet, getWallets } from '@wallet-standard/core';

// Checks if a wallet is a bitcoin wallet standard wallet
const isBitcoinWalletStandardWallet = (wallet: Wallet): boolean => {
  return 'bitcoin:connect' in wallet.features;
}

const detectedWallets = getWallets().get();

const metamask_wallet = detectedWallets.find(wallet => 
  isBitcoinWalletStandardWallet(wallet) && wallet.name.includes('MetaMask')
)

// Request connection to the wallet and get the connected account
const { accounts } = await metamask_wallet.features['bitcoin:connect'].connect({
  purposes: ['payment'],
})

// Request a taproot account for ordinals
const { accounts: ordinalAccounts } = await metamask_wallet.features['bitcoin:connect'].connect({
  purposes: ['ordinals'],
})

wallet.features['bitcoin:events'].on('change', (event => {
  // Handle events
}));

// Sign a message
const signMessageFeature = metamask_wallet.features['bitcoin:signMessage']
const result = await signMessageFeature.signMessage({
  account: accounts[0],
  message: 'Hello bitcoin',
});

// Sign a transaction
const { psbtBase64, inputsToSign } = builtPsbt()
const signTransactionFeature = metamask_wallet.features['bitcoin:signTransaction']
const result = await signTransactionFeature.signTransaction({
  psbt: Buffer.from(psbtBase64, 'base64'),
  inputsToSign: inputsToSign.map((input) => ({
    account: accounts[0],
    signingIndexes: input.signingIndexes,
    sigHash: 'ALL',
  })),
  chain: 'bitcoin:mainnet',
});
```

## Connecting with Sats Connect

The `sats-connect:` feature exposes the wallet's Bitcoin provider. Two major versions of sats-connect have different APIs — v3 is callback-based, v4 is promise-based (JSON-RPC).

### Sats Connect v3

```typescript
import { type Wallet, getWallets } from '@wallet-standard/core';
import { AddressPurpose, BitcoinNetworkType, getAddress, signMessage, sendBtcTransaction } from 'sats-connect';
import { Buffer } from 'buffer';

const isBitcoinSatsConnectWallet = (wallet: Wallet): boolean => {
  return 'sats-connect:' in wallet.features;
}

const detectedWallets = getWallets().get();

const metamask_wallet = detectedWallets.find(wallet =>
  isBitcoinSatsConnectWallet(wallet) && wallet.name.includes('MetaMask')
);

const provider = metamask_wallet.features['sats-connect:'].provider;

provider.addListener({
  eventName: 'accountChange',
  cb: (event) => {
    // Handle account change
  },
});

provider.addListener({
  eventName: 'disconnect',
  cb: () => {
    // Handle disconnect
  },
});

let selectedAccount: any;

// Connect and get address
await getAddress({
  getProvider: async () => provider,
  payload: {
    purposes: [AddressPurpose.Payment],
    message: 'Address for receiving BTC',
    network: { type: BitcoinNetworkType.Mainnet },
  },
  onFinish: (response: any) => {
    const list = (response.addresses || []).map((a: any) => ({ address: a.address, purpose: a.purpose }));
    selectedAccount = list[0];
  },
  onCancel: () => {
    // user cancelled
  },
});

// Sign a message
const signature = await new Promise((resolve, reject) =>
  signMessage({
    getProvider: async () => provider,
    payload: {
      address: selectedAccount.address,
      message: Buffer.from('Hello bitcoin').toString('utf8'),
      network: { type: BitcoinNetworkType.Mainnet },
    },
    onFinish: (r: any) => resolve(r),
    onCancel: () => reject(new Error('Signature cancelled')),
  }),
);

// Send a transaction
const toAddress = ''; // Recipient address
const amountSats = 400n;

const txId = await new Promise((resolve, reject) =>
  sendBtcTransaction({
    getProvider: async () => provider,
    payload: {
      network: { type: BitcoinNetworkType.Mainnet },
      recipients: [{ address: toAddress, amountSats }],
      senderAddress: selectedAccount.address,
    },
    onFinish: (r: any) => resolve(r?.result?.txId || r?.txId),
    onCancel: () => reject(new Error('Transaction cancelled')),
  }),
);
```

### Sats Connect v4

v4 uses a promise-based JSON-RPC API via a `Wallet` singleton. It does not use `@wallet-standard/core` natively — its default adapter registry only covers Xverse, Unisat, and Fordefi. To use it with MetaMask (or any wallet-standard provider), expose the provider on `window` at a known key: v4 resolves providers via `getProviderById(id)` which traverses `window` by path, so this is the native mechanism the library was designed for.

```typescript
import { type Wallet, getWallets } from '@wallet-standard/core';
import WalletV4 from 'sats-connect'; // v4

const isBitcoinSatsConnectWallet = (wallet: Wallet): boolean => {
  return 'sats-connect:' in wallet.features;
}

const detectedWallets = getWallets().get();

const metamask_wallet = detectedWallets.find(wallet =>
  isBitcoinSatsConnectWallet(wallet) && wallet.name.includes('MetaMask')
);

const provider = metamask_wallet.features['sats-connect:'].provider;

// Expose the wallet-standard provider on window so v4 can resolve it.
// v4's getProviderById(id) traverses window by the providerId path string —
// this is the native provider resolution mechanism of sats-connect v4.
const PROVIDER_ID = '__walletStandardProvider';

(window as any)[PROVIDER_ID] = provider;
(WalletV4 as any).providerId = PROVIDER_ID;

// Connect and get addresses
const connectResponse = await WalletV4.request('getAddresses', {
  purposes: ['payment'],
  message: 'Address for receiving BTC',
});

// Connect and get a taproot address for ordinals
const ordinalsResponse = await WalletV4.request('getAddresses', {
  purposes: ['ordinals'],
  message: 'Address for receiving ordinals',
});

if (connectResponse.status === 'error') {
  throw new Error(connectResponse.error.message);
}

const selectedAccount = connectResponse.result.addresses[0];

// Sign a message
const signResponse = await WalletV4.request('signMessage', {
  address: selectedAccount.address,
  message: 'Hello bitcoin',
});

if (signResponse.status === 'error') {
  throw new Error(signResponse.error.message);
}

const signature = signResponse.result.signature;

// Send a transaction
const sendResponse = await WalletV4.request('sendTransfer', {
  recipients: [{ address: '...', amount: 400 }],
});

if (sendResponse.status === 'error') {
  throw new Error(sendResponse.error.message);
}

const txId = sendResponse.result.txid;

// Sign a PSBT
const psbtResponse = await WalletV4.request('signPsbt', {
  psbt: '<base64-encoded-psbt>',
  signInputs: {
    [selectedAccount.address]: [0], // address → input indexes to sign
  },
  broadcast: false,
});

if (psbtResponse.status === 'error') {
  throw new Error(psbtResponse.error.message);
}

const signedPsbt = psbtResponse.result.psbt;

// Cleanup on disconnect
delete (window as any)[PROVIDER_ID];
(WalletV4 as any).providerId = undefined;
```

## API

See our documentation:

- [Latest published API documentation](https://metamask.github.io/bitcoin-wallet-standard/latest/)
- [Latest development API documentation](https://metamask.github.io/bitcoin-wallet-standard/staging/)

## Contributing

### Setup

- Install the current LTS version of [Node.js](https://nodejs.org)
  - If you are using [nvm](https://github.com/creationix/nvm#installation) (recommended) running `nvm install` will install the latest version and running `nvm use` will automatically choose the right node version for you.
- Install [Yarn](https://yarnpkg.com) v4 via [Corepack](https://github.com/nodejs/corepack?tab=readme-ov-file#how-to-install)
- Run `yarn install` to install dependencies and run any required post-install scripts

### Testing and Linting

Run `yarn test` to run the tests once. To run tests on file changes, run `yarn test:watch`.

Run `yarn lint` to run the linter, or run `yarn lint:fix` to run the linter and fix any automatically fixable issues.

### Release & Publishing

The project follows the same release process as the other libraries in the MetaMask organization. The GitHub Actions `[action-create-release-pr](https://github.com/MetaMask/action-create-release-pr)` and `[action-publish-release](https://github.com/MetaMask/action-publish-release)` are used to automate the release process; see those repositories for more information about how they work.

1. Choose a release version.
  - The release version should be chosen according to SemVer. Analyze the changes to see whether they include any breaking changes, new features, or deprecations, then choose the appropriate SemVer version. See [the SemVer specification](https://semver.org/) for more information.
2. If this release is backporting changes onto a previous release, then ensure there is a major version branch for that version (e.g. `1.x` for a `v1` backport release).
  - The major version branch should be set to the most recent release with that major version. For example, when backporting a `v1.0.2` release, you'd want to ensure there was a `1.x` branch that was set to the `v1.0.1` tag.
3. Trigger the `[workflow_dispatch](https://docs.github.com/en/actions/reference/events-that-trigger-workflows#workflow_dispatch)` event [manually](https://docs.github.com/en/actions/managing-workflow-runs/manually-running-a-workflow) for the `Create Release Pull Request` action to create the release PR.
  - For a backport release, the base branch should be the major version branch that you ensured existed in step 2. For a normal release, the base branch should be the main branch for that repository (which should be the default value).
  - This should trigger the `[action-create-release-pr](https://github.com/MetaMask/action-create-release-pr)` workflow to create the release PR.
4. Update the changelog to move each change entry into the appropriate change category ([See here](https://keepachangelog.com/en/1.0.0/#types) for the full list of change categories, and the correct ordering), and edit them to be more easily understood by users of the package.
  - Generally any changes that don't affect consumers of the package (e.g. lockfile changes or development environment changes) are omitted. Exceptions may be made for changes that might be of interest despite not having an effect upon the published package (e.g. major test improvements, security improvements, improved documentation, etc.).
  - Try to explain each change in terms that users of the package would understand (e.g. avoid referencing internal variables/concepts).
  - Consolidate related changes into one change entry if it makes it easier to explain.
  - Run `yarn auto-changelog validate --rc` to check that the changelog is correctly formatted.
5. Review and QA the release.
  - If changes are made to the base branch, the release branch will need to be updated with these changes and review/QA will need to restart again. As such, it's probably best to avoid merging other PRs into the base branch while review is underway.
6. Squash & Merge the release.
  - This should trigger the `[action-publish-release](https://github.com/MetaMask/action-publish-release)` workflow to tag the final release commit and publish the release on GitHub.
7. Publish the release on npm.
  - Wait for the `publish-release` GitHub Action workflow to finish. This should trigger a second job (`publish-npm`), which will wait for a run approval by the `[npm publishers](https://github.com/orgs/MetaMask/teams/npm-publishers)` team.
  - Approve the `publish-npm` job (or ask somebody on the npm publishers team to approve it for you).
  - Once the `publish-npm` job has finished, check npm to verify that it has been published.

