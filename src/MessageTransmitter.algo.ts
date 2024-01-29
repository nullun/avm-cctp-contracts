/*
 * MIT License
 *
 * Copyright (c) 2024 nullun
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { Contract } from '@algorandfoundation/tealscript';
import type { Message } from './messages/Message.algo';
import { Pausable } from './roles/Pausable.algo';
import { Attestable } from './roles/Attestable.algo';

type SourceDomainNonceBox = {
	sourceDomain: uint32;
	nonce: uint64;
};

/**
 * Contract responsible for sending and receiving message across chains.
 */
class MessageTransmitter extends Contract.extend(Pausable, Attestable) {
	programVersion = 10;

	// ============ State Variables ============
	// Domain of chain on which the application is deployed
	localDomain = GlobalStateKey<uint32>();

	// Message Format version
	version = GlobalStateKey<uint32>();

	// Maximum size of message body, in bytes.
	// This value is set by owner.
	maxMessageBodySize = GlobalStateKey<uint64>(); // FIX: uint256 ?

	// Next available nonce from this source domain
	nextAvailableNonce = GlobalStateKey<uint64>();

	// Maps 12 bytes (sourceDomain, nonce) as a box name // FIX: bytes32 as hash
	usedNonces = BoxMap<SourceDomainNonceBox, void>();


	// ============ Events ============
	/**
	 * Emitted when a new message is dispatched
	 */
	MessageSent = new EventLogger<{
		/** Raw bytes of message */
		message: bytes
	}>();

	/**
	 * Emitted when a new message is received
	 */
	MessageReceived = new EventLogger<{
		/** Caller (this.txn.sender) on destination domain */
		caller: Address,
		/** The source domain this message originated from */
		sourceDomain: uint32,
		/** The nonce unique to this message */
		nonce: uint64,
		/** The sender of this message */
		sender: bytes32,
		/** message body bytes */
		messageBody: bytes
	}>();

	/**
	 * Emitted when max message body size is updated
	 */
	MaxMessageBodySizeUpdated = new EventLogger<{
		/** new maximum message body size, in bytes */
		newMaxMessageBodySize: uint64
	}>();


	// ============ Constructor ============
	@allow.create('NoOp')
	deploy(
		_localDomain: uint32,
		//_attester: bytes32, // We cannot write to a box during deployment
		_maxMessageBodySize: uint64,
		_version: uint32
	): void {
		this.localDomain.value = _localDomain;
		this.maxMessageBodySize.value = _maxMessageBodySize;
		this.version.value = _version;

		// Set Ownable
		this._transferOwnership(this.txn.sender);

		// Set Attestable
		this._setAttesterManager(this.txn.sender);
		// Initially 1 signature is required. Threshold can be increased by attesterManager.
		this.signatureThreshold.value = 1;
		// UNFIXABLE: this.enableAttester(_attester);
	}


	// ============ External Functions  ============
	/**
	 * Send the message to the destination domain and recipient
	 *
	 * @dev Increment nonce, format the message, and emit `MessageSent` event
	 * with message information.
	 *
	 * @param destinationDomain Domain of destination chain
	 * @param recipient Address of message recipient on destination chain as bytes32
	 * @param messageBody Raw bytes content of message
	 * @return nonce reserved by message
	 */
	sendMessage(
		destinationDomain: uint32,
		recipient: bytes32,
		messageBody: bytes
	): uint64 {
		this.whenNotPaused();

		const _emptyDestinationCaller = bzero(32) as bytes32;
		const _nonce = this._reserveAndIncrementNonce();
		const _messageSender = bzero(24) + itob(globals.callerApplicationID) as bytes32;

		this._sendMessage(
			destinationDomain,
			recipient,
			_emptyDestinationCaller,
			_messageSender,
			_nonce,
			messageBody
		);

		return _nonce;
	}

