import { Contract } from '@algorandfoundation/tealscript';

type Message = {
	_msgVersion: uint<32>,
	_msgSourceDomain: uint<32>,
	_msgDestinationDomain: uint<32>,
	_msgNonce: uint<64>,
	_msgSender: byte[32],
	_msgRecipient: byte[32],
	_msgDestinationCaller: byte[32],
	_msgRawBody: bytes
};

type BurnMessage = {
	_version: uint<32>,
	_burnToken: byte[32],
	_mintRecipient: byte[32],
	_amount: uint<256>,
	_messageSender: byte[32]
};

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
	maxMessageBodySize = GlobalStateKey<uint<64>>();

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
	// ===== Ownable =====
	/**
	 * @dev Transfers ownership of the application to a new account (`newOwner`).
	 * Internal function without access restriction.
	 */
	private _transferOwnership(newOwner: Address): void {
		const oldOwner: Address = this.owner.value;
		this.owner.value = newOwner;
		// TODO: Emit Event OwnershipTransferred(oldOwner, newOwner);
	}

	// ===== Attestable =====
	/**
	 * @dev Sets a new attester manager address
	 * @param _newAttesterManager attester manager address to set
	 */
	private _setAttesterManager(_newAttesterManager: Address): void {
		this.attesterManager.value = _newAttesterManager;
	}

	// ===== MessageTransmitter =====
	/**
	 * Reserve and increment next available nonce
	 * @return nonce reserved
	 */
	private _reserveAndIncrementNonce(): uint<64> {
		const _nonceReserved: uint<64> = this.nextAvailableNonce.value;
		this.nextAvailableNonce.value = this.nextAvailableNonce.value + 1;

		return _nonceReserved;
	}

	/**
	 * @notice Send the message to the destination domain and recipient. If `_destinationCaller` is not equal to bytes32(0),
	 * the message can only be received on the destination chain when called by `_destinationCaller`.
	 * @dev Format the message and emit `MessageSent` event with message information.
	 * @param _destinationDomain Domain of destination chain
	 * @param _recipient Address of message recipient on destination domain as bytes32
	 * @param _destinationCaller caller on the destination domain, as bytes32
	 * @param _sender message sender, as bytes32
	 * @param _nonce nonce reserved for message
	 * @param _messageBody Raw bytes content of message
	 */
	private _sendMessage(
		_destinationDomain: uint<32>,
		_recipient: byte[32],
		_destinationCaller: byte[32],
		_sender: byte[32],
		_nonce: uint<64>,
		_messageBody: bytes
	): void {
		assert(_messageBody.length <= this.maxMessageBodySize.value);
		assert(_recipient != globals.zeroAddress as unknown as byte[32]);

		// serialize message
		const _message: Message = {
			_msgVersion: this.version.value,
			_msgSourceDomain: this.localDomain.value,
			_msgDestinationDomain: _destinationDomain,
			_msgNonce: _nonce,
			_msgSender: _sender,
			_msgRecipient: _recipient,
			_msgDestinationCaller: _destinationCaller,
			_msgRawBody: _messageBody
		};

		// TODO: Emit Event MessageSent(_message);
	}

	/**
	 * @dev The message body is dynamically-sized to support custom message body
	 * formats. Other fields must be fixed-size to avoid hash collisions.
	 * Each other input value has an explicit type to guarantee fixed-size.
	 * Padding: uintNN fields are left-padded, and bytesNN fields are right-padded.
	 *
	 * Field                 Bytes      Type       Index
	 * version               4          uint32     0
	 * sourceDomain          4          uint32     4
	 * destinationDomain     4          uint32     8
	 * nonce                 8          uint64     12
	 * sender                32         bytes32    20
	 * recipient             32         bytes32    52
	 * destinationCaller     32         bytes32    84
	 * messageBody           dynamic    bytes      116
	 *
	 * @notice Reverts if message is incorrect length
	 * @param _message The message
	 */
	private _validateMessageFormat(_message: Message): void {
		// FIX: Get length of Message? Or can we remove this, since it's a Message type and is already validated
		//assert(_message as bytes.length >= 116);
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
		assert(newSignatureThreshold <= this.numAttesters.value);
		assert(newSignatureThreshold != this.signatureThreshold.value);

		const _oldSignatureThreshold: uint<64> = this.signatureThreshold.value;
		this.signatureThreshold.value = newSignatureThreshold;
		// TODO: Emit Event SignatureThresholdUpdated(_oldSignatureThreshold, signatureThreshold);
	}

	// ===== MessageTransmitter =====
	/**
	 * @notice Send the message to the destination domain and recipient
	 * @dev Increment nonce, format the message, and emit `MessageSent` event with message information.
	 * @param destinationDomain Domain of destination chain
	 * @param recipient Address of message recipient on destination chain as bytes32
	 * @param messageBody Raw bytes content of message
	 * @return nonce reserved by message
	 */
	sendMessage(
		destinationDomain: uint<32>,
		recipient: byte[32],
		messageBody: bytes
	): uint<64> {
		// TODO: WhenNotPaused
		const _nonce: uint<64> = this._reserveAndIncrementNonce();
		const _messageSender: byte[32] = this.txn.sender as unknown as byte[32];

		this._sendMessage(
		    destinationDomain,
		    recipient,
		    globals.zeroAddress as unknown as byte[32],
		    _messageSender,
		    _nonce,
		    messageBody
		);

		return _nonce;
	}

	/**
	 * @notice Replace a message with a new message body and/or destination caller.
	 * @dev The `originalAttestation` must be a valid attestation of `originalMessage`.
	 * Reverts if msg.sender does not match sender of original message, or if the source domain of the original message
	 * does not match this MessageTransmitter's local domain.
	 * @param originalMessage original message to replace
	 * @param originalAttestation attestation of `originalMessage`
	 * @param newMessageBody new message body of replaced message
	 * @param newDestinationCaller the new destination caller, which may be the
	 * same as the original destination caller, a new destination caller, or an empty
	 * destination caller (bytes32(0), indicating that any destination caller is valid.)
	 */
	replaceMessage(
		originalMessage: Message,
		originalAttestation: bytes,
		newMessageBody: bytes,
		newDestinationCaller: byte[32]
	): void {
		// TODO: WhenNotPaused
		// TODO: Validate each signature in the attestation
		// this._verifyAttestationSignatures(originalMessage, originalAttestation);

		// Validate message format
		this._validateMessageFormat(originalMessage);

		// Validate message sender
		const _sender: byte[32] = originalMessage._msgSender;
		assert(this.txn.sender as unknown as byte[32] === _sender);

		// Validate source domain
		const _sourceDomain: uint<32> = originalMessage._msgSourceDomain;
		assert(_sourceDomain === this.localDomain.value);

		const _destinationDomain: uint<32> = originalMessage._msgDestinationDomain;
		const _recipient: byte[32] = originalMessage._msgRecipient;
		const _nonce: uint<64> = originalMessage._msgNonce;

		this._sendMessage(
		    _destinationDomain,
		    _recipient,
		    newDestinationCaller,
		    _sender,
		    _nonce,
		    newMessageBody
		);
	}

	/**
	 * @notice Send the message to the destination domain and recipient, for a specified `destinationCaller` on the
	 * destination domain.
	 * @dev Increment nonce, format the message, and emit `MessageSent` event with message information.
	 * WARNING: if the `destinationCaller` does not represent a valid address, then it will not be possible
	 * to broadcast the message on the destination domain. This is an advanced feature, and the standard
	 * sendMessage() should be preferred for use cases where a specific destination caller is not required.
	 * @param destinationDomain Domain of destination chain
	 * @param recipient Address of message recipient on destination domain as bytes32
	 * @param destinationCaller caller on the destination domain, as bytes32
	 * @param messageBody Raw bytes content of message
	 * @return nonce reserved by message
	 */
	sendMessageWithCaller(
		destinationDomain: uint<32>,
		recipient: byte[32],
		destinationCaller: byte[32],
		messageBody: bytes
	): uint<64> {
		// TODO: WhenNotPaused
		assert(destinationCaller != globals.zeroAddress as unknown as byte[32]);

	    const _nonce: uint<64> = this._reserveAndIncrementNonce();
	    const _messageSender: byte[32] = this.txn.sender as unknown as byte[32];

	    this._sendMessage(
	        destinationDomain,
	        recipient,
	        destinationCaller,
	        _messageSender,
	        _nonce,
	        messageBody
	    );

	    return _nonce;
	}

	/**
	 * @notice Receive a message. Messages with a given nonce
	 * can only be broadcast once for a (sourceDomain, destinationDomain)
	 * pair. The message body of a valid message is passed to the
	 * specified recipient for further processing.
	 *
	 * @dev Attestation format:
	 * A valid attestation is the concatenated 65-byte signature(s) of exactly
	 * `thresholdSignature` signatures, in increasing order of attester address.
	 * ***If the attester addresses recovered from signatures are not in
	 * increasing order, signature verification will fail.***
	 * If incorrect number of signatures or duplicate signatures are supplied,
	 * signature verification will fail.
	 *
	 * Message format:
	 * Field                 Bytes      Type       Index
	 * version               4          uint32     0
	 * sourceDomain          4          uint32     4
	 * destinationDomain     4          uint32     8
	 * nonce                 8          uint64     12
	 * sender                32         bytes32    20
	 * recipient             32         bytes32    52
	 * destinationCaller     32         bytes32    84
	 * messageBody           dynamic    bytes      116
	 *
	 * @param message Message bytes
	 * @param attestation Concatenated 65-byte signature(s) of `message`, in increasing order
	 * of the attester address recovered from signatures.
	 * @return success bool, true if successful
	 */
	receiveMessage(
		message: Message,
		attestation: bytes
	): boolean {
		// TODO: WhenNotPaused
	    // TODO: Validate each signature in the attestation
	    // this._verifyAttestationSignatures(message, attestation);

	    // Validate message format
	    this._validateMessageFormat(message);

	    // Validate domain
		assert(message._msgDestinationDomain === this.localDomain.value);

	    // Validate destination caller
		if (message._msgDestinationCaller != globals.zeroAddress as unknown as byte[32]) {
			assert(message._msgDestinationCaller === this.txn.sender as unknown as byte[32]);
		}

	    // Validate version
		assert(message._msgVersion === this.version.value);

		// If SourceDomainNonceBox doesn't exist, create it
		const boxNumber: uint<64> = message._msgNonce / 262144;
		const box: SourceDomainNonceBox = {
			sourceDomain: message._msgSourceDomain,
			boxNumber: boxNumber
		};
		if (!this.usedNonces(box).exists) {
			this.usedNonces(box).create(32768);
		}

		// Validate nonce is available
		const offset: uint<64> = message._msgNonce / 8;
		const flagPosition: uint<64> = message._msgNonce % 8;
		const nonceByte: bytes = this.usedNonces(box).extract(offset, 1) as bytes;
		const nonceUsed: boolean = getbit(nonceByte, flagPosition) as boolean;
		assert(!nonceUsed);

	    // Mark nonce used
		const updatedNonceByte: bytes = setbit(nonceByte, flagPosition, 1) as bytes;
		this.usedNonces(box).replace(offset, updatedNonceByte);

	    // Handle receive message
		const handled: boolean = sendMethodCall<[uint<32>, byte[32], bytes], boolean>({
			applicationID: Application.fromID(btoi(message._msgRecipient)),
			name: 'handleReceiveMessage',
			methodArgs: [
				message._msgSourceDomain,
				message._msgSender,
				message._msgRawBody
			]
		});
		// TODO: If the itxn fails, the whole thing fails, so no need to check?
		assert(handled);

		/*
	    // TODO: Emit Event MessageReceived(
			this.txn.sender,
			message._msgSourceDomain,
			message._msgNonce,
			message._msgSender,
			message._msgRawBody
		);
		*/

	    return true;
	}

	/**
	 * @notice Sets the max message body size
	 * @dev This value should not be reduced without good reason,
	 * to avoid impacting users who rely on large messages.
	 * @param newMaxMessageBodySize new max message body size, in bytes
	 */
	setMaxMessageBodySize(
		newMaxMessageBodySize: uint<64>
	): void {
		this.onlyOwner();

		this.maxMessageBodySize.value = newMaxMessageBodySize;
		// TODO: Emit Event MaxMessageBodySizeUpdated(maxMessageBodySize);
	}


	// ============ Constructor ============
	@allow.create('NoOp')
	deploy(
		_localDomain: uint<32>,
		_attester: Address,
		_maxMessageBodySize: uint<64>,
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
