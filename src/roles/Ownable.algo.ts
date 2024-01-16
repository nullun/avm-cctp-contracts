import { Contract } from '@algorandfoundation/tealscript';

export class Ownable extends Contract {
	programVersion = 10;

	// ============ Events ============
	// OwnershipTransferred(address,address)
	OwnershipTransferred = new EventLogger<{
		/* Old Address */
		oldAddress: Address,
		/* New Address */
		newAddress: Address
	}>();


	// ============ State Variables ============
	// Owner of the application
	owner = GlobalStateKey<Address>();


	// ============ Internal Utils ============
	/**
	 * @dev Transfers ownership of the application to a new account (`newOwner`).
	 * Internal function without access restriction.
	 */
	private _transferOwnership(newOwner: Address): void {
		const oldOwner: Address = this.owner.exists ? this.owner.value : globals.zeroAddress;
		this.owner.value = newOwner;

		this.OwnershipTransferred.log({ oldAddress: oldOwner, newAddress: newOwner });
	}


    // ============ Constructor ============
    /**
     * @dev Initializes the contract setting the deployer as the initial owner.
     */
    /*
    protected _constructor(): void {
        this._transferOwnership(this.txn.sender);
    }
    */


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


	// ============ Access Checks ============
	/**
	 * @dev Throws if called by any account other than the owner.
	 */
	protected onlyOwner(): void {
		assert(this.txn.sender === this.owner.value);
	}
}