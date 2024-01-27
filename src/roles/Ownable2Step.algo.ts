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
import { Ownable } from "./Ownable.algo";

export class Ownable2Step extends Contract.extend(Ownable) {
	programVersion = 10;

	// ============ State Variables ============
	// Pending owner of the application
	_pendingOwner = GlobalStateKey<Address>();


	// ============ Events ============
	// OwnershipTransferStarted(address,address)
	OwnershipTransferStarted = new EventLogger<{
		/* Previous owner */
		previousAddress: Address,
		/* New owner */
		newAddress: Address
	}>();


	// ============ Read Only ============
    /**
     * @dev Returns the address of the pending owner.
     */
    @abi.readonly
    pendingOwner(): Address {
        return this._pendingOwner.value;
    }


	// ============ External Functions ============
	/**
     * @dev Starts the ownership transfer of the contract to a new account. Replaces the pending transfer if there is one.
     * Can only be called by the current owner.
     * FIX: Once overrides exist, rename to transferOwnership
	 */
	transferOwnership2S(newOwner: Address): void {
		this.onlyOwner();

        this._pendingOwner.value = newOwner;

        this.OwnershipTransferStarted.log({
            previousAddress: this._owner.value,
            newAddress: newOwner
        });
	}

    /**
     * @dev The new owner accepts the ownership transfer.
     */
    acceptOwnership(): void {
        const sender: Address = this.txn.sender;
        assert(this.pendingOwner() == sender);
        // FIX: Once overrides exist, rename to _transferOwnership
        this._transferOwnership2S(sender);
    }


	// ============ Internal Utils ============
	/**
     * @dev Transfers ownership of the contract to a new account (`newOwner`) and deletes any pending owner.
     * Internal function without access restriction.
     * FIX: Once overrides exist, rename to _transferOwnership
	 */
	private _transferOwnership2S(newOwner: Address): void {
		const oldOwner: Address = this._owner.exists ? this._owner.value : globals.zeroAddress;
		this._owner.value = newOwner;

		this.OwnershipTransferred.log({ oldAddress: oldOwner, newAddress: newOwner });
	}
}