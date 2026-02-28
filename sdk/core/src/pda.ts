import { PublicKey } from "@solana/web3.js";
import { SSS_TOKEN_PROGRAM_ID } from "./constants";

export const STABLECOIN_SEED = Buffer.from("stablecoin");
export const ROLE_SEED = Buffer.from("role");
export const MINTER_SEED = Buffer.from("minter");
export const BLACKLIST_SEED = Buffer.from("blacklist");
export const SUPPLY_CAP_SEED = Buffer.from("supply_cap");
export const EXTRA_ACCOUNT_METAS_SEED = Buffer.from("extra-account-metas");

export function findStablecoinPDA(
  mint: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [STABLECOIN_SEED, mint.toBuffer()],
    programId
  );
}

export function findRolePDA(
  stablecoin: PublicKey,
  holder: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, stablecoin.toBuffer(), holder.toBuffer()],
    programId
  );
}

export function findMinterPDA(
  stablecoin: PublicKey,
  minter: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINTER_SEED, stablecoin.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function findBlacklistPDA(
  stablecoin: PublicKey,
  address: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, stablecoin.toBuffer(), address.toBuffer()],
    programId
  );
}

export function findSupplyCapPDA(
  stablecoin: PublicKey,
  programId: PublicKey = SSS_TOKEN_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [SUPPLY_CAP_SEED, stablecoin.toBuffer()],
    programId
  );
}

export function findExtraAccountMetasPDA(
  mint: PublicKey,
  hookProgramId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
    hookProgramId
  );
}
