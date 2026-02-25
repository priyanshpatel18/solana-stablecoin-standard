#!/usr/bin/env node
import { Command } from "commander";
import * as fs from "fs";
import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
} from "@solana/web3.js";
import { AnchorProvider, Wallet } from "@coral-xyz/anchor";
import {
  SolanaStablecoin,
  getProgram,
  type CreateStablecoinParams,
} from "@stbr/sss-token";

function getConnection(rpcUrl?: string): Connection {
  return new Connection(rpcUrl || process.env.RPC_URL || clusterApiUrl("devnet"));
}

function getKeypair(keypairPath?: string): Keypair {
  const kpPath = keypairPath || process.env.KEYPAIR || `${process.env.HOME}/.config/solana/id.json`;
  const data = JSON.parse(fs.readFileSync(kpPath, "utf-8"));
  return Keypair.fromSecretKey(Uint8Array.from(data));
}

function loadProgram(connection: Connection, wallet: Keypair) {
  const provider = new AnchorProvider(connection, new Wallet(wallet), {});
  return getProgram(provider);
}

function parseTomlLike(raw: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*(\w+)\s*=\s*(.+)$/);
    if (m) {
      let v: unknown = m[2].trim().replace(/^["']|["']$/g, "");
      if (v === "true") v = true;
      if (v === "false") v = false;
      if (typeof v === "string" && /^\d+$/.test(v)) v = parseInt(v, 10);
      out[m[1]] = v;
    }
  }
  return out;
}

const program = new Command();
program
  .name("sss-token")
  .description("Admin CLI for Solana Stablecoin Standard")
  .option("-k, --keypair <path>", "Path to keypair JSON")
  .option("-u, --rpc-url <url>", "RPC URL")
  .option("-m, --mint <address>", "Stablecoin mint address (for non-init commands)");

program
  .command("init")
  .description("Initialize a new stablecoin")
  .option("-p, --preset <sss-1|sss-2>", "Preset: sss-1 (minimal) or sss-2 (compliant)")
  .option("-c, --custom <file>", "Custom config TOML/JSON file")
  .requiredOption("-n, --name <name>", "Token name")
  .requiredOption("-s, --symbol <symbol>", "Token symbol")
  .option("--uri <uri>", "Metadata URI", "")
  .option("--decimals <n>", "Decimals", "6")
  .action(async (opts) => {
    const connection = getConnection(program.opts().rpcUrl);
    const authority = getKeypair(program.opts().keypair);
    const preset = opts.preset === "sss-2" ? "SSS_2" : "SSS_1";
    let params: CreateStablecoinParams = {
      name: opts.name,
      symbol: opts.symbol,
      uri: opts.uri || "",
      decimals: parseInt(opts.decimals, 10),
      preset: preset as "SSS_1" | "SSS_2",
    };
    if (opts.custom) {
      const raw = fs.readFileSync(opts.custom, "utf-8");
      const config = opts.custom.endsWith(".json")
        ? JSON.parse(raw)
        : parseTomlLike(raw);
      params = { ...params, ...config, preset: undefined };
      if (config.extensions) params.extensions = config.extensions;
    }
    const stable = await SolanaStablecoin.create(connection, params, authority);
    console.log("Stablecoin created. Mint:", stable.mintAddress.toBase58());
  });

program
  .command("mint <recipient> <amount>")
  .description("Mint tokens to recipient")
  .action(async (recipient, amount) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.mint(keypair.publicKey, {
      recipient: new PublicKey(recipient),
      amount: BigInt(amount),
      minter: keypair.publicKey,
    });
    console.log("Mint tx:", sig);
  });

program
  .command("burn <amount>")
  .description("Burn tokens from signer")
  .action(async (amount) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.burn(keypair.publicKey, { amount: BigInt(amount) });
    console.log("Burn tx:", sig);
  });

program
  .command("freeze <address>")
  .description("Freeze token account")
  .action(async (address) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const targetAta = stable.getRecipientTokenAccount(new PublicKey(address));
    const sig = await stable.freezeAccount(keypair.publicKey, targetAta);
    console.log("Freeze tx:", sig);
  });

program
  .command("thaw <address>")
  .description("Thaw token account")
  .action(async (address) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const targetAta = stable.getRecipientTokenAccount(new PublicKey(address));
    const sig = await stable.thawAccount(keypair.publicKey, targetAta);
    console.log("Thaw tx:", sig);
  });

program
  .command("pause")
  .description("Pause stablecoin")
  .action(async () => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.pause(keypair.publicKey);
    console.log("Pause tx:", sig);
  });

program
  .command("unpause")
  .description("Unpause stablecoin")
  .action(async () => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.unpause(keypair.publicKey);
    console.log("Unpause tx:", sig);
  });

program
  .command("status")
  .description("Show stablecoin status")
  .action(async () => {
    const connection = getConnection(program.opts().rpcUrl);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const keypair = getKeypair(program.opts().keypair);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const state = await stable.getState();
    console.log("Mint:", state.mint.toBase58());
    console.log("Name:", state.name);
    console.log("Symbol:", state.symbol);
    console.log("Decimals:", state.decimals);
    console.log("Paused:", state.paused);
    console.log("SSS-2:", stable.isSSS2());
    console.log("Total minted:", state.total_minted.toString());
    console.log("Total burned:", state.total_burned.toString());
  });

program
  .command("supply")
  .description("Show total supply")
  .action(async () => {
    const connection = getConnection(program.opts().rpcUrl);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const keypair = getKeypair(program.opts().keypair);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const supply = await stable.getTotalSupply();
    console.log(supply.toString());
  });

const blacklist = new Command("blacklist").description("Blacklist management (SSS-2)");
blacklist
  .command("add <address>")
  .option("-r, --reason <reason>", "Reason", "CLI")
  .action(async (address, opts) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.blacklistAdd(
      keypair.publicKey,
      new PublicKey(address),
      opts.reason
    );
    console.log("Blacklist add tx:", sig);
  });
blacklist
  .command("remove <address>")
  .action(async (address) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.blacklistRemove(
      keypair.publicKey,
      new PublicKey(address)
    );
    console.log("Blacklist remove tx:", sig);
  });
program.addCommand(blacklist);

program
  .command("blacklist-add <address>")
  .description("(Alias) Add address to blacklist (SSS-2)")
  .option("-r, --reason <reason>", "Reason", "CLI")
  .action(async (address, opts) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.blacklistAdd(
      keypair.publicKey,
      new PublicKey(address),
      opts.reason
    );
    console.log("Blacklist add tx:", sig);
  });

program
  .command("blacklist-remove <address>")
  .description("(Alias) Remove address from blacklist (SSS-2)")
  .action(async (address) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.blacklistRemove(
      keypair.publicKey,
      new PublicKey(address)
    );
    console.log("Blacklist remove tx:", sig);
  });

program
  .command("seize <source-account>")
  .description("Seize tokens to treasury (SSS-2)")
  .requiredOption("-t, --to <treasury-account>", "Destination token account (treasury ATA)")
  .action(async (sourceAccount, opts) => {
    const connection = getConnection(program.opts().rpcUrl);
    const keypair = getKeypair(program.opts().keypair);
    const mint = new PublicKey(program.opts().mint);
    if (!program.opts().mint) {
      console.error("--mint required");
      process.exit(1);
    }
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.seize(
      keypair.publicKey,
      new PublicKey(sourceAccount),
      new PublicKey(opts.to)
    );
    console.log("Seize tx:", sig);
  });

program.parse();
