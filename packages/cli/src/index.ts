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
  findStablecoinPDA,
  findMinterPDA,
  findRolePDA,
  SSS_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  validateMintAmount,
  validateBurnAmount,
  getErrorMessage,
  type CreateStablecoinParams,
} from "@stbr/sss-token";

interface GlobalOpts {
  keypair?: string;
  rpcUrl?: string;
  mint?: string;
}

interface InitOpts {
  preset?: string;
  custom?: string;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: string;
}

interface ReasonOpts {
  reason?: string;
}

interface SeizeOpts {
  to: string;
}

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

function getExplorerTxUrl(signature: string, rpcUrl?: string): string {
  if (!rpcUrl) return "";
  const u = rpcUrl.toLowerCase();
  if (u.includes("devnet")) return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
  if (u.includes("mainnet") && !u.includes("devnet")) return `https://explorer.solana.com/tx/${signature}?cluster=mainnet-beta`;
  return "";
}

function logTx(sig: string, label: string, rpcUrl?: string): void {
  console.log(label + ":", sig);
  const url = getExplorerTxUrl(sig, rpcUrl);
  if (url) console.log("Explorer:", url);
}

const program = new Command();
program
  .name("sss-token")
  .description("Admin CLI for Solana Stablecoin Standard")
  .option("-k, --keypair <path>", "Path to keypair JSON")
  .option("-u, --rpc-url <url>", "RPC URL")
  .option("-m, --mint <address>", "Stablecoin mint address (for non-init commands)");

function getGlobalOpts(): GlobalOpts {
  return program.opts() as GlobalOpts;
}

program
  .command("init")
  .description("Initialize a new stablecoin")
  .option("-p, --preset <sss-1|sss-2>", "Preset: sss-1 (minimal) or sss-2 (compliant)")
  .option("-c, --custom <file>", "Custom config TOML/JSON file")
  .requiredOption("-n, --name <name>", "Token name")
  .requiredOption("-s, --symbol <symbol>", "Token symbol")
  .option("--uri <uri>", "Metadata URI", "")
  .option("--decimals <n>", "Decimals", "6")
  .action(async (...args: unknown[]) => {
    const opts = args[0] as InitOpts;
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const authority = getKeypair(globalOpts.keypair);
    const preset = opts.preset === "sss-2" ? "SSS_2" : "SSS_1";
    let params: CreateStablecoinParams = {
      name: opts.name,
      symbol: opts.symbol,
      uri: opts.uri ?? "",
      decimals: parseInt(opts.decimals ?? "6", 10),
      preset: preset as "SSS_1" | "SSS_2",
    };
    if (opts.custom) {
      const raw = fs.readFileSync(opts.custom, "utf-8");
      const config = opts.custom.endsWith(".json")
        ? (JSON.parse(raw) as Record<string, unknown>)
        : parseTomlLike(raw);
      params = { ...params, ...config, preset: undefined } as CreateStablecoinParams;
      if (config.extensions) (params as CreateStablecoinParams & { extensions?: unknown }).extensions = config.extensions;
    }
    const stable = await SolanaStablecoin.create(connection, params, authority);
    console.log("Stablecoin created. Mint:", stable.mintAddress.toBase58());
    const cluster = (globalOpts.rpcUrl || "").toLowerCase().includes("devnet") ? "devnet" : (globalOpts.rpcUrl || "").toLowerCase().includes("mainnet") ? "mainnet-beta" : null;
    if (cluster) console.log("Explorer:", `https://explorer.solana.com/address/${stable.mintAddress.toBase58()}?cluster=${cluster}`);
  });

program
  .command("mint <recipient> <amount>")
  .description("Mint tokens to recipient")
  .action(async (...args: unknown[]) => {
    const [recipient, amount] = args as [string, string];
    const err = validateMintAmount(amount ?? "0");
    if (err) {
      console.error(err);
      process.exit(1);
    }
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    try {
      const mint = new PublicKey(mintAddr);
      const prog = loadProgram(connection, keypair);
      const stable = await SolanaStablecoin.load(prog as never, mint);
      const sig = await stable.mint(keypair.publicKey, {
        recipient: new PublicKey(recipient),
        amount: BigInt(amount),
        minter: keypair.publicKey,
      });
      logTx(sig, "Mint tx", globalOpts.rpcUrl);
    } catch (e) {
      console.error(getErrorMessage(e));
      process.exit(1);
    }
  });