	/**
	 * Replace a message with a new message body and/or destination caller.
	 *
	 * @dev The `originalAttestation` must be a valid attestation of
	 * `originalMessage`.
	 * Reverts if msg.sender does not match sender of original message, or if
	 * the source domain of the original message does not match this
	 * MessageTransmitter's local domain.
	 *
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

		const message_start = extractUint16(originalMessage, 0);
		const message_size = 116;
		const _message = castBytes<Message>(substring3(originalMessage, message_start, message_start + message_size));

		// Validate message format
		this._validateMessageFormat(_message);

		// Validate message sender
		const _sender = _message._msgSender;
		assert(bzero(24) + itob(globals.callerApplicationID) as bytes32 === _sender);

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
	 * Send the message to the destination domain and recipient, for a
	 * specified `destinationCaller` on the destination domain.
	 *
	 * @dev Increment nonce, format the message, and emit `MessageSent` event
	 * with message information.
	 * WARNING: if the `destinationCaller` does not represent a valid address,
	 * then it will not be possible to broadcast the message on the destination
	 * domain. This is an advanced feature, and the standard sendMessage() should
	 * be preferred for use cases where a specific destination caller is not
	 * required.
	 *
	 * @param destinationDomain Domain of destination chain
	 * @param recipient Address of message recipient on destination domain as bytes32
	 * @param destinationCaller caller on the destination domain, as bytes32
	 * @param messageBody Raw bytes content of message
	 * @return nonce reserved by message
	 */
	sendMessageWithCaller(
		destinationDomain: uint32,
		recipient: bytes32,
		destinationCaller: bytes32,
		messageBody: bytes
	): uint64 {
		this.whenNotPaused();

		assert(destinationCaller != bzero(32) as bytes32);

		const _nonce = this._reserveAndIncrementNonce();
		const _messageSender = (bzero(24) + itob(globals.callerApplicationID)) as bytes32;

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
	 * Receive a message. Messages with a given nonce
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

		// Check they're paying the appropriate usedNonce cost
		verifyPayTxn(fee, {
			receiver: this.app.address,
			amount: (2500) + (400 * (12)),
		});

		// Validate each signature in the attestation
		this._verifyAttestationSignatures(message, attestation);

		const message_start = extractUint16(message, 0);
		const message_size = 116;
		const _message = castBytes<Message>(substring3(message, message_start, message_start + message_size));

		const msg_body_start = message_start + message_size;
		const msg_body_size = message.length - msg_body_start;
		const _messageBody = substring3(message, msg_body_start, msg_body_start + msg_body_size);

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

		// Validate nonce is available
		// FIX: Use keccak256(box) (e.g. _hashSourceAndNonce) as name?
		assert(!this.usedNonces(box).exists);
		this.usedNonces(box).create(0);

		// Handle receive message
		const handled = sendMethodCall<[uint32, bytes32, bytes], boolean>({
			applicationID: Application.fromID(extractUint64(_message._msgRecipient, 24)),
			name: 'handleReceiveMessage',
			methodArgs: [
				_message._msgSourceDomain,
				_message._msgSender,
				_messageBody
			]
		});

		// Emit MessageReceived event
		this.MessageReceived.log({
			caller: this.txn.sender,
			sourceDomain: _message._msgSourceDomain,
			nonce: _message._msgNonce,
			sender: _message._msgSender,
			messageBody: _messageBody
		});

		return true;
	}

	/**
	 * Sets the max message body size
	 *
	 * @dev This value should not be reduced without good reason,
	 * to avoid impacting users who rely on large messages.
	 *
	 * @param newMaxMessageBodySize new max message body size, in bytes
	 */
	setMaxMessageBodySize(
		newMaxMessageBodySize: uint64
	): void {
		this.onlyOwner();

		this.maxMessageBodySize.value = newMaxMessageBodySize;

		this.MaxMessageBodySizeUpdated.log({ newMaxMessageBodySize: this.maxMessageBodySize.value });
	}


	// ============ Internal Utils ============
	/**
	 * Send the message to the destination domain and recipient. If
	 * `_destinationCaller` is not equal to bytes32(0), the message can only
	 * be received on the destination chain when called by `_destinationCaller`.
	 *
	 * @dev Format the message and emit `MessageSent` event with message information.
	 *
	 * @param _destinationDomain Domain of destination chain
	 * @param _recipient Address of message recipient on destination domain as bytes32
	 * @param _destinationCaller caller on the destination domain, as bytes32
	 * @param _sender message sender, as bytes32
	 * @param _nonce nonce reserved for message
	 * @param _messageBody Raw bytes content of message
	 */
	private _sendMessage(
		_destinationDomain: uint32,
		_recipient: bytes32,
		_destinationCaller: bytes32,
		_sender: bytes32,
		_nonce: uint64,
		_messageBody: bytes
	): void {
        // Validate message body length
		assert(_messageBody.length <= this.maxMessageBodySize.value);

		assert(_recipient != bzero(32) as bytes32);

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

        // Emit MessageSent event
		this.MessageSent.log({
			message: rawBytes(_message) + _messageBody
		});
	}

    /**
     * Reverts if message is incorrect length
	 *
     * @param _message The message
     */
	private _validateMessageFormat(_message: Message): void {
		assert(rawBytes(_message).length >= 116);
	}

	/**
	 * Reserve and increment next available nonce
	 *
	 * @return nonce reserved
	 */
	private _reserveAndIncrementNonce(): uint64 {
		const _nonceReserved: uint64 = this.nextAvailableNonce.value;
		this.nextAvailableNonce.value = this.nextAvailableNonce.value + 1;
		return _nonceReserved;
	}
}
