import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import * as crypto from "crypto";
import idlSssToken from "../sdk/core/src/idl/solana_stablecoin_standard.json";
import idlSssHook from "../sdk/core/src/idl/sss_transfer_hook.json";

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  (idlSssToken as { address: string }).address
);
export const SSS_HOOK_PROGRAM_ID = new PublicKey(
  (idlSssHook as { address: string }).address
);

/** Token-2022 program (mint, transfers, freeze). */
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

// PDA derivation (seeds match program).

export function findStablecoinPDA(mint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("stablecoin"), mint.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findRolePDA(
  stablecoin: PublicKey,
  holder: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("role"), stablecoin.toBuffer(), holder.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findMinterPDA(
  stablecoin: PublicKey,
  minter: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("minter"), stablecoin.toBuffer(), minter.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findBlacklistPDA(
  stablecoin: PublicKey,
  address: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("blacklist"), stablecoin.toBuffer(), address.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

export function findSupplyCapPDA(stablecoin: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("supply_cap"), stablecoin.toBuffer()],
    SSS_TOKEN_PROGRAM_ID
  );
}

/** ExtraAccountMetaList PDA for transfer hook (seeds: ["extra-account-metas", mint], program: hookProgramId). */
export function findExtraAccountMetasPDA(
  mint: PublicKey,
  hookProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("extra-account-metas"), mint.toBuffer()],
    hookProgramId
  );
}

// ── Anchor instruction discriminator (first 8 bytes of sha256("global:<name>")) ─

export function anchorDiscriminator(name: string): Buffer {
  const hash = crypto.createHash("sha256").update(`global:${name}`).digest();
  return hash.subarray(0, 8);
}

// ── Instruction builders (account order must match program structs) ───────────

export interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

export function serializeInitializeParams(params: InitializeParams): Buffer {
  const nameBytes = Buffer.from(params.name, "utf-8");
  const symbolBytes = Buffer.from(params.symbol, "utf-8");
  const uriBytes = Buffer.from(params.uri, "utf-8");
  return Buffer.concat([
    Buffer.from(new Uint32Array([nameBytes.length]).buffer),
    nameBytes,
    Buffer.from(new Uint32Array([symbolBytes.length]).buffer),
    symbolBytes,
    Buffer.from(new Uint32Array([uriBytes.length]).buffer),
    uriBytes,
    Buffer.from([params.decimals]),
    Buffer.from([params.enablePermanentDelegate ? 1 : 0]),
    Buffer.from([params.enableTransferHook ? 1 : 0]),
    Buffer.from([params.defaultAccountFrozen ? 1 : 0]),
  ]);
}

export function buildInitializeIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  mint: PublicKey,
  authorityRole: PublicKey,
  transferHookProgram: PublicKey,
  params: InitializeParams
): TransactionInstruction {
  const data = Buffer.concat([
    anchorDiscriminator("initialize_stablecoin"),
    serializeInitializeParams(params),
  ]);
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: stablecoin, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: true, isWritable: true },
      { pubkey: authorityRole, isSigner: false, isWritable: true },
      { pubkey: transferHookProgram, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data,
  });
}

export interface RoleFlags {
  isMinter: boolean;
  isBurner: boolean;
  isPauser: boolean;
  isBlacklister: boolean;
  isSeizer: boolean;
}

export function serializeRoleFlags(roles: RoleFlags): Buffer {
  return Buffer.from([
    roles.isMinter ? 1 : 0,
    roles.isBurner ? 1 : 0,
    roles.isPauser ? 1 : 0,
    roles.isBlacklister ? 1 : 0,
    roles.isSeizer ? 1 : 0,
  ]);
}

export function buildUpdateRolesIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  holder: PublicKey,
  roles: RoleFlags
): TransactionInstruction {
  const data = Buffer.concat([
    anchorDiscriminator("update_roles"),
    serializeRoleFlags(roles),
  ]);
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: stablecoin, isSigner: false, isWritable: true },
      { pubkey: role, isSigner: false, isWritable: true },
      { pubkey: holder, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data,
  });
}

