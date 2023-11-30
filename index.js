import algosdk from 'algosdk';

/**
 * TODO:
 *  + Deployment script
 *  + Use consistent application and asset IDs
 *  + Use accounts with balances
 *  + Implement step 3 with a decent EventLogger parsing
 *  + Implement step 5 (same chain different deployments for now)
 */

const messageTransmitterAbi = require('./dist/MessageTransmitter.arc4.json');
const tokenMessengerAbi = require('./dist/TokenMessenger.arc4.json');
const tokenMinterAbi = require('./dist/TokenMinter.arc4.json');

const main = async() => {
	const algod = new algosdk.Algodv2('a'.repeat(64), 'http://127.0.0.1', 4001);

	// Setup Account 1 for signing
	const account1 = algosdk.generateAccount();
	// Setup Account 2 for signing
	const account2 = algosdk.generateAccount();

	// Existing application IDs
	const CHAIN1_TOKEN_MESSENGER_ID = 1010;
	const ASSET_CHAIN1_ID = 1006;
	const CHAIN1_MESSAGE_CONTRACT_ID = 1020;
	const CHAIN2_MESSAGE_TRANSMITTER_ID = 1030;

	// Create ATC
	const atc = new algosdk.AtomicTransactionComposer();
	const chain1Signer = new algosdk.makeBasicAccountTransactionSigner(account1);

	// Initialize ABI
	const chain1TokenMessengerContract = new algosdk.ABIContract(tokenMessengerAbi);
	const chain1MessageContract = new algosdk.ABIContract(messageTransmitterAbi);
	const chain2MessageContract = new algosdk.ABIContract(messageTransmitterAbi);

	// Chain2 destination
	const mintRecipient = account2.addr;
	const CHAIN2_DESTINATION_DOMAIN = 9;

	// Amount that will be transferred
	let amount = 10000000; // 10.000000

	// Get Suggested Parameters for transactions
	const sp = await algod.getTransactionParams().do();

	// Retrieve Asset reserve address
	const ASSET_RESERVE_ADDRESS = (await algod.getAssetByID(ASSET_CHAIN1_ID).do())['params']['reserve'];

	// STEP 1: Construct Asset Transfer (axfer) transaction
	const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: account1.addr,
		to: ASSET_RESERVE_ADDRESS,
		assetIndex: ASSET_CHAIN1_ID,
		amount: amount,
		suggestedParams: sp
	});
	console.log("STEP 1: DONE");

	// STEP 2: Burn ASSET
	atc.addMethodCall({
		sender: account1.addr,
		appID: CHAIN1_TOKEN_MESSENGER_ID,
		method: chain1TokenMessengerContract.getMethodByName('depositForBurn'),
		methodArgs: [
			{ txn: axfer, signer: chain1Signer },
			CHAIN2_DESTINATION_DOMAIN,
			algosdk.decodeAddress(mintRecipient).publicKey,
			ASSET_CHAIN1_ID
		],
		suggestedParams: sp,
		signer: chain1Signer
	});
	//const res = await atc.submit();
	//const sim = await atc.simulate(algod);
	//console.log(sim);
	console.log("STEP 2: DONE");

	// STEP 3: Retrieve message bytes from logs
	console.log("STEP 3: TODO")

	// STEP 4: Fetch attestation signature
	/*
	let attestationResponse = {status: 'pending'};
	while(attestationResponse.status != 'complete') {
		const response = await fetch(`https://iris-api-sandbox.circle.com/attestations/${messageHash}`);
		attestationResponse = await response.json()
		await new Promise(r => setTimeout(r, 2000));
	}
	*/
	console.log("STEP 4: DONE")

	// STEP 5: Using the message bytes and signature recieve the funds on destination chain and address
	console.log("STEP 5: TODO")
};

main()
