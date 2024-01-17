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