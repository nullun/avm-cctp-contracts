# avm-cctp-contracts

## About

This repository contains AVM compatible smart contracts written in [TEALScript](https://github.com/algorandfoundation/tealscript/) for the [Cross-Chain Transfer Protocol](https://www.circle.com/en/cross-chain-transfer-protocol) (CCTP).

The code was heavily inspired by the [EVM smart contracts](https://github.com/circlefin/evm-cctp-contracts), and many of the comments have been copied over verbatim. Which is why they might not make much sense on Algorand. Further work is needed to tidy up the contracts and document how they operate.

Whilst the contracts function, they have not been thoroughly tested or audited in any way. Do not blindly use this in production!

## How it works

Various design decisions were made to get this to work on the AVM. Below is a non-comprehensive list of some of the bigger differences.

 * ASAs cannot be burnt. Therefore the burning mechanism on the AVM relies on sending the asset to the reserve address, removing it from circulation. This works well for assets such as USDC, who already have procedures in place to withdraw-from and deposit-to their reserve address.
 * Redeeming an asset on the AVM smart contracts requires a single application call transaction along with a small payment of 0.0073 Algo to cover the MBR increase for storing the nonce. All resources needed for using the application are included in a single application call.
 * To prevent minting of assets multiple times, the source domain + nonce is stored as a box (key) for each successful mint. This was the cheapest and simplest solution I could come up with, which requires zero maintenance from the application owner.
 * Signature verification is done using ecdsa\_pk\_recover and comparing it to a list (box) of `enabledAttesters`. Each use of the ecdsa\_pk\_recover opcode requires over 2,000 opcode budget and so we utilise the "OpUp" application deploy-n-destroy pattern. This increases the minting cost by approximately 0.003 Algo per signature. (At the time of writing, Ethereum requires a signature threshold of 2 out of 2 possible enabled attesters).

## Build

To install dependencies:

```bash
bun install
```

To compile contracts:

```bash
bunx tealscript src/*.algo.ts dist
```

## Test

Steps to test:

1. Deploy contracts
2. Fund accounts
	1. User needs FakeUSDC1 to burn
	2. Both Token Minters need their respective assets
3. Make sure a CCTP attestation service is running
4. Run `bun index.ts` to simulate a CCTP transfer
