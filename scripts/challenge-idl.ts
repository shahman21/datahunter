// Reads the on-chain Anchor IDL for the challenge program, if the program published one.
// The IDL is the authoritative description of the instructions we have to build, so this
// beats guessing account orders from prose.
//
//   npm run challenge:idl
import { createAddressWithSeed, createSolanaRpc, getProgramDerivedAddress } from "@solana/kit";
import { inflate } from "node:zlib";
import { promisify } from "node:util";
import { CHALLENGE_PROGRAM, RPC_URL } from "./challenge-constants";

const rpc = createSolanaRpc(RPC_URL);

const [base] = await getProgramDerivedAddress({ programAddress: CHALLENGE_PROGRAM, seeds: [] });
const idlAddress = await createAddressWithSeed({ baseAddress: base, seed: "anchor:idl", programAddress: CHALLENGE_PROGRAM });
console.log("program    ", CHALLENGE_PROGRAM);
console.log("idl account", idlAddress);

const { value } = await rpc.getAccountInfo(idlAddress, { encoding: "base64" }).send();
if (!value) {
  console.log("\nNo IDL published on chain for this program.");
  process.exit(0);
}

const raw = Buffer.from(value.data[0], "base64");
// Anchor's IdlAccount: 8 byte discriminator, 32 byte authority, u32 length, zlib JSON.
const length = raw.readUInt32LE(40);
const compressed = raw.subarray(44, 44 + length);
const json = (await promisify(inflate)(compressed)).toString("utf8");
console.log(`\n${json.length} bytes of IDL:\n`);
console.log(json);
