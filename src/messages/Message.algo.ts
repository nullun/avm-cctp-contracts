export type Message = {
	_msgVersion: uint<32>;
	_msgSourceDomain: uint<32>;
	_msgDestinationDomain: uint<32>;
	_msgNonce: uint<64>;
	_msgSender: bytes32;
	_msgRecipient: bytes32;
	_msgDestinationCaller: bytes32;
	// _msgRawBody: bytes // Think it may be better to keep this out of the type structure
};