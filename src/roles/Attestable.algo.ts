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
import { Ownable2Step } from './Ownable2Step.algo';

type Signature = {
	r: bytes32;
	s: bytes32;
	v: uint<8>;
};

// 65-byte ECDSA signature: v (1) + r (32) + s (32)
const signatureLength = 65;

export class Attestable extends Contract.extend(Ownable2Step) {
	programVersion = 10;

	// ============ State Variables ============
	// number of signatures from distinct attesters required for a message to be received (m in m/n multisig)
	signatureThreshold = GlobalStateKey<uint<64>>();

	// Attester Manager of the application
	attesterManager = GlobalStateKey<Address>();

	// Attester Role
	enabledAttesters = BoxKey<bytes32[]>();


	// ============ Events ============
	/**
	 * @dev Emitted when attester manager address is updated
	 * @param previousAttesterManager representing the address of the previous attester manager
	 * @param newAttesterManager representing the address of the new attester manager
	 */
	// AttesterManagerUpdated(address,address)
	AttesterManagerUpdated = new EventLogger<{
		/* previousAttesterManager */
		previousAttesterManager: Address,
		/* newAttesterManager */
		newAttesterManager: Address
	}>();

	/**
	 * @notice Emitted when threshold number of attestations (m in m/n multisig) is updated
	 * @param oldSignatureThreshold old signature threshold
	 * @param newSignatureThreshold new signature threshold
	 */
	// SignatureThresholdUpdated(uint64,uint64)
	SignatureThresholdUpdated = new EventLogger<{
		/* oldSignatureThreshold */
		oldSignatureThreshold: uint<64>,
		/* newSignatureThreshold */
		newSignatureThreshold: uint<64>
	}>();


	// ============ Access Checks ============
	/**
	 * @dev Throws if called by any account other than the attester manager.
	 */
	private onlyAttesterManager(): void {
		assert(this.txn.sender === this.attesterManager.value);
	}


    // ============ Constructor ============


    // ============ Public/External Functions ============
	/**
	 * @notice Enables an attester
	 * @dev Only callable by attesterManager. New attester must not be attesters.
	 * @param newAttester attester to enable
	 */
	enableAttester(newAttester: bytes32): void {
		this.onlyAttesterManager();

		// Create box if doesn't exist
		if (!this.enabledAttesters.exists) {
			this.enabledAttesters.create(2);
		}

		// Make sure they're not already an attester
		assert(!this._isEnabledAttester(newAttester));

		const originalSize = this.enabledAttesters.size;

		// Resize box, then splice box
		// FIX: resize properly
		// @ts-expect-error Not yet implemented
		box_resize("enabledAttesters", originalSize + 32);

		// FIX: splice properly
		// @ts-expect-error Not yet implemented
		box_splice("enabledAttesters", originalSize, 32, newAttester);

		// TODO: Verify `pay` txn includes MBR increase
	}

	/**
	 * @notice returns the index of a given `attester`, else fails
	 * @param attester attester to retrieve index of
	 * @return index of given `attester`, else fails
	 */
	offsetOfEnabledAttester(attester: bytes32): uint<64> {
		const boxSize = this.enabledAttesters.size;
		for (let i = 2; i < boxSize; i = i + 32) {
			if (attester == this.enabledAttesters.value[i]) {
				return i;
			}
		}
		assert(0);
		return 0;
	}

	/**
	 * @notice returns the number of enabled attesters
	 * @return number of enabled attesters
	 */
	getNumEnabledAttesters(): uint64 {
		return this.enabledAttesters.size / 32;
	}

	/**
	 * FIX: onlyOwner or onlyAttesterManager?
	 * @dev Allows the current attester manager to transfer control of the application to a newAttesterManager.
	 * @param newAttesterManager The address to update attester manager to.
	 */
	updateAttesterManager(newAttesterManager: Address): void {
		this.onlyOwner()

		assert(newAttesterManager != globals.zeroAddress);

		const _oldAttesterManager: Address = this.attesterManager.exists ? this.attesterManager.value : globals.zeroAddress;
		this._setAttesterManager(newAttesterManager);

		this.AttesterManagerUpdated.log({ previousAttesterManager: _oldAttesterManager, newAttesterManager: newAttesterManager });
	}

