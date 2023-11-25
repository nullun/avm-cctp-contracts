import { Contract } from '@algorandfoundation/tealscript';

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
			globals.zeroAddress as unknown as byte[32]
		);
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
	private _getRemoteTokenMessenger(_domain: uint<32>): byte[32] {
		const _tokenMessenger: byte[32] = this.remoteTokenMessengers(_domain).value;

		assert(_tokenMessenger !== bzero(32));

		return _tokenMessenger;
	}

	/**
	 * @notice Deposits and burns tokens from sender to be minted on destination domain.
	 * Emits a `DepositForBurn` event.
	 * @param _amount amount of tokens to burn (must be non-zero)
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
			_burnToken: itob(_burnToken) as byte[32],
			_mintRecipient: _mintRecipient,
			_amount: itob(_axfer.assetAmount) as uint<256>,
			_messageSender: this.txn.sender as unknown as byte[32]
		};

		const _nonceReserved: uint<64> = this._sendDepositForBurnMessage(
		    _destinationDomain,
		    _destinationTokenMessenger,
		    _destinationCaller,
		    _burnMessage as bytes
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

	private _mintAndWithdraw(): void {}

	private _isRemoteTokenMessenger(): boolean {
		return true;
	}

	private _isLocalMessageTransmitter(): boolean {
		return true;
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

		this.localMessageTransmitter.value = _messageTransmitter;
		this.messageBodyVersion.value = _messageBodyVersion;
	}
}
