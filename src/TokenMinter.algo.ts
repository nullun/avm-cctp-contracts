import { Contract } from '@algorandfoundation/tealscript';

class TokenMinter extends Contract {

	// ============ Events ============
	// ===== TokenController =====
	/**
	 * @notice Emitted when a token pair is linked
	 * @param localToken local token to support
	 * @param remoteDomain remote domain
	 * @param remoteToken token on `remoteDomain` corresponding to `localToken`
	 */
	// TokenPairLinked(asset,uint32,StaticArray<byte, 32>)
	TokenPairLinked = new EventLogger<{
		localToken: Asset,
		remoteDomain: uint<32>,
		remoteToken: StaticArray<byte, 32>
	}>();

	/**
	 * @notice Emitted when a token pair is unlinked
	 * @param localToken local token id
	 * @param remoteDomain remote domain
	 * @param remoteToken token on `remoteDomain` unlinked from `localToken`
	 */
	// TokenPairUnlinked(asset,uint32,StaticArray<byte, 32>)
	TokenPairUnlinked = new EventLogger<{
		localToken: Asset,
		remoteDomain: uint<32>,
		remoteToken: StaticArray<byte, 32>
	}>();

	/**
	 * @notice Emitted when a burn limit per message is set for a particular token
	 * @param token local token id
	 * @param burnLimitPerMessage burn limit per message for `token`
	 */
	// SetBurnLimitPerMessage(asset,uint64)
	SetBurnLimitPerMessage = new EventLogger<{
		token: Asset,
		burnLimitPerMessage: uint<64>
	}>();

	/**
	 * @notice Emitted when token controller is set
	 * @param tokenController token controller address set
	 */
	// SetTokenController(address)
	SetTokenController = new EventLogger<{
		tokenController: Address
	}>();

	// ===== TokenMinter =====
	/**
	 * @notice Emitted when a local TokenMessenger is added
	 * @param localTokenMessenger address of local TokenMessenger
	 * @notice Emitted when a local TokenMessenger is added
	 */
	// LocalTokenMessengerAddress(application)
	LocalTokenMessengerAdded = new EventLogger<{
		localTokenMessenger: Application
	}>();

	/**
	 * @notice Emitted when a local TokenMessenger is removed
	 * @param localTokenMessenger address of local TokenMessenger
	 * @notice Emitted when a local TokenMessenger is removed
	 */
	// LocalTokenMessengerRemoved(application)
	LocalTokenMessengerRemoved = new EventLogger<{
		localTokenMessenger: Application
	}>();


	// ============ State Variables ============
	// ===== TokenController =====
	// Supported burnable tokens on the local domain
	// local token (address) => maximum burn amounts per message
	burnLimitsPerMessage = BoxMap<Asset, uint<64>>();

	// Supported mintable tokens on remote domains, mapped to their corresponding local token
	// hash(remote domain & remote token bytes32 address) => local token (asset)
	remoteTokensToLocalTokens = BoxMap<StaticArray<byte, 32>, Asset>();

	// Role with permission to manage token address mapping across domains, and per-message burn limits
	_tokenController = GlobalStateKey<Address>();

	// ===== TokenMinter =====
	// Local TokenMessenger with permission to call mint and burn on this TokenMinter
	localTokenMessenger = GlobalStateKey<Application>();


	// ============ Access Checks ============
	// ===== TokenController =====
	/**
	 * @dev Throws if called by any account other than the tokenController.
	 */
	private onlyTokenController(): void {
		assert(this.txn.sender === this._tokenController.value);
	}

	/**
	 * @notice ensures that attempted burn does not exceed
	 * burn limit per-message for given `burnToken`.
	 * @dev reverts if allowed burn amount is 0, or burnAmount exceeds
	 * allowed burn amount.
	 * @param token id of token to burn
	 * @param amount amount of `token` to burn
	 */
	private onlyWithinBurnLimit(
		token: Asset,
		amount: uint<64>
	): void {
		const _allowedBurnAmount: uint<64> = this.burnLimitsPerMessage(token).value;

		assert(_allowedBurnAmount);
		assert(amount <= _allowedBurnAmount);
	}

	// ===== TokenMinter =====
	/**
	 * @notice Only accept messages from the registered message transmitter on local domain
	 */
	private onlyLocalTokenMessenger(): void {
		// FIX: globals.callerApplicationAddress instead of this.txn.sender?
		assert(this.txn.sender === this.localTokenMessenger.value.address);
	}