	/**
	 * @notice Disables an attester
	 * @dev Only callable by attesterManager. Disabling the attester is not allowed if there is only one attester
	 * enabled, or if it would cause the number of enabled attesters to become less than signatureThreshold.
	 * (Attester must be currently enabled.)
	 * @param attester attester to disable
	 */
	disableAttester(attester: bytes32): void {
		this.onlyAttesterManager();

		assert(this.getNumEnabledAttesters() > 1);
		assert(this.getNumEnabledAttesters() > this.signatureThreshold.value);

		// Make sure they're an attester
		assert(this._isEnabledAttester(attester));

		// Get index of attester
		const index = this.offsetOfEnabledAttester(attester);

		// FIX: splice properly
		// @ts-expect-error Not yet implemented
		box_splice("enabledAttesters", (32 * index) + 2, 32, '');

		// Resize box, then splice box
		// FIX: resize properly
		// @ts-expect-error Not yet implemented
		box_resize("enabledAttesters", this.enabledAttesters.size - 32);

		// TODO: Refund excess MBR
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
		assert(newSignatureThreshold <= this.getNumEnabledAttesters());
		assert(newSignatureThreshold != this.signatureThreshold.value);

		const _oldSignatureThreshold: uint<64> = this.signatureThreshold.value;
		this.signatureThreshold.value = newSignatureThreshold;

		this.SignatureThresholdUpdated.log({ oldSignatureThreshold: _oldSignatureThreshold, newSignatureThreshold: this.signatureThreshold.value });
	}


	// ============ Internal Utils ============
	/**
	 * @dev Sets a new attester manager address
	 * @param _newAttesterManager attester manager address to set
	 */
	protected _setAttesterManager(_newAttesterManager: Address): void {
		this.attesterManager.value = _newAttesterManager;
	}

	/**
	 * @notice returns true if given `attester` is enabled, else false
	 * @param attester attester to check enabled status of
	 * @return true if given `attester` is enabled, else false
	 */
	private _isEnabledAttester(attester: bytes32): boolean {
		// TODO: Do I need this here?
		assert(attester != bzero(32) as bytes32);

		const boxSize = this.enabledAttesters.size - 2;
		if (boxSize > 0) {
			const numAttesters = boxSize / 32;
			let index = 0;
			while (index < numAttesters) {
				if (attester == this.enabledAttesters.value[index]) {
					return true;
				}
				index = index + 1;
			}
		}

		return false;
	}

	/**
	 * @notice Checks that signature was signed by attester
	 * @param _digest message hash
	 * @param _signature message signature
	 * @return address of recovered signer
	 */
	private _recoverAttesterSignature(
		_digest: bytes32,
		_signature: Signature
	): bytes32 {
		const r = btobigint(_signature.r);
		const s = btobigint(_signature.s);
		const v = _signature.v - 27;

		const res = ecdsa_pk_recover("Secp256k1", _digest, <uint64>v, r, s);
		const addr = bzero(12) + substring3(keccak256(rawBytes(res)), 12, 32) as bytes32;

		return addr
	}

	/**
	 * @notice reverts if the attestation, which is comprised of one or more concatenated 65-byte signatures, is invalid.
	 * @dev Rules for valid attestation:
	 * 1. length of `_attestation` == 65 (signature length) * signatureThreshold
	 * 2. addresses recovered from attestation must be in increasing order.
	 * For example, if signature A is signed by address 0x1..., and signature B
	 * is signed by address 0x2..., attestation must be passed as AB.
	 * 3. no duplicate signers
	 * 4. all signers must be enabled attesters
	 *
	 * Based on Christian Lundkvist's Simple Multisig
	 * (https://github.com/christianlundkvist/simple-multisig/tree/560c463c8651e0a4da331bd8f245ccd2a48ab63d)
	 * @param _message message to verify attestation of
	 * @param _attestation attestation of `_message`
	 */
	protected _verifyAttestationSignatures(
		_message: bytes,
		_attestation: bytes
	): void {
		assert(_attestation.length === signatureLength * this.signatureThreshold.value);

		// (Attesters cannot be address(0))
		// Address recovered from signatures must be in increasing order, to prevent duplicates
		let _latestAttesterAddress: bytes32 = bzero(32) as bytes32;

		const _signatures = castBytes<Signature[]>(_attestation);
		const _digest = keccak256(_message);
		for (let i = 0; i < this.signatureThreshold.value; i = i + 1) {
			const _signature = _signatures[i];

			// Need at least 2000 Opcode budget
			while (globals.opcodeBudget < 2500) {
				sendAppCall({
					onCompletion: OnCompletion.DeleteApplication,
					approvalProgram: hex("0x0a8101"),
					clearStateProgram: hex("0x0a8101")
				});
			}

			// TODO: Fix _recoverAttesterSignature
			const _recoveredAttester: bytes32 = this._recoverAttesterSignature(
				_digest,
				_signature
			);

			// Signatures must be in increasing order of address, and may not duplicate signatures from same address
			assert(btobigint(_recoveredAttester) > btobigint(_latestAttesterAddress));
			assert(this._isEnabledAttester(_recoveredAttester));

			_latestAttesterAddress = _recoveredAttester;
		}
	}
}