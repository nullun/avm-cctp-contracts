#!/usr/bin/env bash

######################################################################
# * Deploy MessageTransmitter - Requires Self Attester (OptedIn)     #
# * Deploy TokenMessenger - Requires Local Message Transmitter       #
# * Deploy TokenMinter                                               #
#                                                                    #
# * MTRAN - Set Attester Manager         // Done on deploy           #
# * MTRAN - Enable Attester              // Done on deploy           #
# * MTRAN - Disable Attester (self)      // Not doing                #
# *                                                                  #
# * TMSGR - Set Local Minter                                         #
# * TMSGR - Add Remote Token Messengers                              #
#                                                                    #
# * TMINT - Add Local Token Messenger                                #
# * TMINT - Link Token Pair                                          #
# * TMINT - Set Max Burn Amount                                      #
######################################################################

set -uex

if [ -z "${ALGORAND_DATA+x}" ]; then
	echo "\$ALGORAND_DATA is not set"
	exit
fi


GOAL="goal"

ACCT1=$(${GOAL} account list | head -n 1 | tail -n 1 | awk '{print $3}' | tr -d '\r')
ACCT2=$(${GOAL} account list | head -n 2 | tail -n 1 | awk '{print $3}' | tr -d '\r')
ACCT3=$(${GOAL} account list | head -n 3 | tail -n 1 | awk '{print $3}' | tr -d '\r')

DOMAIN1=5
DOMAIN2=9

function int2bytes() {
	echo $(python -c "print('0x' + ($1).to_bytes($2, byteorder='big').hex())")
}

function addr2bytes() {
	python -c "import base64; print('[' + ','.join(map(str, bytearray(base64.b32decode('$1' + '='*6)[:32]))) + ']')"
}


# Create FakeUSDC1 and FakeUSDC2
FUSDC1=$(${GOAL} asset create \
	--creator ${ACCT1} \
	--name "FakeUSDC1" \
	--unitname "FUSDC1" \
	--total 1000000000000 \
	--decimals 6 \
	| grep 'Created asset with asset index' \
	| awk '{print $6}' \
	| tr -d '\r')

FUSDC2=$(${GOAL} asset create \
	--creator ${ACCT1} \
	--name "FakeUSDC2" \
	--unitname "FUSDC2" \
	--total 1000000000000 \
	--decimals 6 \
	| grep 'Created asset with asset index' \
	| awk '{print $6}' \
	| tr -d '\r')

# Deploy 1
MTRAN1_ID=$(${GOAL} app method \
	--create \
	--from ${ACCT1} \
	--method "deploy(uint32,uint64,uint32)void" \
	--approval-prog dist/MessageTransmitter.approval.teal \
	--clear-prog dist/MessageTransmitter.clear.teal \
	--extra-pages 1 \
	--global-byteslices 32 --global-ints 32 \
	--local-byteslices 0 --local-ints 16 \
	--arg ${DOMAIN1} \
	--arg 1024 \
	--arg 0 \
	| grep 'Created app with app index' \
	| awk '{print $6}' \
	| tr -d '\r')

# TODO: Pay MBR on enableAttester
MTRAN1_ADDR=$(goal app info \
	--app-id ${MTRAN1_ID} \
	| grep 'Application account' \
	| awk '{print $3}' \
	| tr -d '\r')
${GOAL} clerk send -a 1000000 -f ${ACCT1} -t ${MTRAN1_ADDR}
#arg1=$(addr2bytes ${ACCT1})
#arg1='[0,0,0,0,0,0,0,0,0,0,0,0,20,167,97,51,244,25,142,241,100,206,121,3,83,205,217,150,251,144,205,163]'
arg1='"AAAAAAAAAAAAAAAAYXvx3sRfIPQBHgkn5y7YGSPe7i4="'
${GOAL} app method \
	--app-id ${MTRAN1_ID} \
	--from ${ACCT1} \
	--method "enableAttester(byte[32])void" \
	--arg ${arg1} \
	--box str:enabledAttesters \

TMSGR1_ID=$(${GOAL} app method \
	--create \
	--from ${ACCT1} \
	--method "deploy(application,uint32)void" \
	--approval-prog dist/TokenMessenger.approval.teal \
	--clear-prog dist/TokenMessenger.clear.teal \
	--global-byteslices 16 --global-ints 48 \
	--local-byteslices 8 --local-ints 8 \
	--arg ${MTRAN1_ID} \
	--arg 0 \
	| grep 'Created app with app index' \
	| awk '{print $6}' \
	| tr -d '\r')

