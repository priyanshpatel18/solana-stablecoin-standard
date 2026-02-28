import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  findStablecoinPDA,
  findRolePDA,
  findMinterPDA,
  findBlacklistPDA,
  findExtraAccountMetasPDA,
  STABLECOIN_SEED,
  ROLE_SEED,
  MINTER_SEED,
  BLACKLIST_SEED,
  EXTRA_ACCOUNT_METAS_SEED,
} from "../src/pda";
import { SSS_TOKEN_PROGRAM_ID, SSS_HOOK_PROGRAM_ID } from "../src/constants";

describe("PDA derivation", () => {
  const programId = SSS_TOKEN_PROGRAM_ID;
  const mint = new PublicKey("So11111111111111111111111111111111111111112");
  const [stablecoin] = PublicKey.findProgramAddressSync(
    [STABLECOIN_SEED, mint.toBuffer()],
    programId
  );
  const holder = new PublicKey("So11111111111111111111111111111111111111112");
  const minter = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
  const address = new PublicKey("SysvarRent111111111111111111111111111111111");

  it("findStablecoinPDA is deterministic", () => {
    const [pda1, bump1] = findStablecoinPDA(mint, programId);
    const [pda2, bump2] = findStablecoinPDA(mint, programId);
    expect(pda1.equals(pda2)).to.be.true;
    expect(bump1).to.equal(bump2);
  });

  it("findStablecoinPDA uses stablecoin seed", () => {
    const [pda] = findStablecoinPDA(mint, programId);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("stablecoin"), mint.toBuffer()],
      programId
    );
    expect(pda.equals(expected)).to.be.true;
  });

  it("findRolePDA is deterministic", () => {
    const [pda1, bump1] = findRolePDA(stablecoin, holder, programId);
    const [pda2, bump2] = findRolePDA(stablecoin, holder, programId);
    expect(pda1.equals(pda2)).to.be.true;
    expect(bump1).to.equal(bump2);
  });

  it("findRolePDA uses role seed", () => {
    const [pda] = findRolePDA(stablecoin, holder, programId);
    const [expected] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, stablecoin.toBuffer(), holder.toBuffer()],
      programId
    );
    expect(pda.equals(expected)).to.be.true;
  });

  it("findMinterPDA is deterministic", () => {
    const [pda1, bump1] = findMinterPDA(stablecoin, minter, programId);
    const [pda2, bump2] = findMinterPDA(stablecoin, minter, programId);
    expect(pda1.equals(pda2)).to.be.true;
    expect(bump1).to.equal(bump2);
  });

  it("findMinterPDA uses minter seed", () => {
    const [pda] = findMinterPDA(stablecoin, minter, programId);
    const [expected] = PublicKey.findProgramAddressSync(
      [MINTER_SEED, stablecoin.toBuffer(), minter.toBuffer()],
      programId
    );
    expect(pda.equals(expected)).to.be.true;
  });

  it("findBlacklistPDA is deterministic", () => {
    const [pda1, bump1] = findBlacklistPDA(stablecoin, address, programId);
    const [pda2, bump2] = findBlacklistPDA(stablecoin, address, programId);
    expect(pda1.equals(pda2)).to.be.true;
    expect(bump1).to.equal(bump2);
  });

  it("findBlacklistPDA uses blacklist seed", () => {
    const [pda] = findBlacklistPDA(stablecoin, address, programId);
    const [expected] = PublicKey.findProgramAddressSync(
      [BLACKLIST_SEED, stablecoin.toBuffer(), address.toBuffer()],
      programId
    );
    expect(pda.equals(expected)).to.be.true;
  });

  it("findExtraAccountMetasPDA uses hook program", () => {
    const [pda] = findExtraAccountMetasPDA(mint, SSS_HOOK_PROGRAM_ID);
    const [expected] = PublicKey.findProgramAddressSync(
      [EXTRA_ACCOUNT_METAS_SEED, mint.toBuffer()],
      SSS_HOOK_PROGRAM_ID
    );
    expect(pda.equals(expected)).to.be.true;
  });

  it("same seed with different program ID yields different PDA", () => {
    const [pda1] = findStablecoinPDA(mint, programId);
    const [pda2] = findStablecoinPDA(mint, SSS_HOOK_PROGRAM_ID);
    expect(pda1.equals(pda2)).to.be.false;
  });

  it("findStablecoinPDA with all-zero mint yields valid PDA", () => {
    const allZero = new PublicKey(Buffer.alloc(32, 0));
    const [pda, bump] = findStablecoinPDA(allZero, programId);
    expect(pda).to.be.instanceOf(PublicKey);
    expect(bump).to.be.a("number");
    expect(bump).to.be.greaterThanOrEqual(0);
    expect(bump).to.be.lessThanOrEqual(255);
  });

  it("findRolePDA with same seed different program ID yields different PDA", () => {
    const [pda1] = findRolePDA(stablecoin, holder, programId);
    const [pda2] = findRolePDA(stablecoin, holder, SSS_HOOK_PROGRAM_ID);
    expect(pda1.equals(pda2)).to.be.false;
  });
});