program
  .command("burn <amount>")
  .description("Burn tokens from signer")
  .action(async (...args: unknown[]) => {
    const [amount] = args as [string];
    const err = validateBurnAmount(amount ?? "0");
    if (err) {
      console.error(err);
      process.exit(1);
    }
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    try {
      const mint = new PublicKey(mintAddr);
      const prog = loadProgram(connection, keypair);
      const stable = await SolanaStablecoin.load(prog as never, mint);
      const sig = await stable.burn(keypair.publicKey, { amount: BigInt(amount) });
      logTx(sig, "Burn tx", globalOpts.rpcUrl);
    } catch (e) {
      console.error(getErrorMessage(e));
      process.exit(1);
    }
  });

program
  .command("freeze <address>")
  .description("Freeze token account")
  .action(async (...args: unknown[]) => {
    const [address] = args as [string];
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const targetAta = stable.getRecipientTokenAccount(new PublicKey(address));
    const sig = await stable.freezeAccount(keypair.publicKey, targetAta);
    logTx(sig, "Freeze tx", globalOpts.rpcUrl);
  });

program
  .command("thaw <address>")
  .description("Thaw token account")
  .action(async (...args: unknown[]) => {
    const [address] = args as [string];
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const targetAta = stable.getRecipientTokenAccount(new PublicKey(address));
    const sig = await stable.thawAccount(keypair.publicKey, targetAta);
    logTx(sig, "Thaw tx", globalOpts.rpcUrl);
  });

program
  .command("pause")
  .description("Pause stablecoin")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.pause(keypair.publicKey);
    logTx(sig, "Pause tx", globalOpts.rpcUrl);
  });

program
  .command("unpause")
  .description("Unpause stablecoin")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.unpause(keypair.publicKey);
    logTx(sig, "Unpause tx", globalOpts.rpcUrl);
  });

program
  .command("status")
  .description("Show stablecoin status")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const keypair = getKeypair(globalOpts.keypair);
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
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const keypair = getKeypair(globalOpts.keypair);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const supply = await stable.getTotalSupply();
    console.log(supply.toString());
  });

const supplyCap = new Command("supply-cap").description("Supply cap (authority only)");
supplyCap
  .command("set <amount>")
  .description("Set supply cap (0 = remove cap)")
  .action(async (...args: unknown[]) => {
    const [amount] = args as [string];
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const cap = BigInt(amount);
    const sig = await stable.updateSupplyCap(keypair.publicKey, cap);
    logTx(sig, "Supply cap tx", globalOpts.rpcUrl);
  });
supplyCap
  .command("clear")
  .description("Remove supply cap")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.updateSupplyCap(keypair.publicKey, BigInt(0));
    logTx(sig, "Supply cap clear tx", globalOpts.rpcUrl);
  });
supplyCap
  .command("get")
  .description("Show current supply cap (null = no cap)")
  .action(async () => {
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const keypair = getKeypair(globalOpts.keypair);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const cap = await stable.getSupplyCap();
    console.log(cap === null ? "null (no cap)" : cap.toString());
  });
program.addCommand(supplyCap);

const blacklist = new Command("blacklist").description("Blacklist management (SSS-2)");
blacklist
  .command("add <address>")
  .option("-r, --reason <reason>", "Reason", "CLI")
  .action(async function (this: Command, ...args: unknown[]) {
    const [address] = args as [string];
    const opts = this.opts() as ReasonOpts;
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.blacklistAdd(
      keypair.publicKey,
      new PublicKey(address),
      opts.reason ?? "CLI"
    );
    logTx(sig, "Blacklist add tx", globalOpts.rpcUrl);
  });
blacklist
  .command("remove <address>")
  .action(async (...args: unknown[]) => {
    const [address] = args as [string];
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.blacklistRemove(
      keypair.publicKey,
      new PublicKey(address)
    );
    logTx(sig, "Blacklist remove tx", globalOpts.rpcUrl);
  });
program.addCommand(blacklist);

