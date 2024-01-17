import { Contract } from '@algorandfoundation/tealscript';
import type { Message } from './messages/Message.algo';
import { Pausable } from './roles/Pausable.algo';
import { Attestable } from './roles/Attestable.algo';

type SourceDomainNonceBox = {
	sourceDomain: uint<32>;
	nonce: uint<64>;
};

class MessageTransmitter extends Contract.extend(Pausable, Attestable) {
	programVersion = 10;

	// ============ State Variables ============
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
	usedNonces = BoxMap<SourceDomainNonceBox, byte>({ allowPotentialCollisions: true });


	// ============ Events ============
	// ===== MessageTransmitter =====
	/**
	 * @notice Emitted when a new message is dispatched
	 * @param message Raw bytes of message
	 */
	// MessageSent(byte[])
	MessageSent = new EventLogger<{
		/* Message */
		message: bytes
	}>();

	/**
	 * @notice Emitted when a new message is received
	 * @param caller Caller (this.txn.sender) on destination domain
	 * @param sourceDomain The source domain this message originated from
	 * @param nonce The nonce unique to this message
	 * @param sender The sender of this message
	 * @param messageBody message body bytes
	 */
	// MessageReceived(address,uint32,uint64,bytes32,byte[])
	MessageReceived = new EventLogger<{
		caller: Address,
		sourceDomain: uint<32>,
		nonce: uint<64>,
		sender: bytes32,
		messageBody: bytes
	}>();

	/**
	 * @notice Emitted when max message body size is updated
	 * @param newMaxMessageBodySize new maximum message body size, in bytes
	 */
	// MaxMessageBodySizeUpdated(uint64)
	MaxMessageBodySizeUpdated = new EventLogger<{
		newMaxMessageBodySize: uint<64>
	}>();


	// ============ Internal Utils ============
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
		_recipient: bytes32,
		_destinationCaller: bytes32,
		_sender: bytes32,
		_nonce: uint<64>,
		_messageBody: bytes
	): void {
		assert(_messageBody.length <= this.maxMessageBodySize.value);
		assert(_recipient != bzero(32) as bytes32);

		// serialize message
		const _message: Message = {
			_msgVersion: this.version.value,
			_msgSourceDomain: this.localDomain.value,
			_msgDestinationDomain: _destinationDomain,
			_msgNonce: _nonce,
			_msgSender: _sender,
			_msgRecipient: _recipient,
			_msgDestinationCaller: _destinationCaller,
			//_msgRawBody: _messageBody
		};

		this.MessageSent.log({ message: rawBytes(_message) + _messageBody });
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
		assert(rawBytes(_message).length >= 116);
	}


	// ============ External Functions  ============
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
		recipient: bytes32,
		messageBody: bytes
	): uint<64> {
		this.whenNotPaused();

		const _nonce = this._reserveAndIncrementNonce();
		const _messageSender = bzero(24) + itob(globals.callerApplicationID);

		this._sendMessage(
			destinationDomain,
			recipient,
			bzero(32) as bytes32,
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
		originalMessage: bytes,
		originalAttestation: bytes,
		newMessageBody: bytes,
		newDestinationCaller: bytes32
	): void {
		this.whenNotPaused();

		this._verifyAttestationSignatures(originalMessage, originalAttestation);

		const message_start = extract_uint16(originalMessage, 0);
		const message_size = 116;
		const _message = castBytes<Message>(substring3(originalMessage, message_start, message_start + message_size));

		// Validate message format
		this._validateMessageFormat(_message);

		// Validate message sender
		// FIX: What?
		const _sender = _message._msgSender;
		assert(<bytes32>(bzero(24) + itob(globals.callerApplicationID)) === _sender);

		// Validate source domain
		const _sourceDomain = _message._msgSourceDomain;
		assert(_sourceDomain === this.localDomain.value);

		const _destinationDomain = _message._msgDestinationDomain;
		const _recipient = _message._msgRecipient;
		const _nonce = _message._msgNonce;

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
		recipient: bytes32,
		destinationCaller: bytes32,
		messageBody: bytes
	): uint<64> {
		this.whenNotPaused();

		assert(destinationCaller != bzero(32) as bytes32);

		const _nonce = this._reserveAndIncrementNonce();
		const _messageSender = bzero(24) + itob(globals.callerApplicationID);

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
		fee: PayTxn,
		message: bytes,
		attestation: bytes
	): boolean {
		this.whenNotPaused();

		this._verifyAttestationSignatures(message, attestation);

		verifyPayTxn(fee, {
			receiver: this.app.address,
			amount: (2500) + (400 * (12)),
		});

		const message_start = extract_uint16(message, 0);
		const message_size = 116;
		const _message = castBytes<Message>(substring3(message, message_start, message_start + message_size));

		const msg_body_start = message_start + message_size;
		const msg_body_size = message.length - msg_body_start;
		const _messageBody = substring3(message, msg_body_start, msg_body_start + msg_body_size);

		/*
		const message_body_start = extract_uint16(message, message_start + 116) + 4;
		const message_body_size = extract_uint16(message, message_start + 118);
		const message_body = substring3(message, message_body_start, message_body_start + message_body_size);

		_message._msgRawBody = message_body;
		*/

		// Validate message format
		this._validateMessageFormat(_message);

		// Validate domain
		assert(_message._msgDestinationDomain === this.localDomain.value);

		// Validate destination caller
		if (_message._msgDestinationCaller != bzero(32) as bytes32) {
			assert(_message._msgDestinationCaller === rawBytes(this.txn.sender) as bytes32);
		}

		// Validate version
		assert(_message._msgVersion === this.version.value);

		// Store each Source Domain + Nonce as a key to a box.
		// The box contains nothing, but if it exists, then it's been used.
		// The cost for this is (2500) + (400 * (12)) = 7,300 uAlgo
		const box: SourceDomainNonceBox = {
			sourceDomain: _message._msgSourceDomain,
			nonce: _message._msgNonce
		};

		// Make sure SourceDomainNonceBox doesn't exists
		assert(!this.usedNonces(box).exists);

		// Create SourceDomainNonceBox
		this.usedNonces(box).create(0);

		// Handle receive message
		const handled = sendMethodCall<[uint<32>, bytes32, bytes], boolean>({
			applicationID: Application.fromID(extract_uint64(_message._msgRecipient, 24)),
			name: 'handleReceiveMessage',
			methodArgs: [
				_message._msgSourceDomain,
				_message._msgSender,
				_messageBody
			]
		});
		// TODO: If the itxn fails, the whole thing fails, so no need to check?
		//assert(handled);

		this.MessageReceived.log(
			{
				caller: this.txn.sender,
				sourceDomain: _message._msgSourceDomain,
				nonce: _message._msgNonce,
				sender: _message._msgSender,
				messageBody: _messageBody
			}
		);

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

		this.MaxMessageBodySizeUpdated.log({ newMaxMessageBodySize: this.maxMessageBodySize.value });
	}


	// ============ Constructor ============
	@allow.create('NoOp')
	deploy(
		_localDomain: uint<32>,
		//_attester: bytes32, // We cannot write to a box during deployment
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
		// FIX: this.enableAttester(_attester);
	}
}