TMINT1_ID=$(${GOAL} app method \
	--create \
	--from ${ACCT1} \
	--method "deploy(address)void" \
	--approval-prog dist/TokenMinter.approval.teal \
	--clear-prog dist/TokenMinter.clear.teal \
	--global-byteslices 48 --global-ints 16 \
	--local-byteslices 8 --local-ints 8 \
	--arg \"${ACCT1}\" \
	| grep 'Created app with app index' \
	| awk '{print $6}' \
	| tr -d '\r')

# Deploy 2
MTRAN2_ID=$(${GOAL} app method \
	--create \
	--from ${ACCT1} \
	--method "deploy(uint32,uint64,uint32)void" \
	--approval-prog dist/MessageTransmitter.approval.teal \
	--clear-prog dist/MessageTransmitter.clear.teal \
	--extra-pages 1 \
	--global-byteslices 32 --global-ints 32 \
	--local-byteslices 0 --local-ints 16 \
	--arg ${DOMAIN2} \
	--arg 1024 \
	--arg 0 \
	| grep 'Created app with app index' \
	| awk '{print $6}' \
	| tr -d '\r')

# TODO: Pay MBR on enableAttester
MTRAN2_ADDR=$(goal app info \
	--app-id ${MTRAN2_ID} \
	| grep 'Application account' \
	| awk '{print $3}' \
	| tr -d '\r')
${GOAL} clerk send -a 1000000 -f ${ACCT1} -t ${MTRAN2_ADDR}
#arg1=$(addr2bytes ${ACCT1})
#arg1='[0,0,0,0,0,0,0,0,0,0,0,0,20,167,97,51,244,25,142,241,100,206,121,3,83,205,217,150,251,144,205,163]'
arg1='"AAAAAAAAAAAAAAAAYXvx3sRfIPQBHgkn5y7YGSPe7i4="'
${GOAL} app method \
	--app-id ${MTRAN2_ID} \
	--from ${ACCT1} \
	--method "enableAttester(byte[32])void" \
	--arg ${arg1} \
	--box str:enabledAttesters \

TMSGR2_ID=$(${GOAL} app method \
	--create \
	--from ${ACCT1} \
	--method "deploy(application,uint32)void" \
	--approval-prog dist/TokenMessenger.approval.teal \
	--clear-prog dist/TokenMessenger.clear.teal \
	--global-byteslices 16 --global-ints 48 \
	--local-byteslices 8 --local-ints 8 \
	--arg ${MTRAN2_ID} \
	--arg 0 \
	| grep 'Created app with app index' \
	| awk '{print $6}' \
	| tr -d '\r')

TMINT2_ID=$(${GOAL} app method \
	--create \
	--from ${ACCT1} \
	--method "deploy(address)void" \
	--approval-prog dist/TokenMinter.approval.teal \
	--clear-prog dist/TokenMinter.clear.teal \
	--global-byteslices 48 --global-ints 16 \
	--local-byteslices 8 --local-ints 8 \
	--arg \"${ACCT1}\" \
	| grep 'Created app with app index' \
	| awk '{print $6}' \
	| tr -d '\r')

# addLocalMinter
TMSGR1_ADDR=$(goal app info \
	--app-id ${TMSGR1_ID} \
	| grep 'Application account' \
	| awk '{print $3}' \
	| tr -d '\r')
${GOAL} clerk send -a 1000000 -f ${ACCT1} -t ${TMSGR1_ADDR}
${GOAL} app method \
	--app-id ${TMSGR1_ID} \
	--from ${ACCT1} \
	--method "addLocalMinter(application)void" \
	--arg ${TMINT1_ID}

TMSGR2_ADDR=$(goal app info \
	--app-id ${TMSGR2_ID} \
	| grep 'Application account' \
	| awk '{print $3}' \
	| tr -d '\r')
${GOAL} clerk send -a 1000000 -f ${ACCT1} -t ${TMSGR2_ADDR}
${GOAL} app method \
	--app-id ${TMSGR2_ID} \
	--from ${ACCT1} \
	--method "addLocalMinter(application)void" \
	--arg ${TMINT2_ID}

# addRemoteTokenMessenger
arg2=$(int2bytes ${TMSGR2_ID} 32 | xxd -r -p -c0 | base64)
box=$(int2bytes ${DOMAIN2} 4 | xxd -r -p -c0 | base64)
${GOAL} app method \
	--app-id ${TMSGR1_ID} \
	--from ${ACCT1} \
	--method "addRemoteTokenMessenger(uint32,byte[32])void" \
	--arg ${DOMAIN2} \
	--arg \"${arg2}\" \
	--box b64:${box}

arg2=$(int2bytes ${TMSGR1_ID} 32 | xxd -r -p -c0 | base64)
box=$(int2bytes ${DOMAIN1} 4 | xxd -r -p -c0 | base64)
${GOAL} app method \
	--app-id ${TMSGR2_ID} \
	--from ${ACCT1} \
	--method "addRemoteTokenMessenger(uint32,byte[32])void" \
	--arg ${DOMAIN1} \
	--arg \"${arg2}\" \
	--box b64:${box}

# addLocalTokenMessenger
${GOAL} app method \
	--app-id ${TMINT1_ID} \
	--from ${ACCT1} \
	--method "addLocalTokenMessenger(application)void" \
	--arg ${TMSGR1_ID}

${GOAL} app method \
	--app-id ${TMINT2_ID} \
	--from ${ACCT1} \
	--method "addLocalTokenMessenger(application)void" \
	--arg ${TMSGR2_ID}

# linkTokenPair
TMINT1_ADDR=$(goal app info \
	--app-id ${TMINT1_ID} \
	| grep 'Application account' \
	| awk '{print $3}' \
	| tr -d '\r')
${GOAL} clerk send -a 1000000 -f ${ACCT1} -t ${TMINT1_ADDR}
remoteToken1=$(int2bytes ${FUSDC2} 32 | xxd -r -p -c0 | base64)
${GOAL} app method \
	--app-id ${TMINT1_ID} \
	--from ${ACCT1} \
	--method "linkTokenPair(asset,uint32,byte[32])void" \
	--arg ${FUSDC1} \
	--arg 9 \
	--arg \"${remoteToken1}\" \
	--fee 2000 \
	-o simulate.txn
BOX=$(${GOAL} clerk simulate \
	--txfile simulate.txn \
	--allow-unnamed-resources \
	--allow-empty-signatures \
	| jq -r '.["txn-groups"][0]["unnamed-resources-accessed"]["boxes"][0]["name"]')
rm simulate.txn
${GOAL} app method \
	--app-id ${TMINT1_ID} \
	--from ${ACCT1} \
	--method "linkTokenPair(asset,uint32,byte[32])void" \
	--arg ${FUSDC1} \
	--arg 9 \
	--arg \"${remoteToken1}\" \
	--box b64:${BOX} \
	--fee 2000

TMINT2_ADDR=$(goal app info \
	--app-id ${TMINT2_ID} \
	| grep 'Application account' \
	| awk '{print $3}' \
	| tr -d '\r')
${GOAL} clerk send -a 1000000 -f ${ACCT1} -t ${TMINT2_ADDR}
remoteToken2=$(int2bytes ${FUSDC1} 32 | xxd -r -p -c0 | base64)
${GOAL} app method \
	--app-id ${TMINT2_ID} \
	--from ${ACCT1} \
	--method "linkTokenPair(asset,uint32,byte[32])void" \
	--arg ${FUSDC2} \
	--arg 5 \
	--arg \"${remoteToken2}\" \
	--fee 2000 \
	-o simulate.txn
BOX=$(${GOAL} clerk simulate \
	--txfile simulate.txn \
	--allow-unnamed-resources \
	--allow-empty-signatures \
	| jq -r '.["txn-groups"][0]["unnamed-resources-accessed"]["boxes"][0]["name"]')
rm simulate.txn
${GOAL} app method \
	--app-id ${TMINT2_ID} \
	--from ${ACCT1} \
	--method "linkTokenPair(asset,uint32,byte[32])void" \
	--arg ${FUSDC2} \
	--arg 5 \
	--arg \"${remoteToken2}\" \
	--box b64:${BOX} \
	--fee 2000

# setMaxBurnAmountPerMessage
${GOAL} app method \
	--app-id ${TMINT1_ID} \
	--from ${ACCT1} \
	--method "setMaxBurnAmountPerMessage(asset,uint64)void" \
	--arg ${FUSDC1} \
	--arg 100000000 \
	--box int:${FUSDC1}

${GOAL} app method \
	--app-id ${TMINT2_ID} \
	--from ${ACCT1} \
	--method "setMaxBurnAmountPerMessage(asset,uint64)void" \
	--arg ${FUSDC2} \
	--arg 100000000 \
	--box int:${FUSDC2}