program
  .command("blacklist-add <address>")
  .description("(Alias) Add address to blacklist (SSS-2)")
  .option("-r, --reason <reason>", "Reason", "CLI")
  .action(async function (this: Command, ...args: unknown[]) {
    const [address] = args as [string];
    const opts = this.opts() as ReasonOpts;
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.blacklistAdd(
      keypair.publicKey,
      new PublicKey(address),
      opts.reason ?? "CLI"
    );
    logTx(sig, "Blacklist add tx", globalOpts.rpcUrl);
  });

program
  .command("blacklist-remove <address>")
  .description("(Alias) Remove address from blacklist (SSS-2)")
  .action(async (...args: unknown[]) => {
    const [address] = args as [string];
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.blacklistRemove(
      keypair.publicKey,
      new PublicKey(address)
    );
    logTx(sig, "Blacklist remove tx", globalOpts.rpcUrl);
  });

program
  .command("seize <source-account>")
  .description("Seize tokens to treasury (SSS-2)")
  .requiredOption("-t, --to <treasury-account>", "Destination token account (treasury ATA)")
  .action(async function (this: Command, ...args: unknown[]) {
    const [sourceAccount] = args as [string];
    const opts = this.opts() as unknown as SeizeOpts;
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const sig = await stable.compliance.seize(
      keypair.publicKey,
      new PublicKey(sourceAccount),
      new PublicKey(opts.to)
    );
    logTx(sig, "Seize tx", globalOpts.rpcUrl);
  });

// ── Management: minters, holders, audit-log ─────────────────────────────────

const MINTER_INFO_SIZE = 8 + 32 + 32 + 8 + 8 + 1; // discriminator + stablecoin + minter + quota + minted_amount + bump

const mintersCmd = new Command("minters").description("Minter management");
mintersCmd
  .command("list")
  .description("List minters and their quotas for the stablecoin")
  .action(async (..._args: unknown[]) => {
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const [stablecoinPDA] = findStablecoinPDA(mint, SSS_TOKEN_PROGRAM_ID);
    const accounts = await connection.getProgramAccounts(SSS_TOKEN_PROGRAM_ID, {
      filters: [
        { dataSize: MINTER_INFO_SIZE },
        { memcmp: { offset: 8, bytes: stablecoinPDA.toBase58() } },
      ],
    });
    console.log("Minter (address)                    | Quota        | Minted");
    console.log("-                                   |--------------|--------------");
    for (const { account } of accounts) {
      const data = account.data;
      const minterPubkey = new PublicKey(data.subarray(8 + 32, 8 + 32 + 32));
      const quota = data.readBigUInt64LE(8 + 32 + 32);
      const minted = data.readBigUInt64LE(8 + 32 + 32 + 8);
      console.log(`${minterPubkey.toBase58()} | ${quota.toString().padStart(12)} | ${minted.toString().padStart(12)}`);
    }
  });
mintersCmd
  .command("add <address>")
  .description("Grant minter role and set quota")
  .option("-q, --quota <amount>", "Mint quota (max amount this minter can mint)", "0")
  .action(async function (this: Command, ...args: unknown[]) {
    const [address] = args as [string];
    const cmdOpts = this.opts() as { quota?: string };
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const minterPubkey = new PublicKey(address);
    const quota = BigInt(cmdOpts.quota ?? "0");
    const sigRoles = await stable.updateRoles(keypair.publicKey, {
      holder: minterPubkey,
      roles: { isMinter: true, isBurner: true, isPauser: true, isFreezer: false, isBlacklister: false, isSeizer: false },
    });
    logTx(sigRoles, "Roles (minter + burner) tx", globalOpts.rpcUrl);
    const sigQuota = await stable.updateMinter(keypair.publicKey, { minter: minterPubkey, quota });
    logTx(sigQuota, "Minter quota tx", globalOpts.rpcUrl);
  });
mintersCmd
  .command("remove <address>")
  .description("Revoke minter role")
  .action(async (...args: unknown[]) => {
    const [address] = args as [string];
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const minterPubkey = new PublicKey(address);
    const sig = await stable.updateRoles(keypair.publicKey, {
      holder: minterPubkey,
      roles: { isMinter: false, isBurner: false, isPauser: false, isFreezer: false, isBlacklister: false, isSeizer: false },
    });
    logTx(sig, "Minters remove tx", globalOpts.rpcUrl);
  });
program.addCommand(mintersCmd);

