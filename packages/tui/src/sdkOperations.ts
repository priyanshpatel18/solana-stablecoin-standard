import * as fs from "fs";
import * as path from "path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { TOKEN_2022_PROGRAM_ID } from "@stbr/sss-token";
import type { StatusResponse } from "./api.js";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";
const KEYPAIR_PATH =
  process.env.KEYPAIR_PATH ??
  path.join(process.env.HOME ?? process.env.USERPROFILE ?? "", ".config", "solana", "id.json");

function getConnection(): Connection {
  return new Connection(RPC_URL);
}

function getKeypair(): Keypair {
  const data = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

async function loadStable(mint: string): Promise<import("@stbr/sss-token").SolanaStablecoin> {
  const { getProgram, SolanaStablecoin } = await import("@stbr/sss-token");
  const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
  const connection = getConnection();
  const wallet = new Wallet(getKeypair());
  const provider = new AnchorProvider(connection, wallet, {});
  const program = getProgram(provider);
  return SolanaStablecoin.load(program as never, new PublicKey(mint));
}

export async function fetchStatus(mint: string): Promise<StatusResponse> {
  const stable = await loadStable(mint);
  const state = await stable.getState();
  const supply = await stable.getTotalSupply();
  const totalMinted = state.total_minted?.toString?.() ?? String(state.total_minted ?? "0");
  const totalBurned = state.total_burned?.toString?.() ?? String(state.total_burned ?? "0");
  const supplyStr = supply?.toString?.() ?? String(supply ?? "0");
  return {
    mint: state.mint.toBase58(),
    authority: state.authority.toBase58(),
    name: state.name ?? "",
    symbol: state.symbol ?? "",
    uri: state.uri ?? "",
    decimals: state.decimals ?? 0,
    paused: state.paused ?? false,
    totalMinted,
    totalBurned,
    supply: supplyStr,
    preset:
      state.enable_permanent_delegate && state.enable_transfer_hook ? "SSS-2" : "SSS-1",
    enablePermanentDelegate: state.enable_permanent_delegate ?? false,
    enableTransferHook: state.enable_transfer_hook ?? false,
    defaultAccountFrozen: state.default_account_frozen ?? false,
  };
}

export async function mint(
  mint: string,
  recipient: string,
  amount: string | number,
  minter?: string
): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const sig = await stable.mint(
    kp.publicKey,
    {
      recipient: new PublicKey(recipient),
      amount: BigInt(String(amount)),
      minter: minter ? new PublicKey(minter) : kp.publicKey,
    }
  );
  return { signature: sig };
}

export async function burn(
  mint: string,
  amount: string | number,
  burner?: string
): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const burnerPk = burner ? new PublicKey(burner) : kp.publicKey;
  const sig = await stable.burn(burnerPk, { amount: BigInt(String(amount)) });
  return { signature: sig };
}

function resolveTokenAccount(mint: string, account?: string, owner?: string): PublicKey {
  if (account) return new PublicKey(account);
  if (owner) {
    return getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(owner),
      false,
      TOKEN_2022_PROGRAM_ID
    );
  }
  throw new Error("Either account or owner must be provided for freeze/thaw");
}

export async function freeze(
  mint: string,
  account?: string,
  owner?: string
): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const target = resolveTokenAccount(mint, account, owner);
  const sig = await stable.freezeAccount(kp.publicKey, target);
  return { signature: sig };
}

export async function thaw(
  mint: string,
  account?: string,
  owner?: string
): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const target = resolveTokenAccount(mint, account, owner);
  const sig = await stable.thawAccount(kp.publicKey, target);
  return { signature: sig };
}

export async function pause(mint: string): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const sig = await stable.pause(kp.publicKey);
  return { signature: sig };
}

export async function unpause(mint: string): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const sig = await stable.unpause(kp.publicKey);
  return { signature: sig };
}

export async function rolesGrant(
  mint: string,
  holder: string,
  roles: {
    minter?: boolean;
    burner?: boolean;
    pauser?: boolean;
    freezer?: boolean;
    blacklister?: boolean;
    seizer?: boolean;
  }
): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const sig = await stable.updateRoles(kp.publicKey, {
    holder: new PublicKey(holder),
    roles: {
      isMinter: roles.minter ?? false,
      isBurner: roles.burner ?? false,
      isPauser: roles.pauser ?? false,
      isFreezer: roles.freezer ?? false,
      isBlacklister: roles.blacklister ?? false,
      isSeizer: roles.seizer ?? false,
    },
  });
  return { signature: sig };
}

export async function blacklistAdd(
  mint: string,
  address: string,
  reason?: string
): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const sig = await stable.compliance.blacklistAdd(
    kp.publicKey,
    new PublicKey(address),
    reason ?? ""
  );
  return { signature: sig };
}

export async function blacklistRemove(mint: string, address: string): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const sig = await stable.compliance.blacklistRemove(kp.publicKey, new PublicKey(address));
  return { signature: sig };
}

export async function seize(
  mint: string,
  from: string,
  to: string,
  amount: string | number
): Promise<{ signature: string }> {
  const stable = await loadStable(mint);
  const kp = getKeypair();
  const sourceAta = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(from),
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const destAta = getAssociatedTokenAddressSync(
    new PublicKey(mint),
    new PublicKey(to),
    false,
    TOKEN_2022_PROGRAM_ID
  );
  const sig = await stable.compliance.seize(kp.publicKey, sourceAta, destAta);
  return { signature: sig };
}
