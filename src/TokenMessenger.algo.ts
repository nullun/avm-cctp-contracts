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
import type { BurnMessage } from './messages/BurnMessage.algo';
import { Ownable2Step } from './roles/Ownable2Step.algo';

class TokenMessenger extends Contract.extend(Ownable2Step) {
	programVersion = 10;

	// ============ State Variables ============
	// Local Message Transmitter responsible for sending and receiving messages to/from remote domains
	localMessageTransmitter = GlobalStateKey<Application>();

	// Version of message body format
	messageBodyVersion = GlobalStateKey<uint<32>>();

	// Minter responsible for minting and burning tokens on the local domain
	localMinter = GlobalStateKey<Application>();

	// Valid TokenMessengers on remote domains
	remoteTokenMessengers = BoxMap<uint<32>, bytes32>();


	// ============ Events ============
	/**
	 * @notice Emitted when a DepositForBurn message is sent
	 * @param nonce unique nonce reserved by message
	 * @param burnToken address of token burnt on source domain
	 * @param amount deposit amount
	 * @param depositor address where deposit is transferred from
	 * @param mintRecipient address receiving minted tokens on destination domain as bytes32
	 * @param destinationDomain destination domain
	 * @param destinationTokenMessenger address of TokenMessenger on destination domain as bytes32
	 * @param destinationCaller authorized caller as bytes32 of receiveMessage() on destination domain, if not equal to bytes32(0).
	 * If equal to bytes32(0), any address can call receiveMessage().
	 */
	// DepositForBurn(uint64,asset,uint256,address,bytes32,uint32,bytes32,bytes32)
	DepositForBurn = new EventLogger<{
		nonce: uint<64>,
		burnToken: Asset,
		amount: uint<256>,
		depositor: Address,
		mintRecipient: bytes32,
		destinationDomain: uint<32>,
		destinationTokenMessenger: bytes32,
		destinationCaller: bytes32
	}>();

	/**
	 * @notice Emitted when tokens are minted
	 * @param mintRecipient recipient address of minted tokens
	 * @param amount amount of minted tokens
	 * @param mintToken asset of minted token
	 */
	// MintAndWithdraw(address,uint256,asset)
	MintAndWithdraw = new EventLogger<{
		mintRecipient: Address,
		amount: uint<256>,
		mintToken: Asset
	}>();

	/**
	 * @notice Emitted when a remote TokenMessenger is added
	 * @param domain remote domain
	 * @param tokenMessenger TokenMessenger on remote domain
	 */
	// RemoteTokenMessengerAdded(uint32,bytes32)
	RemoteTokenMessengerAdded = new EventLogger<{
		domain: uint<32>,
		tokenMessenger: bytes32
	}>();

	/**
	 * @notice Emitted when a remote TokenMessenger is removed
	 * @param domain remote domain
	 * @param tokenMessenger TokenMessenger on remote domain
	 */
	// RemoteTokenMessengerRemoved(uint32,bytes32)
	RemoteTokenMessengerRemoved = new EventLogger<{
		domain: uint<32>,
		tokenMessenger: bytes32
	}>();

	/**
	 * @notice Emitted when the local minter is added
	 * @param localMinter address of local minter
	 * @notice Emitted when the local minter is added
	 */
	// LocalMinterAddres(application)
	LocalMinterAdded = new EventLogger<{
		localMinter: Application
	}>();

	/**
	 * @notice Emitted when the local minter is removed
	 * @param localMinter address of local minter
	 * @notice Emitted when the local minter is removed
	 */
	// LocalMinterRemoved(application)
	LocalMinterRemoved = new EventLogger<{
		localMinter: Application
	}>();


	// ============ Modifiers ============
	/**
	 * @notice Only accept messages from a registered TokenMessenger contract on given remote domain
	 * @param domain The remote domain
	 * @param tokenMessenger The address of the TokenMessenger contract for the given remote domain
	 */
	private onlyRemoteTokenMessenger(
		domain: uint<32>,
		tokenMessenger: bytes32
	): void {
		assert(this.remoteTokenMessengers(domain).value === tokenMessenger);
	}

