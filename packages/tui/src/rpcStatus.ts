import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { StatusResponse } from "./api.js";

const RPC_URL = process.env.RPC_URL ?? "https://api.devnet.solana.com";

export async function fetchStatusFromRpc(
  mint: string,
  rpcUrl?: string
): Promise<StatusResponse> {
  const url = rpcUrl ?? RPC_URL;
  const connection = new Connection(url);
  const { getProgram, SolanaStablecoin } = await import("@stbr/sss-token");
  const { AnchorProvider, Wallet } = await import("@coral-xyz/anchor");
  const dummyWallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, dummyWallet, {});
  const program = getProgram(provider);
  const stable = await SolanaStablecoin.load(program as never, new PublicKey(mint));
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
