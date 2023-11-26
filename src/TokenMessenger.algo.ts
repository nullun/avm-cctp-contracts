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

class TokenMessenger extends Contract {

	// ============ State Variables ============
	// Local Message Transmitter responsible for sending and receiving messages to/from remote domains
	localMessageTransmitter = GlobalStateKey<Application>();

	// Version of message body format
	messageBodyVersion = GlobalStateKey<uint<32>>();

	// Minter responsible for minting and burning tokens on the local domain
	localMinter = GlobalStateKey<Application>();

	// Valid TokenMessengers on remote domains
	remoteTokenMessengers = BoxMap<uint<32>, byte[32]>();


	// ============ Modifiers ============
	/**
	 * @notice Only accept messages from a registered TokenMessenger contract on given remote domain
	 * @param domain The remote domain
	 * @param tokenMessenger The address of the TokenMessenger contract for the given remote domain
	 */
	private onlyRemoteTokenMessenger(
		domain: uint<32>,
		tokenMessenger: byte[32]
	): void {
		assert(this.remoteTokenMessengers(domain).value === tokenMessenger);
	}

	/**
	 * @notice Only accept messages from the registered message transmitter on local domain
	 */
	private onlyLocalMessageTransmitter(): void {
		// FIX: Use callerApplicationID instead?
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
		_destinationTokenMessenger: byte[32],
		_destinationCaller: byte[32],
		_burnMessage: bytes
	): uint<64> {
		if (_destinationCaller === bzero(32)) {
			return sendMethodCall<[uint<32>, byte[32], bytes], uint<64>>({
				applicationID: this.localMessageTransmitter.value,
				name: 'sendMessage',
				methodArgs: [
					_destinationDomain,
					_destinationTokenMessenger,
					_burnMessage
				]
			});
		} else {
			return sendMethodCall<[uint<32>, byte[32], byte[32], bytes], uint<64>>({
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
	): byte[32] {
		const _tokenMessenger: byte[32] = this.remoteTokenMessengers(_domain).value as byte[32];

		assert(_tokenMessenger !== bzero(32));

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
		_mintRecipient: byte[32],
		_burnToken: Asset,
		_destinationCaller: byte[32]
	): uint<64> {
		assert(_axfer.assetAmount);
		assert(_mintRecipient != bzero(32));

		const _destinationTokenMessenger: byte[32] = this._getRemoteTokenMessenger(
		    _destinationDomain
		);

		const _localMinter: Application = this._getLocalMinter();

		// Verify asset transfer to localMinter was valid
		assert(_axfer.xferAsset === _burnToken);
		assert(_axfer.assetCloseTo !== _localMinter.address);
		assert(_axfer.assetReceiver === _localMinter.address);

		// Call to TokenMinter to "burn" asset.
		sendMethodCall<[Asset,uint<64>], void>({
			applicationID: _localMinter,
			name: 'burn',
			methodArgs: [
				_burnToken,
				_axfer.assetAmount
			]
		});

		// Format message body
		const _burnMessage: BurnMessage = {
			_version: this.messageBodyVersion.value,
			_burnToken: concat(bzero(32-len(itob(_burnToken))), itob(_burnToken)) as byte[32],
			_mintRecipient: _mintRecipient,
			_amount: <uint<256>>_axfer.assetAmount,
			_messageSender: rawBytes(this.txn.sender) as byte[32]
		};

		const _nonceReserved: uint<64> = this._sendDepositForBurnMessage(
		    _destinationDomain,
		    _destinationTokenMessenger,
		    _destinationCaller,
		    rawBytes(_burnMessage)
		);

		/*
		// TODO: Emit Event DepositForBurn(
		    _nonceReserved,
		    _burnToken,
		    _amount,
		    msg.sender,
		    _mintRecipient,
		    _destinationDomain,
		    _destinationTokenMessenger,
		    _destinationCaller
		);
		*/

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
		_burnToken: byte[32],
		_mintRecipient: Address,
		_amount: uint<64>
	): void {
		sendMethodCall<[uint<32>, byte[32], Address, uint<64>], Asset>({
			applicationID: _tokenMinter,
			name: 'mint',
			methodArgs: [
				_remoteDomain,
				_burnToken,
				_mintRecipient,
				_amount
			]
		});

		// TODO: Emit Event MintAndWithdraw(_mintRecipient, _amount, _mintToken);
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
		mintRecipient: byte[32],
		burnToken: Asset
	): uint<64> {
		return this._depositForBurn(
			axfer,
			destinationDomain,
			mintRecipient,
			burnToken,
			// (zeroAddress here indicates that any address can call receiveMessage()
			// on the destination domain, triggering mint to specified `mintRecipient`)
			bzero(32)
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
		mintRecipient: byte[32],
		burnToken: Asset,
		destinationCaller: byte[32]
	): uint<64> {
	    // Destination caller must be nonzero. To allow any destination caller, use depositForBurn().
		assert(destinationCaller !== bzero(32));

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
	    originalMessage: Message,
	    originalAttestation: bytes,
	    newDestinationCaller: byte[32],
	    newMintRecipient: byte[32]
	): void {
		const _originalMsg: Message = originalMessage;
		const _originalMsgBody: BurnMessage = _originalMsg._msgRawBody as unknown as BurnMessage;

		const _originalMsgSender: byte[32] = _originalMsgBody._messageSender;
		// _originalMsgSender must match msg.sender of original message
		assert(this.txn.sender as unknown as byte[32] === _originalMsgSender);
		assert(newMintRecipient !== bzero(32));

		const _burnToken: Asset = btoi(_originalMsgBody._burnToken) as unknown as Asset;
		const _amount: uint<256> = _originalMsgBody._amount;

		const newMessageBody: BurnMessage = {
			_version: this.messageBodyVersion.value,
			_burnToken: itob(_burnToken) as byte[32],
			_mintRecipient: newMintRecipient,
			_amount: _amount,
			_messageSender: _originalMsgSender
		};

		sendMethodCall<[bytes, bytes, bytes, byte[32]], void>({
			applicationID: this.localMessageTransmitter.value,
			name: 'replaceMessage',
			methodArgs: [
				originalMessage as unknown as bytes,
				originalAttestation,
				newMessageBody as unknown as bytes,
				newDestinationCaller
			]
		});

		/*
		// TODO: Emit Event DepositForBurn(
			_originalMsg._nonce(),
			Message.bytes32ToAddress(_burnToken),
			_amount,
			msg.sender,
			newMintRecipient,
			_originalMsg._destinationDomain(),
			_originalMsg._recipient(),
			newDestinationCaller
		);
		*/
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
		sender: byte[32],
		messageBody: BurnMessage
	): boolean {
		this.onlyLocalMessageTransmitter();
		this.onlyRemoteTokenMessenger(remoteDomain, sender);

		assert(messageBody._version === this.messageBodyVersion.value);

		// FIX: Make sure the amount isn't larger than bitlen 16? (uint64, otherwise we're minting much less than was burnt)

		this._mintAndWithdraw(
			this._getLocalMinter(),
			remoteDomain,
			messageBody._burnToken,
			<Address>(messageBody._mintRecipient as unknown),
			extract_uint64(rawBytes(messageBody._amount), 24)
		);

		return true;
	}

	addRemoteTokenMessenger(): void {}

	removeRemoteTokenMessenger(): void {}

	addLocalMinter(): void {}

	removeLocalMinter(): void {}


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

		this.localMessageTransmitter.value = _messageTransmitter;
		this.messageBodyVersion.value = _messageBodyVersion;
	}
}
