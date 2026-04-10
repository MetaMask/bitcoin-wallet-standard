# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0]

### Added

- **BREAKING** Add `wallet_sessionChanged` listener for handling selecting account changes and for auto connecting and disconnecting the provider when session changes are initiated outside of the provider itself ([#25](https://github.com/MetaMask/bitcoin-wallet-standard/pull/25))
- Add compatibility with Sats Connect v4 API
- Add compatibility with Sats Connect v4 API ([#26](https://github.com/MetaMask/bitcoin-wallet-standard/pull/26))
- docs: add usage example for wallet standard ([#24](https://github.com/MetaMask/bitcoin-wallet-standard/pull/24))

### Removed

- Remove `metamask_accountsChanged` listener ([#25](https://github.com/MetaMask/bitcoin-wallet-standard/pull/25))

## [0.3.0]

### Fixed

- Correctly unregister notification handlers ([#20](https://github.com/MetaMask/bitcoin-wallet-standard/pull/20))
- Use correct notification property for session ([#19](https://github.com/MetaMask/bitcoin-wallet-standard/pull/19))

## [0.2.0]

### Added

- Handle disconnection from the extension and emit relevant events ([#17](https://github.com/MetaMask/bitcoin-wallet-standard/pull/17))
- Emit events for account changed ([#15](https://github.com/MetaMask/bitcoin-wallet-standard/pull/15))

## [0.1.0]

### Changed

- Initial release

[Unreleased]: https://github.com/MetaMask/bitcoin-wallet-standard/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/MetaMask/bitcoin-wallet-standard/compare/v0.3.0...v1.0.0
[0.3.0]: https://github.com/MetaMask/bitcoin-wallet-standard/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/MetaMask/bitcoin-wallet-standard/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MetaMask/bitcoin-wallet-standard/releases/tag/v0.1.0
