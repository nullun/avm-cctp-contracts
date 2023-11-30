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
	const kmd = new algosdk.Kmd('a'.repeat(64), 'http://127.0.0.1', 4002);

	const wallet_id = (await kmd.listWallets())['wallets'][0]['id'];
	const wallet_hnd = (await kmd.initWalletHandle(wallet_id, ""))['wallet_handle_token'];
	const addresses = (await kmd.listKeys(wallet_hnd))['addresses'];
	const accounts = [];
	for (const address of addresses) {
		const sk = (await kmd.exportKey(wallet_hnd, "", address))['private_key'];
		accounts.push({addr: address, sk: sk});
	}
	await kmd.releaseWalletHandle(wallet_hnd);

	// Setup Account 1 for signing
	const account1 = accounts[1];
	// Setup Account 2 for signing
	const account2 = accounts[2];

	// Existing application IDs
	const ASA_AVM1_ID                 = 1007;
	const ASA_AVM2_ID                 = 1008;
	const AVM1_MESSAGE_TRANSMITTER_ID = 1009;
	const AVM1_TOKEN_MESSENGER_ID     = 1010;
	const AVM1_TOKEN_MINTER_ID        = 1011;
	const AVM2_MESSAGE_TRANSMITTER_ID = 1012;
	const AVM2_TOKEN_MESSENGER_ID     = 1013;
	const AVM2_TOKEN_MINTER_ID        = 1014;

	// Create ATC
	const atc = new algosdk.AtomicTransactionComposer();
	const chain1Signer = new algosdk.makeBasicAccountTransactionSigner(account1);

	// Initialize ABI
	const chain1TokenMessengerContract = new algosdk.ABIContract(tokenMessengerAbi);
	const chain1MessageContract = new algosdk.ABIContract(messageTransmitterAbi);
	const chain2MessageContract = new algosdk.ABIContract(messageTransmitterAbi);

	// Chain2 destination
	const mintRecipient = account2.addr;
	const AVM2_DESTINATION_DOMAIN = 9;

	// Amount that will be transferred
	let amount = 10000000; // 10.000000

	// Get Suggested Parameters for transactions
	const sp = await algod.getTransactionParams().do();

	// Retrieve Asset reserve address
	const ASA_RESERVE_ADDRESS = (await algod.getAssetByID(ASA_AVM1_ID).do())['params']['reserve'];

	// STEP 1: Construct Asset Transfer (axfer) transaction
	const axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: account1.addr,
		to: ASA_RESERVE_ADDRESS,
		assetIndex: ASA_AVM1_ID,
		amount: amount,
		suggestedParams: sp
	});
	console.log("STEP 1: DONE");

	// STEP 2: Burn ASSET
	atc.addMethodCall({
		sender: account1.addr,
		appID: AVM1_TOKEN_MESSENGER_ID,
		method: chain1TokenMessengerContract.getMethodByName('depositForBurn'),
		methodArgs: [
			{ txn: axfer, signer: chain1Signer },
			AVM2_DESTINATION_DOMAIN,
			algosdk.decodeAddress(mintRecipient).publicKey,
			ASA_AVM1_ID
		],
		suggestedParams: sp,
		signer: chain1Signer
	});
	const res = await atc.submit(algod);
	//const res = await atc.simulate(algod);
	console.log(res);
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
