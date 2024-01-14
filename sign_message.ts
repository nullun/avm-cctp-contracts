import { ec as EC } from 'elliptic';
import { keccak256 } from 'js-sha3';

// DO NOT INCLUDE 0x AT THE START
const privateKey = '';
const log = '';

const ec = new EC('secp256k1');

const keyPair = ec.keyFromPrivate(privateKey);
const publicKey = '0x' + keyPair.getPublic('hex').slice(2);
//console.log(publicKey);
const publicHash = keccak256(Buffer.from(publicKey.slice(2), 'hex'));
//console.log(publicHash);
const publicAddr = '0x' + publicHash.slice(-40);
//console.log(publicAddr);
const attesterAddr = publicHash.slice(-40).padStart(64, '0');
console.log("Attester:", attesterAddr);

const message = Buffer.from(log, 'base64').slice(8);
console.log("MessageBody:", message.toString('base64'));
const hash = keccak256(message);
console.log("Message Hash:", '0x' + hash);

const signature = keyPair.sign(hash);
const r = signature.r.toString('hex').padStart(64, '0');
const s = signature.s.toString('hex').padStart(64, '0');
const v = (signature.recoveryParam + 27).toString(16);
console.log("Signature:", r+s+v);
console.log("Sig (b64):", Buffer.from(r+s+v, 'hex').toString('base64'));
