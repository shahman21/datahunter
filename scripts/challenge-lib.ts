// Shared machinery for the two on-chain challenges. Everything here was read off devnet
// rather than guessed: the instruction layouts come from transactions other teams already
// landed (see `npm run challenge:recon`), and the record layouts from their accounts.

import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getAddressDecoder,
  getBase58Encoder,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  getSignatureFromTransaction,
  getU32Encoder,
  getUtf8Encoder,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import { createHash } from "node:crypto";
import {
  CHALLENGE_PROGRAM,
  CRED_MINT,
  MEMO_PROGRAM,
  RPC_URL,
  SYSTEM_PROGRAM,
  SYSVAR_INSTRUCTIONS,
} from "./challenge-constants";

export const CRED_DECIMALS = 6;
export const rpc = createSolanaRpc(RPC_URL);

const utf8 = getUtf8Encoder();
const u32 = getU32Encoder();
const addressDecoder = getAddressDecoder();

export function loadEnv(): void {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    console.warn("No .env.local found; using environment variables only.");
  }
}

/** The team wallet's signer, which is the same key the agent pays with. */
export async function loadTeamSigner(): Promise<KeyPairSigner> {
  const raw = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!raw) throw new Error("AGENT_PRIVATE_KEY is not set in .env.local.");
  const bytes = raw.startsWith("[")
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : new Uint8Array(getBase58Encoder().encode(raw));
  return createKeyPairSignerFromBytes(bytes);
}

// ---------------------------------------------------------------------------
// The three records the organisers create for a team
// ---------------------------------------------------------------------------

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

export async function accountData(target: Address): Promise<Buffer | null> {
  const { value } = await rpc.getAccountInfo(target, { encoding: "base64" }).send();
  return value ? Buffer.from(value.data[0], "base64") : null;
}

export interface ClaimRecord {
  /** u64 little endian at byte 41. */
  nonce: bigint;
  /** 32 bytes at byte 49: a CRED token account, so CRED goes straight to it. */
  clearanceAccount: Address;
}

export function readClaim(data: Buffer): ClaimRecord {
  if (data.length < 81) throw new Error(`Claim record is ${data.length} bytes, expected at least 81.`);
  return { nonce: data.readBigUInt64LE(41), clearanceAccount: addressDecoder.decode(data.subarray(49, 81)) };
}

/** The registrar sits at bytes 8-40 of holdings and has to be passed to mint_code. */
export function readRegistrar(data: Buffer): Address {
  if (data.length < 40) throw new Error(`Holdings record is ${data.length} bytes, expected at least 40.`);
  return addressDecoder.decode(data.subarray(8, 40));
}

/** Codes are eight characters. See readCode for how that was established. */
export const CODE_LENGTH = 8;

/**
 * The minted code, out of the deed record: an 8 byte discriminator, the length prefixed
 * challenge id, then exactly eight characters of code, then two bytes of per-team tail.
 *
 * The length is eight rather than "printable bytes until the first that is not", which is the
 * tempting read. Comparing two teams' deeds settles it: one team's code region holds nine
 * printable bytes and ours holds eight followed by 0x8a, and both records are the same total
 * size with the same trailing bytes. A fixed nine character code would make our own record
 * unreadable, so the ninth printable byte in theirs belongs to the two byte tail, not the code.
 * Scanning for printable bytes would therefore over-read on any team whose tail happens to
 * start with a printable byte, and present a code with a junk character on the end.
 */
export function readCode(data: Buffer, challengeId: string): string {
  const start = 8 + 4 + challengeId.length;
  const end = start + CODE_LENGTH;
  if (data.length < end) throw new Error(`Deed record is only ${data.length} bytes; no code in it yet.`);
  const code = data.subarray(start, end).toString("ascii");
  if (!/^[\x21-\x7e]{8}$/.test(code)) {
    throw new Error(`Deed bytes ${start}-${end} are not an eight character code: ${JSON.stringify(code)}`);
  }
  return code;
}

// ---------------------------------------------------------------------------
// The two answers we have to compute
// ---------------------------------------------------------------------------

/** Operation: sha256(id || nonce as 8 little endian bytes), first 16 hex characters. */
export function clearanceMemo(challengeId: string, nonce: bigint): string {
  const nonceBytes = Buffer.alloc(8);
  nonceBytes.writeBigUInt64LE(nonce);
  return createHash("sha256")
    .update(Buffer.concat([Buffer.from(challengeId, "utf8"), nonceBytes]))
    .digest("hex")
    .slice(0, 16);
}

