import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as crypto from "crypto";

export const SSS_TOKEN_PROGRAM_ID = new PublicKey(
  "BMWu6XvhKMXitwv3FCjjm2zZGD4pXeB1KX5oiUcPxGDB"
);
export const SSS_HOOK_PROGRAM_ID = new PublicKey(
  "GtYvo8PY7hV3KWfGHs3fPDyFEHRV4t1PVw6BkYUBgctC"
);
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

// ── PDA Derivation ─────────────────────────────────────────────────

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

// ── Anchor Discriminator ───────────────────────────────────────────

export function anchorDiscriminator(name: string): Buffer {
  const hash = crypto.createHash("sha256").update(`global:${name}`).digest();
  return hash.subarray(0, 8);
}

// ── Instruction Builders ───────────────────────────────────────────

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

  const buffers = [
    // name: String (4-byte length prefix + data)
    Buffer.from(new Uint32Array([nameBytes.length]).buffer),
    nameBytes,
    // symbol
    Buffer.from(new Uint32Array([symbolBytes.length]).buffer),
    symbolBytes,
    // uri
    Buffer.from(new Uint32Array([uriBytes.length]).buffer),
    uriBytes,
    // decimals: u8
    Buffer.from([params.decimals]),
    // enable_permanent_delegate: bool
    Buffer.from([params.enablePermanentDelegate ? 1 : 0]),
    // enable_transfer_hook: bool
    Buffer.from([params.enableTransferHook ? 1 : 0]),
    // default_account_frozen: bool
    Buffer.from([params.defaultAccountFrozen ? 1 : 0]),
  ];
  return Buffer.concat(buffers);
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
    anchorDiscriminator("initialize"),
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
      { pubkey: stablecoin, isSigner: false, isWritable: false },
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
      { pubkey: stablecoin, isSigner: false, isWritable: false },
      { pubkey: minterInfo, isSigner: false, isWritable: true },
      { pubkey: minter, isSigner: false, isWritable: false },
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
  amount: bigint
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

export function buildSeizeIx(
  seizer: PublicKey,
  stablecoin: PublicKey,
  role: PublicKey,
  mint: PublicKey,
  sourceTokenAccount: PublicKey,
  destinationTokenAccount: PublicKey
): TransactionInstruction {
  return new TransactionInstruction({
    keys: [
      { pubkey: seizer, isSigner: true, isWritable: false },
      { pubkey: stablecoin, isSigner: false, isWritable: false },
      { pubkey: role, isSigner: false, isWritable: false },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: sourceTokenAccount, isSigner: false, isWritable: true },
      { pubkey: destinationTokenAccount, isSigner: false, isWritable: true },
      { pubkey: TOKEN_2022_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    programId: SSS_TOKEN_PROGRAM_ID,
    data: anchorDiscriminator("seize"),
  });
}

// ── Token-2022 Helpers ─────────────────────────────────────────────

export async function createTokenAccount(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  const { createAssociatedTokenAccountInstruction, getAssociatedTokenAddress } =
    await import("@solana/spl-token");
  const ata = await getAssociatedTokenAddress(
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

  const tx = new Transaction().add(ix);
  await sendAndConfirmTransaction(connection, tx, [payer]);
  return ata;
}
