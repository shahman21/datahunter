// Says whether the organisers have provisioned us on chain yet, and what our records hold.
// Run it before anything else: until this prints READY, no amount of solving helps.
//
//   npm run challenge:check
import { createSolanaRpc, getAddressDecoder, getProgramDerivedAddress, getUtf8Encoder } from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { CHALLENGE_ID, CHALLENGE_PROGRAM, CRED_MINT, RPC_URL, TEAM_WALLET } from "./challenge-constants";

const rpc = createSolanaRpc(RPC_URL);
const utf8 = getUtf8Encoder();
const addresses = getAddressDecoder();

/** The three records the organisers create for a team, and the seeds each uses. */
export async function challengePdas(challengeId: string) {
  const [claim] = await getProgramDerivedAddress({
    programAddress: CHALLENGE_PROGRAM,
    seeds: [utf8.encode("claim"), utf8.encode(challengeId.toLowerCase())],
  });
  const [holdings] = await getProgramDerivedAddress({
    programAddress: CHALLENGE_PROGRAM,
    seeds: [utf8.encode("holdings"), utf8.encode(challengeId)],
  });
  const [deed] = await getProgramDerivedAddress({
    programAddress: CHALLENGE_PROGRAM,
    seeds: [utf8.encode("deed"), utf8.encode(challengeId)],
  });
  return { claim, holdings, deed };
}

async function accountData(addressValue: string): Promise<Buffer | null> {
  const { value } = await rpc.getAccountInfo(addressValue as never, { encoding: "base64" }).send();
  return value ? Buffer.from(value.data[0], "base64") : null;
}

const challengeId = process.argv[2] ?? CHALLENGE_ID;
const pdas = await challengePdas(challengeId);
console.log(`challenge id ${challengeId}`);
console.log(`team wallet  ${TEAM_WALLET}\n`);

let provisioned = true;
for (const [label, pda] of Object.entries(pdas)) {
  const data = await accountData(pda);
  console.log(`${label.padEnd(9)} ${pda} ${data ? `${data.length} bytes` : "DOES NOT EXIST"}`);
  if (!data) provisioned = false;
  if (data && label === "claim" && data.length >= 81) {
    console.log(`          clearance nonce   ${data.readBigUInt64LE(41)}`);
    console.log(`          clearance account ${addresses.decode(data.subarray(49, 81))}`);
  }
  if (data && label === "holdings" && data.length >= 40) {
    console.log(`          registrar         ${addresses.decode(data.subarray(8, 40))}`);
  }
  if (data) console.log(`          raw               ${data.toString("hex")}`);
}

const [credAccount] = await findAssociatedTokenPda({ owner: TEAM_WALLET, mint: CRED_MINT, tokenProgram: TOKEN_PROGRAM_ADDRESS });
let cred = "no CRED token account";
try {
  const balance = await rpc.getTokenAccountBalance(credAccount).send();
  cred = `${balance.value.amount} base units`;
} catch {
  // left as the default message
}
console.log(`\nCRED account ${credAccount}`);
console.log(`CRED balance ${cred}`);
console.log(`\n${provisioned && !cred.startsWith("no") ? "READY: records exist and CRED is funded." : "NOT READY: ask an organiser to provision the team."}`);