const rolesCmd = new Command("roles").description("Grant or update roles (authority only)");
rolesCmd
  .command("grant <address>")
  .description("Grant roles to an address. Pass flags for each role to grant.")
  .option("--minter", "Grant minter role")
  .option("--burner", "Grant burner role")
  .option("--pauser", "Grant pauser role")
  .option("--freezer", "Grant freezer role (freeze/thaw accounts)")
  .option("--blacklister", "Grant blacklister role (SSS-2)")
  .option("--seizer", "Grant seizer role (SSS-2)")
  .action(async function (this: Command, ...args: unknown[]) {
    const [address] = args as [string];
    const opts = this.opts() as { minter?: boolean; burner?: boolean; pauser?: boolean; freezer?: boolean; blacklister?: boolean; seizer?: boolean };
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const keypair = getKeypair(globalOpts.keypair);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const prog = loadProgram(connection, keypair);
    const stable = await SolanaStablecoin.load(prog as never, mint);
    const holder = new PublicKey(address);
    const roles = {
      isMinter: !!opts.minter,
      isBurner: !!opts.burner,
      isPauser: !!opts.pauser,
      isFreezer: !!opts.freezer,
      isBlacklister: !!opts.blacklister,
      isSeizer: !!opts.seizer,
    };
    const sig = await stable.updateRoles(keypair.publicKey, { holder, roles });
    logTx(sig, "Roles grant tx", globalOpts.rpcUrl);
  });
program.addCommand(rolesCmd);

interface HoldersOpts {
  minBalance?: string;
}

const TOKEN_ACCOUNT_SIZE = 165;

program
  .command("holders")
  .description("List token holders (by mint)")
  .option("--min-balance <amount>", "Minimum balance to include", "0")
  .action(async function (this: Command, ..._args: unknown[]) {
    const cmdOpts = this.opts() as HoldersOpts;
    const globalOpts = getGlobalOpts();
    const connection = getConnection(globalOpts.rpcUrl);
    const mintAddr = globalOpts.mint;
    if (!mintAddr) {
      console.error("--mint required");
      process.exit(1);
    }
    const mint = new PublicKey(mintAddr);
    const opts = cmdOpts;
    const minBalance = BigInt(opts.minBalance ?? "0");
    const accounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
      filters: [
        { dataSize: TOKEN_ACCOUNT_SIZE },
        { memcmp: { offset: 0, bytes: mint.toBase58() } },
      ],
    });
    const entries: { owner: string; amount: string }[] = [];
    for (const { account } of accounts) {
      const data = account.data;
      const owner = new PublicKey(data.subarray(32, 32 + 32));
      const amount = data.readBigUInt64LE(64);
      if (amount >= minBalance) entries.push({ owner: owner.toBase58(), amount: amount.toString() });
    }
    entries.sort((a, b) => (BigInt(b.amount) > BigInt(a.amount) ? 1 : -1));
    if (entries.length === 0) {
      console.log("No holders meeting min-balance.");
      return;
    }
    console.log("Owner (address)                     | Balance");
    console.log("-                                   |--------------");
    for (const { owner, amount } of entries) {
      console.log(`${owner} | ${amount}`);
    }
  });

program
  .command("audit-log")
  .description("Fetch audit log from backend (requires BACKEND_URL)")
  .option("-a, --action <type>", "Filter by action: mint, burn, blacklist_add, blacklist_remove, seize", "")
  .action(async function (this: Command, ..._args: unknown[]) {
    const cmdOpts = this.opts() as { action?: string };
    const globalOpts = getGlobalOpts();
    const mintAddr = globalOpts.mint;
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.error("Set BACKEND_URL to the backend base URL (e.g. http://localhost:3000) to use audit-log.");
      process.exit(1);
    }
    const url = new URL("/compliance/audit-log", backendUrl);
    if (mintAddr) url.searchParams.set("mint", mintAddr);
    if (cmdOpts.action) url.searchParams.set("action", cmdOpts.action);
    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("Backend error:", res.status, await res.text());
      process.exit(1);
    }
    const text = await res.text();
    console.log(text);
  });

// Strip leading "--" from argv (pnpm run cli -- --help passes both)
if (process.argv[2] === "--") {
  process.argv.splice(2, 1);
}
program.parse();