	// ============ Internal Utils ============
	/**
	 * @notice Set tokenController to `newTokenController`, and
	 * emit `SetTokenController` event.
	 * @dev newTokenController must be nonzero.
	 * @param newTokenController address of new token controller
	 */
	private _setTokenController(newTokenController: Address): void {
		assert(newTokenController !== globals.zeroAddress);

		this._tokenController.value = newTokenController;

		this.SetTokenController.log({
			tokenController: newTokenController
		});
	}

	/**
	 * @notice hashes packed `_remoteDomain` and `_remoteToken`.
	 * @param remoteDomain Domain where message originated from
	 * @param remoteToken Address of remote token as bytes32
	 * @return keccak hash of packed remote domain and token
	 */
	private _hashRemoteDomainAndToken(
		remoteDomain: uint<32>,
		remoteToken: StaticArray<byte, 32>
	): StaticArray<byte, 32> {
		return keccak256(concat(rawBytes(remoteDomain), remoteToken)) as StaticArray<byte, 32>;
	}

	/**
	 * @notice Get the enabled local token associated with the given remote domain and token.
	 * @param remoteDomain Remote domain
	 * @param remoteToken Remote token
	 * @return Local asset id
	 */
	private _getLocalToken(
		remoteDomain: uint<32>,
		remoteToken: StaticArray<byte, 32>
	): Asset {
		const _remoteTokensKey: StaticArray<byte, 32> = this._hashRemoteDomainAndToken(
			remoteDomain,
			remoteToken
		);

		return this.remoteTokensToLocalTokens(_remoteTokensKey).value;
	}


	// ============ External Functions  ============
	// ===== TokenController =====
	/**
	 * @notice Links a pair of local and remote tokens to be supported by this TokenMinter.
	 * @dev Associates a (`remoteToken`, `localToken`) pair by updating remoteTokensToLocalTokens mapping.
	 * Reverts if the remote token (for the given `remoteDomain`) already maps to a nonzero local token.
	 * Note:
	 * - A remote token (on a certain remote domain) can only map to one local token, but many remote tokens
	 * can map to the same local token.
	 * - Setting a token pair does not enable the `localToken` (that requires calling setLocalTokenEnabledStatus.)
	 */
	linkTokenPair(
		localToken: Asset,
		remoteDomain: uint<32>,
		remoteToken: StaticArray<byte, 32>
	): void {
		this.onlyTokenController();

		// OptIn to asset
		sendAssetTransfer({
			xferAsset: localToken,
			assetReceiver: this.app.address,
			assetAmount: 0
		});

		const _remoteTokensKey: StaticArray<byte, 32> = this._hashRemoteDomainAndToken(
			remoteDomain,
			remoteToken
		);

		// remote token must not be already linked to a local token
		assert(!this.remoteTokensToLocalTokens(_remoteTokensKey).exists);

		this.remoteTokensToLocalTokens(_remoteTokensKey).value = localToken;

		this.TokenPairLinked.log({
			localToken: localToken,
			remoteDomain: remoteDomain,
			remoteToken: remoteToken
		});
	}

	/**
	 * @notice Unlinks a pair of local and remote tokens for this TokenMinter.
	 * @dev Removes link from `remoteToken`, to `localToken` for given `remoteDomain`
	 * by updating remoteTokensToLocalTokens mapping.
	 * Reverts if the remote token (for the given `remoteDomain`) already maps to the zero address.
	 * Note:
	 * - A remote token (on a certain remote domain) can only map to one local token, but many remote tokens
	 * can map to the same local token.
	 * - Unlinking a token pair does not disable burning the `localToken` (that requires calling setMaxBurnAmountPerMessage.)
	 */
	unlinkTokenPair(
		localToken: Asset,
		remoteDomain: uint<32>,
		remoteToken: StaticArray<byte, 32>
	): void {
		this.onlyTokenController()

		// TODO: CloseOut of ASA

		const _remoteTokensKey: StaticArray<byte, 32> = this._hashRemoteDomainAndToken(
			remoteDomain,
			remoteToken
		);

		// remote token must be linked to a local token before unlink
		assert(this.remoteTokensToLocalTokens(_remoteTokensKey).exists);

		this.remoteTokensToLocalTokens(_remoteTokensKey).delete();

		this.TokenPairUnlinked.log({
			localToken: localToken,
			remoteDomain: remoteDomain,
			remoteToken: remoteToken
		});
	}

	/**
	 * @notice Sets the maximum burn amount per message for a given `localToken`.
	 * @dev Burns with amounts exceeding `burnLimitPerMessage` will revert. Mints do not
	 * respect this value, so if this limit is reduced, previously burned tokens will still
	 * be mintable.
	 * @param localToken Local token to set the maximum burn amount per message of.
	 * @param burnLimitPerMessage Maximum burn amount per message to set.
	 */
	setMaxBurnAmountPerMessage(
		localToken: Asset,
		burnLimitPerMessage: uint<64>
	): void {
		this.onlyTokenController();

		this.burnLimitsPerMessage(localToken).value = burnLimitPerMessage;

		this.SetBurnLimitPerMessage.log({
			token: localToken,
			burnLimitPerMessage: burnLimitPerMessage
		});
	}