export function buildUpdateMinterIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  minterInfo: PublicKey,
  minter: PublicKey,
  quota: bigint
): TransactionInstruction {
  const quotaBuf = Buffer.alloc(8);
  quotaBuf.writeBigUInt64LE(quota);
  const data = Buffer.concat([
    anchorDiscriminator("update_minter"),
    quotaBuf,
  ]);
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: stablecoin, isSigner: false, isWritable: true },
      { pubkey: minterInfo, isSigner: false, isWritable: true },
      { pubkey: minter, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data,
  });
}

export function buildUpdateSupplyCapIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  supplyCap: PublicKey,
  cap: bigint
): TransactionInstruction {
  const capBuf = Buffer.alloc(8);
  capBuf.writeBigUInt64LE(cap);
  const data = Buffer.concat([
    anchorDiscriminator("update_supply_cap"),
    capBuf,
  ]);
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: stablecoin, isSigner: false, isWritable: false },
      { pubkey: supplyCap, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data,
  });
}

export function buildMintTokensIx(
  minter: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  minterInfo: PublicKey,
  mint: PublicKey,
  recipientTokenAccount: PublicKey,
  amount: bigint,
  supplyCap: PublicKey = SSS_TOKEN_PROGRAM_ID
): TransactionInstruction {
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);
  const data = Buffer.concat([
    anchorDiscriminator("mint_tokens"),
    amountBuf,
  ]);
  return new TransactionInstruction({
    keys: [
      { pubkey: minter, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: true },
      { pubkey: role, isSigner: false, isWritable: false },
      { pubkey: minterInfo, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: recipientTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: supplyCap, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data,
  });
}

export function buildBurnTokensIx(
  burner: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  mint: PublicKey,
  burnerTokenAccount: PublicKey,
  amount: bigint
): TransactionInstruction {
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);
  const data = Buffer.concat([
    anchorDiscriminator("burn_tokens"),
    amountBuf,
  ]);
  return new TransactionInstruction({
    keys: [
      { pubkey: burner, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: true },
      { pubkey: role, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: true },
      { pubkey: burnerTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data,
  });
}

export function buildPauseIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: true },
      { pubkey: role, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: anchorDiscriminator("pause"),
  });
}

export function buildUnpauseIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: true },
      { pubkey: role, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: anchorDiscriminator("unpause"),
  });
}

export function buildFreezeAccountIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  mint: PublicKey,
  targetTokenAccount: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: false },
      { pubkey: role, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: targetTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: anchorDiscriminator("freeze_account"),
  });
}

export function buildThawAccountIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  mint: PublicKey,
  targetTokenAccount: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: false },
      { pubkey: role, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: targetTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: anchorDiscriminator("thaw_account"),
  });
}

export function buildTransferAuthorityIx(
  authority: PublicKey,
  stablecoin: PublicKey,
  newAuthority: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: true },
      { pubkey: newAuthority, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: anchorDiscriminator("transfer_authority"),
  });
}

// ── Token-2022 ATA ─────────────────────────────────────────────────────────

/** Derive Token-2022 ATA address for (mint, owner). Use when account already exists. */
export function getTokenAccountAddress(mint: PublicKey, owner: PublicKey): PublicKey {
  return getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID
  );
}

export async function createTokenAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const {
    createAssociatedTokenAccountInstruction,
    getAssociatedTokenAddressSync,
  } = await import("@solana/spl-token");
  const ata = getAssociatedTokenAddressSync(
    mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const ix = createAssociatedTokenAccountInstruction(
    payer.publicKey,
    ata,
    owner,
    mint,
    TOKEN_2022_PROGRAM_ID
  );
  await sendAndConfirmTransaction(connection, new Transaction().add(ix), [payer]);
  return ata;
}


