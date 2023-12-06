import algosdk from 'algosdk';
 import keccak from 'keccak';

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
	const ASA_AVM1_ID                 = 1004;
	const ASA_AVM2_ID                 = 1005;
	const AVM1_MESSAGE_TRANSMITTER_ID = 1006;
	const AVM1_TOKEN_MESSENGER_ID     = 1009;
	const AVM1_TOKEN_MINTER_ID        = 1010;
	const AVM2_MESSAGE_TRANSMITTER_ID = 1011;
	const AVM2_TOKEN_MESSENGER_ID     = 1014;
	const AVM2_TOKEN_MINTER_ID        = 1015;

	// Create ATC
	let atc = new algosdk.AtomicTransactionComposer();
	const chain1Signer = new algosdk.makeBasicAccountTransactionSigner(account1);

	// Initialize ABI
	const TokenMessengerContract = new algosdk.ABIContract(tokenMessengerAbi);
	const MessageContract = new algosdk.ABIContract(messageTransmitterAbi);

	// Chain2 destination
	const mintRecipient = account2.addr;
	const AVM2_DESTINATION_DOMAIN = 9;

	// Amount that will be transferred
	let amount = 10000000; // 10.000000

	// Get Suggested Parameters for transactions
	const axfer_sp = await algod.getTransactionParams().do();
	axfer_sp.flatFee = true;
	axfer_sp.fee = 0;

	// TODO: Do I want to send direct to reserve rather than token minter?
	// Retrieve Asset reserve address
	//const ASA_RESERVE_ADDRESS = (await algod.getAssetByID(ASA_AVM1_ID).do())['params']['reserve'];
	// Retrieve TokenMinter address
	const TMINT_ADDRESS = algosdk.getApplicationAddress(AVM1_TOKEN_MINTER_ID);

	// STEP 1: Construct Asset Transfer (axfer) transaction
	let axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: account1.addr,
		to: TMINT_ADDRESS,
		assetIndex: ASA_AVM1_ID,
		amount: amount,
		suggestedParams: axfer_sp
	});
	console.log("STEP 1: DONE");

	// Get Suggested Parameters for transactions
	const appl_sp = await algod.getTransactionParams().do();
	appl_sp.flatFee = true;
	appl_sp.fee = 10000;

	// STEP 2: Burn ASSET
	// Simulate
	atc.addMethodCall({
		sender: account1.addr,
		appID: AVM1_TOKEN_MESSENGER_ID,
		method: TokenMessengerContract.getMethodByName('depositForBurn'),
		methodArgs: [
			{ txn: axfer, signer: chain1Signer },
			AVM2_DESTINATION_DOMAIN,
			algosdk.decodeAddress(mintRecipient).publicKey,
			ASA_AVM1_ID
		],
		suggestedParams: appl_sp,
		signer: chain1Signer
	});
	//const res = await atc.submit(algod);
	const simulate = new algosdk.modelsv2.SimulateRequest({
		execTraceConfig: new algosdk.modelsv2.SimulateTraceConfig({
			enable: false,
			stackChange: false
		}),
		allowUnnamedResources: true
	});
	let simres = await atc.simulate(algod, simulate);
	//console.log(simres.simulateResponse);

	// Build
	axfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		from: account1.addr,
		to: TMINT_ADDRESS,
		assetIndex: ASA_AVM1_ID,
		amount: amount,
		suggestedParams: axfer_sp
	});
	atc = new algosdk.AtomicTransactionComposer();
	atc.addMethodCall({
		sender: account1.addr,
		appID: AVM1_TOKEN_MESSENGER_ID,
		method: TokenMessengerContract.getMethodByName('depositForBurn'),
		methodArgs: [
			{ txn: axfer, signer: chain1Signer },
			AVM2_DESTINATION_DOMAIN,
			algosdk.decodeAddress(mintRecipient).publicKey,
			ASA_AVM1_ID
		],
		appAccounts: [
			...simres.simulateResponse.txnGroups[0].unnamedResourcesAccessed.accounts
		],
		appForeignApps: [
			...simres.simulateResponse.txnGroups[0].unnamedResourcesAccessed.apps
		],
		appForeignAssets: [
			simres.simulateResponse.txnGroups[0].unnamedResourcesAccessed.assetHoldings[0].asset
		],
		boxes: simres.simulateResponse.txnGroups[0].unnamedResourcesAccessed.boxes.map((b) => ({appIndex: b.app, name: b.name})),
		suggestedParams: appl_sp,
		signer: chain1Signer
	});
	//console.log(simres.simulateResponse.txnGroups[0].unnamedResourcesAccessed);
	//console.log(atc.transactions[1].txn);

	const subres = await atc.submit(algod);
	console.log(subres[1]);
	//console.log(atc.getStatus());
	//const simres2 = await atc.simulate(algod);
	//console.log(simres2);
	console.log("STEP 2: DONE");

	/*
	// STEP 3: Retrieve message bytes from logs
	const status = await algod.pendingTransactionInformation(subres[1]).do();
	let messageBody;
	let messageHash;
	const processStatus = (sts) => {
		if ('inner-txns' in sts) {
			for (const inner of sts['inner-txns']) {
				processStatus(inner);
			}
		}
		if ('logs' in sts) {
			for (const log of sts['logs']) {
				//console.log(log);
				const l = Buffer.from(log).toString('hex');
				//console.log(l);
				if (l.slice(0, 8) === '42a65f80') {
					// Convert the byte array to a hexadecimal string
					messageBody = l.slice(8);

					// Calculate the Keccak-256 hash using the keccak library
					const keccak256Hash = '0x' + keccak('keccak256').update(messageBody).digest('hex');

					console.log('Keccak-256 Hash:', keccak256Hash);
					messageHash = keccak256Hash;
				}
			}
		}
	};
	processStatus(status);
	console.log("STEP 3: DONE")

	// STEP 4: Fetch attestation signature
	let attestationResponse = {status: 'pending'};
	while(attestationResponse.status != 'complete') {
		const response = await fetch(`http://127.0.0.1:9000/attestation/${messageHash}`);
		attestationResponse = await response.json()
		await new Promise(r => setTimeout(r, 2000));
	}
	console.log(attestationResponse);
	const signature = attestationResponse.signature;
	console.log("STEP 4: DONE")
	*/

	// STEP 5: Using the message bytes and signature recieve the funds on destination chain and address
	// Get Suggested Parameters for transactions
	/*
	const step5_sp = await algod.getTransactionParams().do();
	step5_sp.flatFee = true;
	step5_sp.fee = 10000;

	console.log(messageBody);
	console.log(Buffer.from(messageBody, 'hex'));
	console.log(new Uint8Array(Buffer.from(messageBody, 'hex')));

	atc = new algosdk.AtomicTransactionComposer();
	atc.addMethodCall({
		sender: account1.addr,
		appID: AVM2_TOKEN_MESSENGER_ID,
		method: MessageContract.getMethodByName('receiveMessage'),
		methodArgs: [
			new Uint8Array(Buffer.from(messageBody, 'hex')),
			signature
		],
		suggestedParams: step5_sp,
		signer: chain1Signer
	});
	simres = atc.simulate(algod);
	console.log(simres);
	console.log("STEP 5: TODO")
	*/
};

main()
