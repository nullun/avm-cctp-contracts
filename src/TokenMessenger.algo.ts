import { Contract } from '@algorandfoundation/tealscript';

class TokenMessenger extends Contract {
	@allow.create('NoOp')
	deploy(): void {}

	// ===== External Functions =====

	/**
	 * @return _nonce unique nonce reserved by message
	 */
	depositForBurn(): uint<64> {
		return 0;
	}

	/**
	 * @return _nonce unique nonce reserved by message
	 */
	depositForBurnWithCaller(): uint<64> {
		return 0;
	}

	replaceDepositForBurn(): void {}

	/**
	 * @return success bool, true if successful
	 */
	handleReceiveMessage(): boolean {
		return true
	}

	addRemoteTokenMessenger(): void {}

	removeRemoteTokenMessenger(): void {}

	addLocalMinter(): void {}

	removeLocalMinter(): void {}


	// ===== Internal Utils =====

	/**
	 * @return nonce unique nonce reserved by message
	 */
	private _depositForBurn(): uint<64> {
		return 10;
	}

	private _sendDepositForBurnMessage(): uint<64> {
		return 10;
	}

	private _mintAndWithdraw(): void {}

	private _getRemoteTokenMessenger(): byte[32] {
		return bzero(32) as unknown as byte[32];
	}

	private _getLocalMinter(): void {}

	private _isRemoteTokenMessenger(): boolean {
		return true;
	}

	private _isLocalMessageTransmitter(): boolean {
		return true;
	}
}
