import { Contract } from '@algorandfoundation/tealscript';
import { Ownable2Step } from './Ownable2Step.algo';

export class Pausable extends Contract.extend(Ownable2Step) {
	programVersion = 10;

	// ============ State Variables ============
    _pauser = GlobalStateKey<Address>();
    paused = GlobalStateKey<boolean>();


	// ============ Events ============
    Pause = new EventLogger<{}>();
    Unpause = new EventLogger<{}>();
    PauserChanged = new EventLogger<{
        newAddress: Address
    }>();


	// ============ Access Checks ============
    /**
     * @dev Modifier to make a function callable only when the contract is not paused.
     */
    protected whenNotPaused(): void {
        assert(!this.paused.value);
    }

    /**
     * @dev throws if called by any account other than the pauser
     */
    protected onlyPauser(): void {
        assert(this.txn.sender === this._pauser.value);
    }


	// ============ Read Only ============
    /**
     * @notice Returns current pauser
     * @return Pauser's address
     */
    pauser(): Address {
        return this._pauser.value;
    }


	// ============ External Functions ============
    /**
     * @dev called by the owner to pause, triggers stopped state
     */
    pause(): void {
        this.onlyPauser();

        this.paused.value = true;
        this.Pause.log({});
    }

    /**
     * @dev called by the owner to unpause, returns to normal state
     */
    unpause(): void {
        this.onlyPauser();

        this.paused.value = false;
        this.Unpause.log({});
    }

    /**
     * @dev update the pauser role
     */
    updatePauser(_newPauser: Address): void {
        this.onlyPauser();

        assert(_newPauser != globals.zeroAddress);
        this._pauser.value = _newPauser;
        this.PauserChanged.log({ newAddress: this._pauser.value });
    }
}