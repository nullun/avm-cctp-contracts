import { Contract } from '@algorandfoundation/tealscript';

class TokenMinter extends Contract {
	@allow.create('NoOp')
	deploy(): void {}

	// ===== External =====

	mint(): Address {
		return this.txn.sender
	}

	burn(): void {}

	addLocalTokenMessenger(): void {}

	removeLocalTokenMessenger(): void {}

	setTokenController(): void {}

	getLocalToken(): uint64 {
		return 42;
	}

	// ===== Internal Utils =====

	/**
	 * @returns True if the message sender is the registered local TokenMessenger
	 */
	_isLocalTokenMessenger(): boolean {
		return true;
	}
}
