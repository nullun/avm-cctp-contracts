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

export class Ownable extends Contract {
	programVersion = 10;

	// ============ State Variables ============
	// Owner of the application
	_owner = GlobalStateKey<Address>();


	// ============ Events ============
	// OwnershipTransferred(address,address)
	OwnershipTransferred = new EventLogger<{
		/* Old Address */
		oldAddress: Address,
		/* New Address */
		newAddress: Address
	}>();


    // ============ Constructor ============


	// ============ Access Checks ============
	/**
	 * @dev Throws if called by any account other than the owner.
	 */
	protected onlyOwner(): void {
		assert(this.txn.sender === this._owner.value);
	}


	// ============ Read Only ============
    /**
     * @dev Returns the address of the current owner.
     */
	@abi.readonly
    owner(): Address {
        return this._owner.value;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
	@abi.readonly
    _checkOwner(): void {
        assert(this.owner() == this.txn.sender);
    }


	// ============ External Functions ============
	/**
	 * @dev Transfers ownership of the application to a new account (`newOwner`).
	 * Can only be called by the current owner.
	 */
	transferOwnership(newOwner: Address): void {
		this.onlyOwner();

		assert(newOwner != globals.zeroAddress);

		this._transferOwnership(newOwner);
	}


	// ============ Internal Utils ============
	/**
	 * @dev Transfers ownership of the application to a new account (`newOwner`).
	 * Internal function without access restriction.
	 */
	protected _transferOwnership(newOwner: Address): void {
		const oldOwner: Address = this._owner.exists ? this._owner.value : globals.zeroAddress;
		this._owner.value = newOwner;

		this.OwnershipTransferred.log({ oldAddress: oldOwner, newAddress: newOwner });
	}
}