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

## Useful transactions

depositForBurn

```bash
goal asset send \
    --assetid $ASSET1 \
    --from $YOUR_ADDRESS \
    --to $TOKEN_MINTER_ADDR \
    --amount 1000000 \
    -o burn.txn

goal app method \
    --app-id $TOKEN_MESSENGER \
    --from $YOUR_ADDRESS \
    --method "depositForBurn(axfer,uint32,byte[32],asset)uint64" \
    --arg burn.txn \
    --arg 9                                                # Destination Domain \
    --arg '"i4C45SLboL5UDstqo37uKS1WzqqtOSlp+3COLk1LcEo="' # Mint Recipient \
    --arg $ASSET1                                          # Just the ID, not a reference \
    --box b64:AAAACQ==                                     # Destination Domain (lookup remote token messenger) \
    --foreign-app $TOKEN_MINTER                            # TokenMinter AppID \
    --fee 4000 \
    --box $TOKEN_MINTER,b64:AAAAAAAAA+w=                   # TokenMinter AssetID (for checking burn limit) \
    --app-account $ASSET1_RESERVE_ADDRESS \
    --foreign-app $MessageTransmitter
```

sign message

Please first open `sign_message.ts` and add the attester private key and log from the depositForBurn.

```bash
bun sign_message.ts
```

receiveMessage (WORK IN PROGRESS)

```bash
goal clerk send \
    --from $YOUR_ADDRESS \
    --to $MESSAGE_TRANSMITTER_ADDR \
    --amount 7300 \
    -o mbr.txn

goal app method \
    --app-id $MESSAGE_TRANSMITTER \
    --from $YOUR_ADDRESS \
    --method "receiveMessage(pay,byte[],byte[])bool" \
    --arg mbr.txn \
    --arg '"AAAAAAAAAAUAAAAJAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8QAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP2AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+yLgLjlItugvlQOy2qjfu4pLVbOqq05KWn7cI4uTUtwSgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD0JAi4C45SLboL5UDstqo37uKS1WzqqtOSlp+3COLk1LcEo="' \
    --arg '"32E8j2Rk+GJBIlYh7mm2uyQj3w77I7HOLXednfvrgTZHL4BK85nwurDyYsKRXDV5eRIXhNTNRiWtZ+R548Sb7hs="' \
    --fee 12000 \
    --box str:enabledAttesters \
    --box b64:AAAABQAAAAAAAAAB \
    --foreign-app $TOKEN_MESSENGER \
    --box 1014,b64:AAAABQ== \
    --foreign-app $TOKEN_MINTER \
    --box 1015,b64:7IC93Vlr7wCjQrIaXKmNuUycqU+f8OdQs3EZGzxuoNw= \
    --foreign-asset $ASSET2
```