export function buildAddToBlacklistIx(
  blacklister: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  blacklistEntry: PublicKey,
  address: PublicKey,
  reason: string
): TransactionInstruction {
  const reasonBytes = Buffer.from(reason, "utf-8");
  const data = Buffer.concat([
    anchorDiscriminator("add_to_blacklist"),
    Buffer.from(new Uint32Array([reasonBytes.length]).buffer),
    reasonBytes,
  ]);

  return new TransactionInstruction({
    keys: [
      { pubkey: blacklister, isSigner: true, isWritable: true },
      { pubkey: stablecoin, isSigner: false, isWritable: false },
      { pubkey: role, isSigner: false, isWritable: false },
      { pubkey: blacklistEntry, isSigner: false, isWritable: true },
      { pubkey: address, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data,
  });
}

export function buildRemoveFromBlacklistIx(
  blacklister: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  blacklistEntry: PublicKey,
  address: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: blacklister, isSigner: true, isWritable: true },
      { pubkey: stablecoin, isSigner: false, isWritable: false },
      { pubkey: role, isSigner: false, isWritable: false },
      { pubkey: blacklistEntry, isSigner: false, isWritable: true },
      { pubkey: address, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: anchorDiscriminator("remove_from_blacklist"),
  });
}

/** Build hook's initialize_extra_account_meta_list instruction (SSS-2 with transfer hook). */
export function buildInitializeExtraAccountMetaListIx(
  authority: PublicKey,
  extraAccountMetaList: PublicKey,
  mint: PublicKey,
  sssTokenProgramId: PublicKey
): TransactionInstruction {
  const data = Buffer.concat([
    anchorDiscriminator("initialize_extra_account_meta_list"),
    sssTokenProgramId.toBuffer(),
  ]);
  return new TransactionInstruction({
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: extraAccountMetaList, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    programId: SSS_HOOK_PROGRAM_ID,
    data,
  });
}

export function buildSeizeIx(
  seizer: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  mint: PublicKey,
  sourceTokenAccount: PublicKey,
  destinationTokenAccount: PublicKey,
  transferHookProgram: PublicKey,
  extraAccountMetas: PublicKey,
  sssTokenProgram: PublicKey,
  sourceBlacklist: PublicKey,
  destBlacklist: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: seizer, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: false },
      { pubkey: role, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: transferHookProgram, isSigner: false, isWritable: false },
      { pubkey: extraAccountMetas, isSigner: false, isWritable: false },
      { pubkey: sssTokenProgram, isSigner: false, isWritable: false },
      { pubkey: sourceBlacklist, isSigner: false, isWritable: false },
      { pubkey: destBlacklist, isSigner: false, isWritable: false },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: anchorDiscriminator("seize"),
  });
}

// ── Devnet / Explorer logging ──────────────────────────────────────────────

export type ExplorerCluster = "devnet" | "mainnet-beta" | "localnet";

/** Infer cluster from RPC endpoint for Explorer links. */
export function clusterFromRpcEndpoint(rpcUrl: string): ExplorerCluster | null {
  const u = rpcUrl.toLowerCase();
  if (u.includes("devnet")) return "devnet";
  if (u.includes("mainnet") && !u.includes("devnet")) return "mainnet-beta";
  return null;
}

/** Explorer transaction URL (empty for localnet). */
export function getExplorerTxUrl(signature: string, cluster: ExplorerCluster | null): string {
  if (!cluster || cluster === "localnet") return "";
  return `https://explorer.solana.com/tx/${signature}?cluster=${cluster}`;
}

/** Log transaction signature and Explorer link when cluster is devnet/mainnet. */
export function logTx(
  signature: string,
  label: string,
  rpcUrl?: string
): void {
  console.log(`  ${label}:`, signature);
  const cluster = rpcUrl ? clusterFromRpcEndpoint(rpcUrl) : null;
  const url = getExplorerTxUrl(signature, cluster);
  if (url) console.log("  Explorer:", url);
}

/** Send transaction, confirm, and log signature + Explorer link (for devnet). */
export async function sendAndConfirmAndLog(
  connection: Connection,
  tx: Transaction,
  signers: Keypair[],
  label: string
): Promise<string> {
  const sig = await sendAndConfirmTransaction(connection, tx, signers);
  logTx(sig, label, connection.rpcEndpoint);
  return sig;
}