	// ===== TokenMinter =====
	/**
	 * @notice Mints `amount` of local tokens corresponding to the
	 * given (`sourceDomain`, `burnToken`) pair, to `to` address.
	 * @dev reverts if the (`sourceDomain`, `burnToken`) pair does not
	 * map to a nonzero local token address. This mapping can be queried using
	 * getLocalToken().
	 * @param sourceDomain Source domain where `burnToken` was burned.
	 * @param burnToken Burned token address as bytes32.
	 * @param to Address to receive minted tokens, corresponding to `burnToken`,
	 * on this domain.
	 * @param amount Amount of tokens to mint. Must be less than or equal
	 * to the minterAllowance of this TokenMinter for given `_mintToken`.
	 * @return mintToken token minted.
	 */
	mint(
		sourceDomain: uint<32>,
		burnToken: StaticArray<byte, 32>,
		to: Address,
		amount: uint<64>
	): Asset {
		// TODO: WhenNotPaused
		this.onlyLocalTokenMessenger();

		const _mintToken: Asset = this._getLocalToken(sourceDomain, burnToken);
		assert(_mintToken);

		// Mint (Send Asset)
		sendAssetTransfer({
			xferAsset: _mintToken,
			assetReceiver: to,
			assetAmount: amount
		});

		return _mintToken;
	}

	/**
	 * @notice Burn tokens owned by this TokenMinter.
	 * @param burnToken burnable token id.
	 * @param burnAmount amount of tokens to burn. Must be
	 * > 0, and <= maximum burn amount per message.
	 */
	burn(
		burnToken: Asset,
		burnAmount: uint<64>
	): void {
		// TODO: WhenNotPaused
		this.onlyLocalTokenMessenger();
		this.onlyWithinBurnLimit(burnToken, burnAmount);

		const reserveAddress: Address = burnToken.reserve;

		// Burn (Send to reserve)
		sendAssetTransfer({
			xferAsset: burnToken,
			assetReceiver: reserveAddress,
			assetAmount: burnAmount
		});
	}

	/**
	 * @notice Add TokenMessenger for the local domain. Only this TokenMessenger
	 * has permission to call mint() and burn() on this TokenMinter.
	 * @dev Reverts if a TokenMessenger is already set for the local domain.
	 * @param newLocalTokenMessenger The address of the new TokenMessenger on the local domain.
	 */
	addLocalTokenMessenger(
		newLocalTokenMessenger: Application
	): void {
		// TODO: onlyOwner

		assert(newLocalTokenMessenger);
		assert(!this.localTokenMessenger.exists);

		this.localTokenMessenger.value = newLocalTokenMessenger;

		this.LocalTokenMessengerAdded.log({
			localTokenMessenger: newLocalTokenMessenger
		});
	}

	/**
	 * @notice Remove the TokenMessenger for the local domain.
	 * @dev Reverts if the TokenMessenger of the local domain is not set.
	 */
	removeLocalTokenMessenger(): void {
		// TODO: onlyOwner

		assert(this.localTokenMessenger.exists);

		const _localTokenMessengerBeforeRemoval: Application = this.localTokenMessenger.value;

		this.localTokenMessenger.delete();

		this.LocalTokenMessengerRemoved.log({
			localTokenMessenger: _localTokenMessengerBeforeRemoval
		});
	}

	/**
	 * @notice Set tokenController to `newTokenController`, and
	 * emit `SetTokenController` event.
	 * @dev newTokenController must be nonzero.
	 * @param newTokenController address of new token controller
	 */
	setTokenController(
		newTokenController: Address
	): void {
		// TODO: onlyOwner

		this._setTokenController(newTokenController);
	}

	/**
	 * @notice Get the local token id associated with the given
	 * remote domain and token.
	 * @param remoteDomain Remote domain
	 * @param remoteToken Remote token
	 * @return local token id
	 */
	getLocalToken(
		remoteDomain: uint<32>,
		remoteToken: StaticArray<byte, 32>
	): Asset {
		return this._getLocalToken(remoteDomain, remoteToken);
	}


	// ============ Constructor ============
	/**
	 * @param _tokenController Token controller address
	 */
	@allow.create('NoOp')
	deploy(_tokenController: Address): void {
		this._setTokenController(_tokenController);
	}
}
