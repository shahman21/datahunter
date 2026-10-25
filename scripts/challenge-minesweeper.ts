// Minesweeper: minted (90), presented (80), fast hands (30).
//
// Two transactions. The first calls mint_code, which writes a code into the deed record. The
// second sends 1 CRED base unit to the presentation account with the memo "<id>:<code>".
// Fast hands wants the second within about a minute of the first, so this does both in one
// run with no human step in between, and prints the gap it achieved.
//
//   npm run challenge:minesweeper            -> simulate the mint only
//   npm run challenge:minesweeper -- --send  -> mint, read the code, present it
import {
  accountData,
  challengePdas,
  credTransferInstruction,
  loadEnv,
  loadTeamSigner,
  memoInstruction,
  minesweeperHash,
  mintCodeInstruction,
  readCode,
  readRegistrar,
  submit,
} from "./challenge-lib";
import { CHALLENGE_ID, MINESWEEPER_SALT, PRESENTATION_ACCOUNT } from "./challenge-constants";

loadEnv();

const send = process.argv.includes("--send");
const signer = await loadTeamSigner();
const { holdings, deed } = await challengePdas(CHALLENGE_ID);

const holdingsData = await accountData(holdings);
if (!holdingsData) throw new Error(`Holdings record ${holdings} does not exist. The team is not provisioned yet.`);

const registrar = readRegistrar(holdingsData);
const memoHash = minesweeperHash(CHALLENGE_ID, MINESWEEPER_SALT);
const memoHex = memoHash.toString("hex");

console.log(`challenge id   ${CHALLENGE_ID}`);
console.log(`team wallet    ${signer.address}`);
console.log(`holdings       ${holdings}`);
console.log(`registrar      ${registrar}`);
console.log(`deed           ${deed}`);
console.log(`memo hash      ${memoHex}`);

const mint = mintCodeInstruction({ signer, holdings, deed, registrar, challengeId: CHALLENGE_ID, memoHash });
const mintedAt = Date.now();
await submit(signer, [mint, memoInstruction(memoHex)], { send, label: "mint_code" });

if (!send) {
  console.log("\nNothing was sent. Re-run with --send to mint and present in one go.");
  process.exit(0);
}

// The deed is written by the instruction above, so read it back rather than assuming a code.
let deedData: Buffer | null = null;
for (let attempt = 0; attempt < 20 && !deedData; attempt++) {
  deedData = await accountData(deed);
  if (!deedData) await new Promise((r) => setTimeout(r, 250));
}
if (!deedData) throw new Error(`The deed record ${deed} still does not exist after minting.`);

const code = readCode(deedData, CHALLENGE_ID);
console.log(`\ndeed raw       ${deedData.toString("hex")}`);
console.log(`code           ${code}`);

const presentationMemo = `${CHALLENGE_ID}:${code}`;
console.log(`presenting     "${presentationMemo}" -> ${PRESENTATION_ACCOUNT}`);

await submit(
  signer,
  [await credTransferInstruction(signer, PRESENTATION_ACCOUNT, 1n), memoInstruction(presentationMemo)],
  { send: true, label: "presentation transfer" },
);

console.log(`\nmint to presentation: ${((Date.now() - mintedAt) / 1000).toFixed(1)}s (fast hands wants under 60s)`);
