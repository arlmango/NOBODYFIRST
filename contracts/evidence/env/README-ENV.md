# Toolchain install evidence (haiku-env)

Date (UTC): 2026-10-12. Host: macOS 27.0 (Darwin 27.0.0), arm64. Rosetta: `arch -x86_64 /usr/bin/true` exit 0.

## Sources and versions

| Component | Version | Source URL | Size | Result |
|---|---|---|---|---|
| Foundry forge, cast, anvil, chisel | v1.8.5 (commit 51a52c59) | https://github.com/foundry-rs/foundry/releases/download/v1.8.5/foundry_v1.8.5_darwin_arm64.tar.gz | 121,257,495 bytes | installed to contracts/.tools/bin/ |
| solc | 0.8.37+commit.f401782d | https://binaries.soliditylang.org/macosx-amd64/solc-macosx-amd64-v0.8.37+commit.f401782d | 32,260,112 bytes | installed to contracts/.tools/solc/solc-0.8.37 |
| forge-std | v1.17.0 (commit f3dae6e6ee381f25eb6a246f7da9b85c91a68219) | https://github.com/foundry-rs/forge-std, tag v1.17.0 | n/a (git) | cloned to contracts/lib/forge-std |

## Foundry verification
- Release API: tag v1.8.5 exists, published 2026-10-05T18:46:58Z, not draft, not prerelease.
- Asset digests (API `digest` field), `.sha256` file, and the tarball sha256 all equal `56049728e25e44a61c7f2e49438023b0890cb45850ffcb7c882f90cd998baf83`.
- `gh attestation verify --repo foundry-rs/foundry` on the tarball: PASSED. Signer workflow `release`, source ref `refs/tags/v1.8.5`, source commit `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`, runner github-hosted. Attested subjects include the tarball and each binary.
- Extracted binaries (forge, cast, anvil, chisel) matched their attested sha256 digests before being copied to bin/. Tarball listing before extraction: forge, cast, anvil, chisel, solar. `solar` was not extracted.
- Caveat: the `.sha256`, attestation and sigstore files come from the same release. The attestation is the independent check; the sha256 files alone show only transport integrity.
- Binaries are Mach-O arm64 and were executed only after the checks passed.

## solc verification
- binaries.soliditylang.org list.json, entry 0.8.37: sha256 `a27396e7732aa52e80ff89ad7bd8a2e46fec2a6dcc4ef20cd16e5e0c502d6821`, keccak256 `3581bfdf7211ad70fe593bd43db6e355918886e22361f006f8a39f44627c7ae7`.
- Downloaded file matches the sha256 in list.json.
- Cross-check: GitHub release v0.8.37 (repo now at https://github.com/argotorg/solidity; ethereum/solidity redirects there), asset `solc-macos`, API digest the same sha256. The GitHub asset bytes are identical to the soliditylang build (same sha256, same size). This is the same build, not a different one.
- keccak256 was verified with a small pure-Python Keccak-256, checked against the standard test vectors for "" and "abc" first. It matches list.json.
- `file` reports a UNIVERSAL binary with an x86_64 slice and an arm64 slice, not x86_64-only as the plan assumed. It runs natively; `arch -x86_64` also works.
- Not verified: no GPG or Sigstore signature check on solc (none was requested). Trust rests on the hash match across two official hosts.

## forge-std verification
- `git ls-remote` and the GitHub git/refs API both give refs/tags/v1.17.0 as a lightweight tag pointing to commit f3dae6e6ee381f25eb6a246f7da9b85c91a68219.
- `git clone --depth 1 --branch v1.17.0`; `git rev-parse HEAD` gives the same SHA.
- No .gitmodules, no submodules. `src/Test.sol` is present. The clone keeps its own .git directory, which is untracked in the parent repo.

## Versions (see versions.txt)
- forge, cast, anvil, chisel: `1.8.5`, commit 51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f, all exit 0.
- solc-0.8.37: `0.8.37+commit.f401782d.Darwin.appleclang`, exit 0, native and under Rosetta.

## Install manifest
contracts/evidence/env/install-manifest.sha256 lists the installed binaries and the tarball. The tarball path it lists (contracts/.tools/_dl/...) was removed after hashing; its hash is kept in the manifest and in release-info.json.

## Not done / out of scope
- No foundry.toml, tests, or src changes. No .gitignore, package.json, or lockfile changes. No PATH or shell profile edits. No sudo, no global installs, no foundryup, no Rosetta install.
- `gh` was used read-only (existing keyring login); no tokens read.
