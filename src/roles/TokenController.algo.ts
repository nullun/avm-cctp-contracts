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
import { Contract } from "@algorandfoundation/tealscript";

export class TokenController extends Contract {
	programVersion = 10;

	// ============ State Variables ============
	// Supported burnable tokens on the local domain
	// local token (address) => maximum burn amounts per message
	burnLimitsPerMessage = BoxMap<Asset, uint64>();

	// Supported mintable tokens on remote domains, mapped to their corresponding local token
	// hash(remote domain & remote token bytes32 address) => local token (asset)
	remoteTokensToLocalTokens = BoxMap<bytes32, Asset>();

	// Role with permission to manage token address mapping across domains, and per-message burn limits
	_tokenController = GlobalStateKey<Address>();


	// ============ Events ============
	/**
	 * Emitted when a token pair is linked
	 */
	TokenPairLinked = new EventLogger<{
		/** Local token to support */
		localToken: Asset,
		/** Remote domain */
		remoteDomain: uint32,
		/** Token on `remoteDomain` corresponding to `localToken` */
		remoteToken: bytes32
	}>();

	/**
	 * Emitted when a token pair is unlinked
	 */
	TokenPairUnlinked = new EventLogger<{
		/** Local token id */
		localToken: Asset,
		/** Remote domain */
		remoteDomain: uint32,
		/** Token on `remoteDomain` unlinked from `localToken` */
		remoteToken: bytes32
	}>();

	/**
	 * Emitted when a burn limit per message is set for a particular token
	 */
	SetBurnLimitPerMessage = new EventLogger<{
		/** Local token id */
		token: Asset,
		/** Burn limit per message for `token` */
		burnLimitPerMessage: uint64
	}>();

	/**
	 * Emitted when token controller is set
	 */
	SetTokenController = new EventLogger<{
		/** Token controller address set */
		tokenController: Address
	}>();


    // ============ Constructor ============


	// ============ Access Checks ============
	/**
	 * @dev Throws if called by any account other than the tokenController.
	 */
	protected onlyTokenController(): void {
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
	protected onlyWithinBurnLimit(
		token: Asset,
		amount: uint64
	): void {
		const _allowedBurnAmount: uint64 = this.burnLimitsPerMessage(token).value;

		assert(_allowedBurnAmount);
		assert(amount <= _allowedBurnAmount);
	}


	// ============ Read Only ============
    /**
     * @dev Returns the address of the tokenController
     * @return address of the tokenController
     */
    @abi.readonly
    tokenController(): Address {
        return this._tokenController.value;
    }


	// ============ External Functions ============
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
		remoteDomain: uint32,
		remoteToken: bytes32
	): void {
		this.onlyTokenController();

		// OptIn to asset
		sendAssetTransfer({
			xferAsset: localToken,
			assetReceiver: this.app.address,
			assetAmount: 0
		});

		const _remoteTokensKey: bytes32 = this._hashRemoteDomainAndToken(
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
		remoteDomain: uint32,
		remoteToken: bytes32
	): void {
		this.onlyTokenController()

		// TODO: CloseOut of ASA

		const _remoteTokensKey: bytes32 = this._hashRemoteDomainAndToken(
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
		burnLimitPerMessage: uint64
	): void {
		this.onlyTokenController();

		this.burnLimitsPerMessage(localToken).value = burnLimitPerMessage;

		this.SetBurnLimitPerMessage.log({
			token: localToken,
			burnLimitPerMessage: burnLimitPerMessage
		});
	}


	// ============ Internal Utils ============
	/**
	 * @notice Set tokenController to `newTokenController`, and
	 * emit `SetTokenController` event.
	 * @dev newTokenController must be nonzero.
	 * @param newTokenController address of new token controller
	 */
	protected _setTokenController(newTokenController: Address): void {
		assert(newTokenController !== globals.zeroAddress);

		this._tokenController.value = newTokenController;

		this.SetTokenController.log({
			tokenController: newTokenController
		});
	}

	/**
	 * @notice Get the enabled local token associated with the given remote domain and token.
	 * @param remoteDomain Remote domain
	 * @param remoteToken Remote token
	 * @return Local asset id
	 */
	protected _getLocalToken(
		remoteDomain: uint32,
		remoteToken: bytes32
	): Asset {
		const _remoteTokensKey: bytes32 = this._hashRemoteDomainAndToken(
			remoteDomain,
			remoteToken
		);

		return this.remoteTokensToLocalTokens(_remoteTokensKey).value;
	}

	/**
	 * @notice hashes packed `_remoteDomain` and `_remoteToken`.
	 * @param remoteDomain Domain where message originated from
	 * @param remoteToken Address of remote token as bytes32
	 * @return keccak hash of packed remote domain and token
	 */
	protected _hashRemoteDomainAndToken(
		remoteDomain: uint32,
		remoteToken: bytes32
	): bytes32 {
		return keccak256(concat(rawBytes(remoteDomain), remoteToken)) as bytes32;
	}
}