import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { toStablecoinState } from "../src/stablecoin";

const dummyPubkey = "So11111111111111111111111111111111111111112";

describe("toStablecoinState and supply", () => {
  it("toStablecoinState with snake_case keys", () => {
    const raw = {
      authority: dummyPubkey,
      mint: dummyPubkey,
      name: "Test",
      symbol: "T",
      uri: "https://example.com",
      decimals: 6,
      enable_permanent_delegate: true,
      enable_transfer_hook: false,
      default_account_frozen: false,
      paused: false,
      total_minted: 1000,
      total_burned: 100,
      bump: 254,
    };
    const state = toStablecoinState(raw);
    expect(state.name).to.equal("Test");
    expect(state.enable_permanent_delegate).to.be.true;
    expect(state.enable_transfer_hook).to.be.false;
    expect(state.total_minted.toString()).to.equal("1000");
    expect(state.total_burned.toString()).to.equal("100");
  });

  it("toStablecoinState with camelCase totalMinted totalBurned", () => {
    const raw = {
      authority: dummyPubkey,
      mint: dummyPubkey,
      name: "X",
      symbol: "Y",
      uri: "",
      decimals: 18,
      enablePermanentDelegate: false,
      enableTransferHook: true,
      defaultAccountFrozen: true,
      paused: true,
      totalMinted: BigInt(999),
      totalBurned: BigInt(111),
      bump: 1,
    };
    const state = toStablecoinState(raw);
    expect(state.total_minted.toString()).to.equal("999");
    expect(state.total_burned.toString()).to.equal("111");
    expect(state.enable_transfer_hook).to.be.true;
    expect(state.default_account_frozen).to.be.true;
    expect(state.paused).to.be.true;
  });

  it("toStablecoinState with null/undefined falls back to defaults", () => {
    const raw = {
      authority: dummyPubkey,
      mint: dummyPubkey,
    };
    const state = toStablecoinState(raw);
    expect(state.name).to.equal("");
    expect(state.symbol).to.equal("");
    expect(state.uri).to.equal("");
    expect(state.decimals).to.equal(0);
    expect(state.total_minted.toString()).to.equal("0");
    expect(state.total_burned.toString()).to.equal("0");
    expect(state.bump).to.equal(0);
  });

  it("supply = total_minted - total_burned from state", () => {
    const raw = {
      authority: dummyPubkey,
      mint: dummyPubkey,
      name: "S",
      symbol: "S",
      uri: "",
      decimals: 6,
      enable_permanent_delegate: false,
      enable_transfer_hook: false,
      default_account_frozen: false,
      paused: false,
      total_minted: 5000,
      total_burned: 2000,
      bump: 250,
    };
    const state = toStablecoinState(raw);
    const supply = state.total_minted.sub(state.total_burned);
    expect(supply.toString()).to.equal("3000");
  });

  it("toStablecoinState handles BN and bigint for totals", () => {
    const raw = {
      authority: dummyPubkey,
      mint: dummyPubkey,
      name: "A",
      symbol: "B",
      uri: "x",
      decimals: 0,
      enable_permanent_delegate: false,
      enable_transfer_hook: false,
      default_account_frozen: false,
      paused: false,
      total_minted: new BN(12345),
      total_burned: BigInt(999),
      bump: 0,
    };
    const state = toStablecoinState(raw);
    expect(state.total_minted.toString()).to.equal("12345");
    expect(state.total_burned.toString()).to.equal("999");
  });
});