	/**
	 * @notice Only accept messages from the registered message transmitter on local domain
	 */
	private onlyLocalMessageTransmitter(): void {
		assert(this.txn.sender === this.localMessageTransmitter.value.address);
	}


	// ============ Internal Utils ============
	/**
	 * @notice return the local minter address if it is set, else revert.
	 * @return local minter as ITokenMinter.
	 */
	private _getLocalMinter(): Application {
		assert(this.localMinter.value);

		return this.localMinter.value;
	}

	/**
	 * @notice Sends a BurnMessage through the local message transmitter
	 * @dev calls local message transmitter's sendMessage() function if `_destinationCaller` == bytes32(0),
	 * or else calls sendMessageWithCaller().
	 * @param _destinationDomain destination domain
	 * @param _destinationTokenMessenger address of registered TokenMessenger contract on destination domain, as bytes32
	 * @param _destinationCaller caller on the destination domain, as bytes32. If `_destinationCaller` == bytes32(0),
	 * any address can call receiveMessage() on destination domain.
	 * @param _burnMessage formatted BurnMessage bytes (message body)
	 * @return nonce unique nonce reserved by message
	 */
	private _sendDepositForBurnMessage(
		_destinationDomain: uint<32>,
		_destinationTokenMessenger: bytes32,
		_destinationCaller: bytes32,
		_burnMessage: bytes
	): uint<64> {
		if (_destinationCaller === bzero(32) as bytes32) {
			return sendMethodCall<[uint<32>, bytes32, bytes], uint<64>>({
				applicationID: this.localMessageTransmitter.value,
				name: 'sendMessage',
				methodArgs: [
					_destinationDomain,
					_destinationTokenMessenger,
					_burnMessage
				]
			});
		} else {
			return sendMethodCall<[uint<32>, bytes32, bytes32, bytes], uint<64>>({
				applicationID: this.localMessageTransmitter.value,
				name: 'sendMessageWithCaller',
				methodArgs: [
					_destinationDomain,
					_destinationTokenMessenger,
					_destinationCaller,
					_burnMessage
				],
			});
		}
	}

	/**
	 * @notice return the remote TokenMessenger for the given `_domain` if one exists, else revert.
	 * @param _domain The domain for which to get the remote TokenMessenger
	 * @return _tokenMessenger The address of the TokenMessenger on `_domain` as bytes32
	 */
	private _getRemoteTokenMessenger(
		_domain: uint<32>
	): bytes32 {
		const _tokenMessenger = this.remoteTokenMessengers(_domain).value;

		assert(_tokenMessenger !== bzero(32) as bytes32);

		return _tokenMessenger;
	}

	/**
	 * @notice Deposits and burns tokens from sender to be minted on destination domain.
	 * Emits a `DepositForBurn` event.
	 * @param _axfer asset transfer of tokens to burn (must be non-zero)
	 * @param _destinationDomain destination domain
	 * @param _mintRecipient address of mint recipient on destination domain
	 * @param _burnToken address of contract to burn deposited tokens, on local domain
	 * @param _destinationCaller caller on the destination domain, as bytes32
	 * @return nonce unique nonce reserved by message
	 */
	private _depositForBurn(
		_axfer: AssetTransferTxn,
		_destinationDomain: uint<32>,
		_mintRecipient: bytes32,
		_burnToken: Asset,
		_destinationCaller: bytes32
	): uint<64> {
		assert(_axfer.assetAmount);
		assert(_mintRecipient != bzero(32) as bytes32);

		const _destinationTokenMessenger: bytes32 = this._getRemoteTokenMessenger(
			_destinationDomain
		);

		const _localMinter: Application = this._getLocalMinter();

		// Verify asset transfer to localMinter was valid
		assert(_axfer.xferAsset === _burnToken);
		assert(_axfer.assetCloseTo !== _localMinter.address);
		assert(_axfer.assetReceiver === _localMinter.address);

		// Call to TokenMinter to "burn" asset.
		sendMethodCall<[Asset, uint<64>], void>({
			applicationID: _localMinter,
			name: 'burn',
			methodArgs: [
				_burnToken,
				_axfer.assetAmount
			],
		});

		// Format message body
		const _burnMessage: BurnMessage = {
			_version: this.messageBodyVersion.value as uint<32>,
			_burnToken: concat(bzero(32 - len(itob(_burnToken))), itob(_burnToken)) as bytes32,
			_mintRecipient: _mintRecipient,
			_amount: _axfer.assetAmount as uint<256>,
			_messageSender: rawBytes(this.txn.sender) as bytes32
		};

		const _nonceReserved: uint<64> = this._sendDepositForBurnMessage(
			_destinationDomain,
			_destinationTokenMessenger,
			_destinationCaller,
			rawBytes(_burnMessage)
		);

		this.DepositForBurn.log({
			nonce: _nonceReserved,
			burnToken: _burnToken,
			amount: _axfer.assetAmount as uint<256>,
			depositor: this.txn.sender,
			mintRecipient: _mintRecipient,
			destinationDomain: _destinationDomain,
			destinationTokenMessenger: _destinationTokenMessenger,
			destinationCaller: _destinationCaller
		});

		return _nonceReserved;
	}

