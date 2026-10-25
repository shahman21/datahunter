// Constants the organisers publish to every team on the day, plus our own identifiers.
// Nothing secret lives here: the Helius key and the program addresses are handed out with
// the challenge brief, and the challenge id is printed on our team page.

import { address } from "@solana/kit";

/** Our team's challenge id, from the team page. Case matters: the claim PDA lowercases it. */
export const CHALLENGE_ID = "T-f2f1cdff";

/** The team wallet registered on the team page, which is also the agent wallet. */
export const TEAM_WALLET = address("Caey9paYq95M3Vej4Pqp93VX5Spwj1mFP1ZgbccqTEDg");

export const CHALLENGE_PROGRAM = address("H2wWqEUUbQ3LJGWLAYyLK8vop4zxeX69r1cXeNpY4XXk");
export const CRED_MINT = address("AwPoLn4inVqixYn9Uab2JonLBqdKZDC6poXHtjWcBnG3");
export const PRESENTATION_ACCOUNT = address("HdMsqBdAW8mbrhJzHztqr1XVP1km3fXWHm7u8DpJeD9e");
export const MINESWEEPER_SALT = "830797a34fd3";

/** The organisers' devnet RPC. It serves reads fine but refuses requestAirdrop. */
export const RPC_URL =
  process.env.CHALLENGE_RPC_URL ||
  "https://devnet.helius-rpc.com/?api-key=20933d58-7daa-4b04-af3b-32f24c16409e";

export const MEMO_PROGRAM = address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
export const SYSVAR_INSTRUCTIONS = address("Sysvar1nstructions1111111111111111111111111");
export const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