/** Operation: 1000 + (nonce mod 9000) CRED base units, exactly. */
export function clearanceAmount(nonce: bigint): bigint {
  return 1000n + (nonce % 9000n);
}

/** Minesweeper: sha256(id || salt), as raw bytes for the instruction and hex for the memo. */
export function minesweeperHash(challengeId: string, salt: string): Buffer {
  return createHash("sha256").update(Buffer.concat([Buffer.from(challengeId, "utf8"), Buffer.from(salt, "utf8")])).digest();
}

// ---------------------------------------------------------------------------
// Instructions
// ---------------------------------------------------------------------------

export function memoInstruction(text: string): Instruction {
  return { programAddress: MEMO_PROGRAM, accounts: [], data: new Uint8Array(Buffer.from(text, "utf8")) };
}

export async function credTransferInstruction(
  signer: KeyPairSigner,
  destination: Address,
  amount: bigint,
): Promise<Instruction> {
  const [source] = await findAssociatedTokenPda({
    owner: signer.address,
    mint: CRED_MINT,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return getTransferCheckedInstruction({
    source,
    mint: CRED_MINT,
    destination,
    authority: signer,
    amount,
    decimals: CRED_DECIMALS,
  }) as Instruction;
}

/**
 * mint_code(challenge_id: string, memo_hash: [u8; 32]).
 *
 * Discriminator and account order taken from transactions that already succeeded:
 * signer (writable), holdings (writable), deed (writable), instructions sysvar, system
 * program, then the registrar as a trailing account. The program reads the memo out of the
 * transaction through the instructions sysvar, so the memo instruction has to be in the same
 * transaction.
 */
const MINT_CODE_DISCRIMINATOR = Buffer.from("98f036716133e976", "hex");

export function mintCodeInstruction(args: {
  signer: KeyPairSigner;
  holdings: Address;
  deed: Address;
  registrar: Address;
  challengeId: string;
  memoHash: Buffer;
}): Instruction {
  if (args.memoHash.length !== 32) throw new Error("memo_hash must be 32 bytes.");
  const idBytes = Buffer.from(args.challengeId, "utf8");
  const data = Buffer.concat([
    MINT_CODE_DISCRIMINATOR,
    Buffer.from(u32.encode(idBytes.length)),
    idBytes,
    args.memoHash,
  ]);
  return {
    programAddress: CHALLENGE_PROGRAM,
    accounts: [
      { address: args.signer.address, role: 3 }, // writable signer
      { address: args.holdings, role: 1 }, // writable
      { address: args.deed, role: 1 }, // writable
      { address: SYSVAR_INSTRUCTIONS, role: 0 },
      { address: SYSTEM_PROGRAM, role: 0 },
      { address: args.registrar, role: 0 },
    ],
    data: new Uint8Array(data),
  } as Instruction;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

/** Simulates unless --send is passed, so a wrong answer costs nothing but a log line. */
export async function submit(
  signer: KeyPairSigner,
  instructions: Instruction[],
  opts: { send: boolean; label: string },
): Promise<string | null> {
  const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const tx = await signTransactionMessageWithSigners(message);
  const wire = getBase64EncodedWireTransaction(tx);

  if (!opts.send) {
    const { value } = await rpc
      .simulateTransaction(wire, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true })
      .send();
    console.log(`\n[simulation] ${opts.label}`);
    for (const log of value.logs ?? []) console.log(`  ${log}`);
    console.log(value.err ? `  RESULT: failed — ${JSON.stringify(value.err)}` : "  RESULT: would succeed");
    if (value.err) process.exitCode = 1;
    return null;
  }

  const signature = getSignatureFromTransaction(tx);
  await rpc.sendTransaction(wire, { encoding: "base64", preflightCommitment: "confirmed" }).send();
  const deadline = Date.now() + 45_000;
  for (;;) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new Error(`${opts.label} failed on chain: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") break;
    if (Date.now() > deadline) throw new Error(`${opts.label} was not confirmed in time (${signature}).`);
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`${opts.label} confirmed: ${signature}`);
  console.log(`  https://explorer.solana.com/tx/${signature}?cluster=devnet`);
  return signature;
}

export { address, CHALLENGE_PROGRAM, CRED_MINT };