	/**
	 * @notice Mints tokens to a recipient
	 * @param _tokenMinter id of TokenMinter contract
	 * @param _remoteDomain domain where burned tokens originate from
	 * @param _burnToken address of token burned
	 * @param _mintRecipient recipient address of minted tokens
	 * @param _amount amount of minted tokens
	 */
	private _mintAndWithdraw(
		_tokenMinter: Application,
		_remoteDomain: uint<32>,
		_burnToken: bytes32,
		_mintRecipient: Address,
		_amount: uint<64>
	): void {
		const _mintToken = sendMethodCall<[uint<32>, bytes32, Address, uint<64>], Asset>({
			applicationID: _tokenMinter,
			name: 'mint',
			methodArgs: [
				_remoteDomain,
				_burnToken,
				_mintRecipient,
				_amount
			]
		});

		this.MintAndWithdraw.log({
			mintRecipient: _mintRecipient,
			amount: <uint<256>>_amount,
			mintToken: _mintToken
		});
	}


	// ============ External Functions  ============
	/**
	 * @notice Deposits and burns tokens from sender to be minted on destination domain.
	 * Emits a `DepositForBurn` event.
	 * @dev reverts if:
	 * - given burnToken is not supported
	 * - given destinationDomain has no TokenMessenger registered
	 * - transferFrom() reverts. For example, if sender's burnToken balance or approved allowance
	 * to this contract is less than `amount`.
	 * - burn() reverts. For example, if `amount` is 0.
	 * - MessageTransmitter returns false or reverts.
	 * @param axfer asset transfer of tokens to burn
	 * @param destinationDomain destination domain
	 * @param mintRecipient address of mint recipient on destination domain
	 * @param burnToken address of contract to burn deposited tokens, on local domain
	 * @return _nonce unique nonce reserved by message
	 */
	depositForBurn(
		axfer: AssetTransferTxn,
		destinationDomain: uint<32>,
		mintRecipient: bytes32,
		burnToken: Asset
	): uint<64> {
		return this._depositForBurn(
			axfer,
			destinationDomain,
			mintRecipient,
			burnToken,
			// (zeroAddress here indicates that any address can call receiveMessage()
			// on the destination domain, triggering mint to specified `mintRecipient`)
			bzero(32) as StaticArray<byte, 32>
		);
	}

