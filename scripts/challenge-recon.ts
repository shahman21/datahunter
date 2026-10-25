// Reads the challenge program's own transaction history on devnet and prints, for every
// instruction another team has already landed, the 8-byte Anchor discriminator and the exact
// account list in order. The chain is the documentation here: the program publishes no IDL,
// and a transaction that worked is a better spec than prose.
//
//   npm run challenge:recon [limit]
import { createSolanaRpc, getBase58Encoder } from "@solana/kit";
import { createHash } from "node:crypto";
import { CHALLENGE_PROGRAM, RPC_URL } from "./challenge-constants";

const limit = Number(process.argv[2] ?? 40);
const rpc = createSolanaRpc(RPC_URL);
const b58 = getBase58Encoder();

/** Anchor's discriminator for a named instruction, so we can label what we find. */
function discriminator(name: string): string {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8).toString("hex");
}

const KNOWN = new Map<string, string>(
  ["mint_code", "init_operative", "init_operative_holdings", "initialize", "claim_code", "present_code"].map((n) => [
    discriminator(n),
    n,
  ]),
);

const signatures = await rpc.getSignaturesForAddress(CHALLENGE_PROGRAM, { limit }).send();
console.log(`${signatures.length} recent transactions touching ${CHALLENGE_PROGRAM}\n`);

for (const { signature, err, blockTime } of signatures) {
  const tx = await rpc
    .getTransaction(signature, { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" })
    .send();
  if (!tx) continue;
  const keys = tx.transaction.message.accountKeys;
  const when = blockTime ? new Date(Number(blockTime) * 1000).toISOString().slice(11, 19) : "--:--:--";
  console.log(`${when} ${err ? "FAILED " : "ok     "} ${signature.slice(0, 12)}…`);
  for (const ix of tx.transaction.message.instructions) {
    const programId = keys[ix.programIdIndex];
    if (programId !== CHALLENGE_PROGRAM) continue;
    const data = Buffer.from(b58.encode(ix.data as string));
    const disc = data.subarray(0, 8).toString("hex");
    console.log(`   ix ${KNOWN.get(disc) ?? `unknown(${disc})`}  ${data.length} bytes data`);
    console.log(`      data  ${data.toString("hex")}`);
    ix.accounts.forEach((index, position) => {
      console.log(`      acct ${position}: ${keys[index]}`);
    });
  }
}
