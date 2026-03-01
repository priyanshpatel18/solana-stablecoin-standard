import "dotenv/config";
import { Connection } from "@solana/web3.js";
import { createApp } from "./app";
import { subscribeToProgramLogs } from "./events";
import { logger } from "./logger";

const RPC_URL = process.env.RPC_URL || "https://api.devnet.solana.com";
const MINT_ADDRESS = process.env.MINT_ADDRESS;
const PORT = parseInt(process.env.PORT || "3000", 10);

const connection = new Connection(RPC_URL);
const app = createApp();

app.listen(PORT, () => {
  logger.info({ port: PORT, rpc: RPC_URL, mint: MINT_ADDRESS ?? null }, "SSS backend listening");
  subscribeToProgramLogs(connection);
});