	/**
	 * @notice Deposits and burns tokens from sender to be minted on destination domain. The mint
	 * on the destination domain must be called by `destinationCaller`.
	 * WARNING: if the `destinationCaller` does not represent a valid address as bytes32, then it will not be possible
	 * to broadcast the message on the destination domain. This is an advanced feature, and the standard
	 * depositForBurn() should be preferred for use cases where a specific destination caller is not required.
	 * Emits a `DepositForBurn` event.
	 * @dev reverts if:
	 * - given destinationCaller is zero address
	 * - given burnToken is not supported
	 * - given destinationDomain has no TokenMessenger registered
	 * - transferFrom() reverts. For example, if sender's burnToken balance or approved allowance
	 * to this contract is less than `amount`.
	 * - burn() reverts. For example, if `amount` is 0.
	 * - MessageTransmitter returns false or reverts.
	 * @param axfer amount of tokens to burn (must be non-zero)
	 * @param destinationDomain destination domain
	 * @param mintRecipient address of mint recipient on destination domain
	 * @param burnToken address of contract to burn deposited tokens, on local domain
	 * @param destinationCaller caller on the destination domain, as bytes32
	 * @return nonce unique nonce reserved by message
	 */
	depositForBurnWithCaller(
		axfer: AssetTransferTxn,
		destinationDomain: uint<32>,
		mintRecipient: bytes32,
		burnToken: Asset,
		destinationCaller: bytes32
	): uint<64> {
		// Destination caller must be nonzero. To allow any destination caller, use depositForBurn().
		assert(destinationCaller !== bzero(32) as bytes32);

		return this._depositForBurn(
			axfer,
			destinationDomain,
			mintRecipient,
			burnToken,
			destinationCaller
		);
	}

	/**
	 * @notice Replace a BurnMessage to change the mint recipient and/or
	 * destination caller. Allows the sender of a previous BurnMessage
	 * (created by depositForBurn or depositForBurnWithCaller)
	 * to send a new BurnMessage to replace the original.
	 * The new BurnMessage will reuse the amount and burn token of the original,
	 * without requiring a new deposit.
	 * @dev The new message will reuse the original message's nonce. For a
	 * given nonce, all replacement message(s) and the original message are
	 * valid to broadcast on the destination domain, until the first message
	 * at the nonce confirms, at which point all others are invalidated.
	 * Note: The msg.sender of the replaced message must be the same as the
	 * msg.sender of the original message.
	 * @param originalMessage original message bytes (to replace)
	 * @param originalAttestation original attestation bytes
	 * @param newDestinationCaller the new destination caller, which may be the
	 * same as the original destination caller, a new destination caller, or an empty
	 * destination caller (bytes32(0), indicating that any destination caller is valid.)
	 * @param newMintRecipient the new mint recipient, which may be the same as the
	 * original mint recipient, or different.
	 */
	replaceDepositForBurn(
		originalMessage: bytes,
		originalAttestation: bytes,
		newDestinationCaller: bytes32,
		newMintRecipient: bytes32
	): void {
		const msgLength = originalMessage.length;
		const _originalMsg = castBytes<Message>(originalMessage);
		const _originalMsgBody = castBytes<BurnMessage>(substring3(originalMessage, 116, msgLength));

		const _originalMsgSender = _originalMsgBody._messageSender;
		// _originalMsgSender must match msg.sender of original message
		assert(rawBytes(globals.callerApplicationAddress) as bytes32 === _originalMsgSender);
		assert(newMintRecipient !== bzero(32) as bytes32);

		const _burnToken = Asset.fromID(btoi(_originalMsgBody._burnToken));
		const _amount = _originalMsgBody._amount;

		const newMessageBody: BurnMessage = {
			_version: this.messageBodyVersion.value,
			_burnToken: itob(_burnToken) as bytes32,
			_mintRecipient: newMintRecipient,
			_amount: _amount,
			_messageSender: _originalMsgSender
		};

		sendMethodCall<[bytes, bytes, bytes, bytes32], void>({
			applicationID: this.localMessageTransmitter.value,
			name: 'replaceMessage',
			methodArgs: [
				rawBytes(originalMessage),
				originalAttestation,
				rawBytes(newMessageBody),
				newDestinationCaller
			]
		});

		this.DepositForBurn.log({
			nonce: _originalMsg._msgNonce,
			burnToken: _burnToken,
			amount: _amount,
			depositor: this.txn.sender,
			mintRecipient: newMintRecipient,
			destinationDomain: _originalMsg._msgDestinationDomain,
			destinationTokenMessenger: _originalMsg._msgRecipient,
			destinationCaller: newDestinationCaller
		});
	}

