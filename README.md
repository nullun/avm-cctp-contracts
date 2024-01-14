# avm-cctp-contracts

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