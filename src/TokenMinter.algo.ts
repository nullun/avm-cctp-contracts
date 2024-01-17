import { Contract } from '@algorandfoundation/tealscript';
import { TokenController } from './roles/TokenController.algo';
import { Pausable } from './roles/Pausable.algo';

class TokenMinter extends Contract.extend(TokenController, Pausable) {
	programVersion = 10;

	// ============ State Variables ============
	// Local TokenMessenger with permission to call mint and burn on this TokenMinter
	localTokenMessenger = GlobalStateKey<Application>();


	// ============ Events ============
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


	// ============ Constructor ============
	/**
	 * @param _tokenController Token controller address
	 */
	@allow.create('NoOp')
	deploy(_tokenController: Address): void {
		// Set Ownable
		this._transferOwnership(this.txn.sender);

		// Set TokenController
		this._setTokenController(_tokenController);
	}


	// ============ Access Checks ============
	/**
	 * @notice Only accept messages from the registered message transmitter on local domain
	 */
	private onlyLocalTokenMessenger(): void {
		// FIX: globals.callerApplicationAddress instead of this.txn.sender?
		assert(this.txn.sender === this.localTokenMessenger.value.address);
	}


	// ============ Internal Utils ============


	// ============ External Functions  ============
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
		burnToken: bytes32,
		to: Address,
		amount: uint<64>
	): Asset {
		this.whenNotPaused();
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
		this.whenNotPaused();
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
		this.onlyOwner();

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
		this.onlyOwner();

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
		this.onlyOwner();

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
		remoteToken: bytes32
	): Asset {
		return this._getLocalToken(remoteDomain, remoteToken);
	}
}
