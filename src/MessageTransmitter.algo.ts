import { Contract } from '@algorandfoundation/tealscript';

type SourceDomainNonceBox = {
	sourceDomain: uint<32>;
	boxNumber: uint<64>;
};

class MessageTransmitter extends Contract {

	// ============ State Variables ============
	// ===== Ownable =====
	// Owner of the application
	owner = GlobalStateKey<Address>();

	// ===== Attestable =====
	// number of signatures from distinct attesters required for a message to be received (m in m/n multisig)
	signatureThreshold = GlobalStateKey<uint<64>>();

	// Attester Manager of the application
	attesterManager = GlobalStateKey<Address>();

	numAttesters = GlobalStateKey<uint<64>>();

	// Attester Role
	enabledAttester = LocalStateKey<boolean>({ key: 'attester' });

	// ===== MessageTransmitter =====
    // Domain of chain on which the application is deployed
    localDomain = GlobalStateKey<uint<32>>();

    // Message Format version
	version = GlobalStateKey<uint<32>>();

    // Maximum size of message body, in bytes.
    // This value is set by owner.
	maxMessageBodySize = GlobalStateKey<uint<256>>();

    // Next available nonce from this source domain
	nextAvailableNonce = GlobalStateKey<uint<64>>();

	// Stores 262,144 nonce flags per box (0 if unused, 1 if used)
	// nonce / 262144 = box number. nonce / 8 = offset. nonce % 8 = flag position.
	usedNonces = BoxMap<SourceDomainNonceBox, StaticArray<boolean, 32768>>();


	// ============ Access Checks ============
	/**
	 * @dev Throws if called by any account other than the owner.
	 */
	private onlyOwner(): void {
		assert(this.txn.sender == this.owner.value);
	}

	/**
	 * @dev Throws if called by any account other than the attester manager.
	 */
	private onlyAttesterManager(): void {
		assert(this.txn.sender === this.attesterManager.value);
	}


	// ============ Internal Utils ============
	/**
	 * @dev Transfers ownership of the application to a new account (`newOwner`).
	 * Internal function without access restriction.
	 */
	private _transferOwnership(newOwner: Address): void {
		const oldOwner: Address = this.owner.value;
		this.owner.value = newOwner;
		// TODO: Emit Event OwnershipTransferred(oldOwner, newOwner);
	}

	/**
	 * @dev Sets a new attester manager address
	 * @param _newAttesterManager attester manager address to set
	 */
	private _setAttesterManager(_newAttesterManager: Address): void {
		this.attesterManager.value = _newAttesterManager;
	}


	// ============ External Functions  ============
	// ===== Ownable =====
    /**
     * @dev Transfers ownership of the application to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    transferOwnership(newOwner: Address): void {
		this.onlyOwner();

		assert(newOwner != globals.zeroAddress);

        this._transferOwnership(newOwner);
    }

	// ===== Attestable =====
    /**
     * @notice Enables an attester
     * @dev Only callable by attesterManager. New attester must be opted in and currently disabled.
     * @param newAttester attester to enable
     */
	enableAttester(newAttester: Account): void {
		this.onlyAttesterManager();

		assert(!this.enabledAttester(newAttester).exists);

		this.enabledAttester(newAttester).value = true;
		this.numAttesters.value = this.numAttesters.value + 1;
	}

	/**
	 * FIX: onlyOwner or onlyAttesterManager?
	 * @dev Allows the current attester manager to transfer control of the application to a newAttesterManager.
	 * @param newAttesterManager The address to update attester manager to.
	 */
	updateAttesterManager(newAttesterManager: Address): void {
		this.onlyOwner()

		assert(newAttesterManager != globals.zeroAddress);

		const _oldAttesterManager: Address = this.attesterManager.value;
		this._setAttesterManager(newAttesterManager);
		// TODO: Emit Event AttesterManagerUpdated(_oldAttesterManager, newAttesterManager);
	}

	/**
	 * @notice Disables an attester
	 * @dev Only callable by attesterManager. Disabling the attester is not allowed if there is only one attester
	 * enabled, or if it would cause the number of enabled attesters to become less than signatureThreshold.
	 * (Attester must be currently enabled.)
	 * @param attester attester to disable
	 */
	disableAttester(attester: Account): void {
		this.onlyAttesterManager();

	    assert(this.numAttesters.value > 1);
	    assert(this.numAttesters.value > this.signatureThreshold.value);
		assert(this.enabledAttester(attester).exists);

	    this.enabledAttester(attester).delete();
	}

	/**
	 * @notice Sets the threshold of signatures required to attest to a message.
     * (This is the m in m/n multisig.)
	 * @dev new signature threshold must be nonzero, and must not exceed number
     * of enabled attesters.
	 * @param newSignatureThreshold new signature threshold
	 */
	setSignatureThreshold(newSignatureThreshold: uint<64>): void {
		this.onlyAttesterManager();

		assert(newSignatureThreshold);

		// New signature threshold cannot exceed the number of enabled attesters
		assert(newSignatureThreshold <= this.numAttesters.value);

		assert(newSignatureThreshold != this.signatureThreshold.value);

		this.signatureThreshold.value = newSignatureThreshold;
	}

	/**
	 * @return nonce  reserved by message
	 */
	sendMessage(): uint<64> {
		return 42;
	}

	replaceMessage(): void {}

	/**
	 * @return nonce  reserved by message
	 */
	sendMessageWithCaller(): uint<64> {
		return 42;
	}

	/**
	 * @return success bool, true if successful
	 */
	receiveMessage(): boolean {
		return true;
	}

	setMaxMessageBodySize(): void {}

	// ===== Internal Utils =====

	/**
	 * @notice Send the message to the destination domain and recipient. If `_destinationCaller` is not equal to bytes32(0),
     * the message can only be received on the destination chain when called by `_destinationCaller`.
	 */
	private _sendMessage(): void {}


	// ============ Constructor ============
	@allow.create('NoOp')
	deploy(
		_localDomain: uint<32>,
		_attester: Address,
		_maxMessageBodySize: uint<256>,
		_version: uint<32>
	): void {
		this.localDomain.value = _localDomain;
		this.maxMessageBodySize.value = _maxMessageBodySize;
		this.version.value = _version;

		// Set Ownable
		this._transferOwnership(this.txn.sender);

		// Set Attestable
		this._setAttesterManager(this.txn.sender);
		this.signatureThreshold.value = 1;
		this.enableAttester(_attester);
	}
}