	/**
	 * @notice Handles an incoming message received by the local MessageTransmitter,
	 * and takes the appropriate action. For a burn message, mints the
	 * associated token to the requested recipient on the local domain.
	 * @dev Validates the local sender is the local MessageTransmitter, and the
	 * remote sender is a registered remote TokenMessenger for `remoteDomain`.
	 * @param remoteDomain The domain where the message originated from.
	 * @param sender The sender of the message (remote TokenMessenger).
	 * @param messageBody The message body bytes.
	 * @return success Bool, true if successful.
	 */
	handleReceiveMessage(
		remoteDomain: uint<32>,
		sender: bytes32,
		messageBody: bytes
	): boolean {
		this.onlyLocalMessageTransmitter();
		this.onlyRemoteTokenMessenger(remoteDomain, sender);

		/*
		const message_body_start = extract_uint16(messageBody, 0) + 2;
		const message_body_size = extract_uint16(messageBody, 2);
		const _messageBody = castBytes<BurnMessage>(substring3(messageBody, message_body_start, message_body_start + message_body_size));
		*/
		const _messageBody = castBytes<BurnMessage>(messageBody);

		assert(_messageBody._version === this.messageBodyVersion.value);

		// FIX: Make sure the amount isn't larger than bitlen 16? (uint64, otherwise we're minting much less than was burnt)

		this._mintAndWithdraw(
			this._getLocalMinter(),
			remoteDomain,
			_messageBody._burnToken,
			Address.fromBytes(_messageBody._mintRecipient),
			extractUint64(rawBytes(_messageBody._amount), 24)
		);

		return true;
	}

	/**
	 * @notice Add the TokenMessenger for a remote domain.
	 * @dev Reverts if there is already a TokenMessenger set for domain.
	 * @param domain Domain of remote TokenMessenger.
	 * @param tokenMessenger Address of remote TokenMessenger as bytes32.
	 */
	addRemoteTokenMessenger(
		domain: uint<32>,
		tokenMessenger: bytes32
	): void {
		this.onlyOwner();

		assert(tokenMessenger !== bzero(32) as bytes32);
		assert(!this.remoteTokenMessengers(domain).exists);

		this.remoteTokenMessengers(domain).value = tokenMessenger;

		this.RemoteTokenMessengerAdded.log({
			domain: domain,
			tokenMessenger: tokenMessenger
		});
	}

	/**
	 * @notice Remove the TokenMessenger for a remote domain.
	 * @dev Reverts if there is no TokenMessenger set for `domain`.
	 * @param domain Domain of remote TokenMessenger
	 */
	removeRemoteTokenMessenger(
		domain: uint<32>
	): void {
		this.onlyOwner();

		// No TokenMessenger set for given remote domain.
		assert(this.remoteTokenMessengers(domain).exists);

		const _removedTokenMessenger = this.remoteTokenMessengers(domain).value;
		this.remoteTokenMessengers(domain).delete();

		this.RemoteTokenMessengerRemoved.log({
			domain: domain,
			tokenMessenger: _removedTokenMessenger
		});
	}

	/**
	 * @notice Add minter for the local domain.
	 * @dev Reverts if a minter is already set for the local domain.
	 * @param newLocalMinter The address of the minter on the local domain.
	 */
	addLocalMinter(
		newLocalMinter: Application
	): void {
		this.onlyOwner();

		assert(newLocalMinter);
		assert(!this.localMinter.exists);

		this.localMinter.value = newLocalMinter;

		this.LocalMinterAdded.log({
			localMinter: newLocalMinter
		});
	}

	/**
	 * @notice Remove the minter for the local domain.
	 * @dev Reverts if the minter of the local domain is not set.
	 */
	removeLocalMinter(): void {
		this.onlyOwner();

		const _localMinterAddress: Application = this.localMinter.value;
		assert(this.localMinter.exists);

		this.localMinter.delete();

		this.LocalMinterRemoved.log({
			localMinter: _localMinterAddress
		});
	}


	// ============ Constructor ============
	/**
	 * @param _messageTransmitter Message transmitter address
	 * @param _messageBodyVersion Message body version
	 */
	@allow.create('NoOp')
	deploy(
		_messageTransmitter: Application,
		_messageBodyVersion: uint<32>
	): void {
		assert(_messageTransmitter);

		// Set Ownable
		this._transferOwnership(this.txn.sender);

		this.localMessageTransmitter.value = _messageTransmitter;
		this.messageBodyVersion.value = _messageBodyVersion;
	}
}
