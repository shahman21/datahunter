// Operation: found it (30), exact (50), verified (70).
//
// One transaction clears all three, because each tier only adds a condition to the last:
// any CRED reaching the clearance account is "found it", the exact amount is "exact", and the
// memo alongside it is "verified". Press Run verification in that order afterwards.
//
//   npm run challenge:operation            -> simulate only
//   npm run challenge:operation -- --send  -> actually send it
import {
  accountData,
  challengePdas,
  clearanceAmount,
  clearanceMemo,
  credTransferInstruction,
  loadEnv,
  loadTeamSigner,
  memoInstruction,
  readClaim,
  submit,
} from "./challenge-lib";
import { CHALLENGE_ID } from "./challenge-constants";

loadEnv();

const send = process.argv.includes("--send");
const signer = await loadTeamSigner();
const { claim } = await challengePdas(CHALLENGE_ID);

const data = await accountData(claim);
if (!data) throw new Error(`Claim record ${claim} does not exist. The team is not provisioned yet.`);

const { nonce, clearanceAccount } = readClaim(data);
const amount = clearanceAmount(nonce);
const memo = clearanceMemo(CHALLENGE_ID, nonce);

console.log(`challenge id      ${CHALLENGE_ID}`);
console.log(`team wallet       ${signer.address}`);
console.log(`claim record      ${claim}`);
console.log(`clearance nonce   ${nonce}`);
console.log(`clearance account ${clearanceAccount}`);
console.log(`exact amount      ${amount} CRED base units`);
console.log(`memo              ${memo}`);

await submit(
  signer,
  [await credTransferInstruction(signer, clearanceAccount, amount), memoInstruction(memo)],
  { send, label: "Operation clearance transfer" },
);

if (!send) console.log("\nNothing was sent. Re-run with --send once the numbers above look right.");
