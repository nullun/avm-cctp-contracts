export type BurnMessage = {
	_version: uint<32>,
	_burnToken: bytes32,
	_mintRecipient: bytes32,
	_amount: uint<256>,
	_messageSender: bytes32
};