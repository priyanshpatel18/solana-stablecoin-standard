import * as anchor from "@coral-xyz/anchor";
import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";

export function getProvider() {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  return provider;
}

export async function fundKeypairs(
  provider: anchor.AnchorProvider,
  keypairs: Keypair[],
  lamportsPerKeypair = 100_000_000
) {
  const authority = provider.wallet.payer as Keypair;
  const tx = new Transaction();
  for (const kp of keypairs) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        toPubkey: kp.publicKey,
        lamports: lamportsPerKeypair,
      })
    );
  }
  await provider.sendAndConfirm(tx);
}
