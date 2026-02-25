import { expect } from "chai";
import {
  Presets,
  normalizeInitializeParams,
  type CreateStablecoinParams,
  type StablecoinExtensions,
} from "../src/types";

describe("Presets and config", () => {
  const baseParams: CreateStablecoinParams = {
    name: "Test USD",
    symbol: "TUSD",
    uri: "https://example.com/tusd.json",
    decimals: 6,
  };

  it("Presets.SSS_1 has all compliance disabled", () => {
    const ext: StablecoinExtensions = Presets.SSS_1;
    expect(ext.enablePermanentDelegate).to.be.false;
    expect(ext.enableTransferHook).to.be.false;
    expect(ext.defaultAccountFrozen).to.be.false;
  });

  it("Presets.SSS_2 has all compliance enabled", () => {
    const ext: StablecoinExtensions = Presets.SSS_2;
    expect(ext.enablePermanentDelegate).to.be.true;
    expect(ext.enableTransferHook).to.be.true;
    expect(ext.defaultAccountFrozen).to.be.true;
  });

  it("normalizeInitializeParams with preset SSS_1", () => {
    const params: CreateStablecoinParams = { ...baseParams, preset: "SSS_1" };
    const out = normalizeInitializeParams(params);
    expect(out.name).to.equal("Test USD");
    expect(out.symbol).to.equal("TUSD");
    expect(out.decimals).to.equal(6);
    expect(out.enable_permanent_delegate).to.be.false;
    expect(out.enable_transfer_hook).to.be.false;
    expect(out.default_account_frozen).to.be.false;
  });

  it("normalizeInitializeParams with preset SSS_2", () => {
    const params: CreateStablecoinParams = { ...baseParams, preset: "SSS_2" };
    const out = normalizeInitializeParams(params);
    expect(out.enable_permanent_delegate).to.be.true;
    expect(out.enable_transfer_hook).to.be.true;
    expect(out.default_account_frozen).to.be.true;
  });

  it("normalizeInitializeParams with custom extensions", () => {
    const params: CreateStablecoinParams = {
      ...baseParams,
      extensions: {
        enablePermanentDelegate: true,
        enableTransferHook: false,
        defaultAccountFrozen: true,
      },
    };
    const out = normalizeInitializeParams(params);
    expect(out.enable_permanent_delegate).to.be.true;
    expect(out.enable_transfer_hook).to.be.false;
    expect(out.default_account_frozen).to.be.true;
  });

  it("normalizeInitializeParams with no preset or extensions defaults to SSS_1", () => {
    const out = normalizeInitializeParams(baseParams);
    expect(out.enable_permanent_delegate).to.be.false;
    expect(out.enable_transfer_hook).to.be.false;
    expect(out.default_account_frozen).to.be.false;
  });

  it("preset overrides extensions when both set", () => {
    const params: CreateStablecoinParams = {
      ...baseParams,
      preset: "SSS_1",
      extensions: {
        enablePermanentDelegate: true,
        enableTransferHook: true,
        defaultAccountFrozen: true,
      },
    };
    const out = normalizeInitializeParams(params);
    expect(out.enable_permanent_delegate).to.be.false;
    expect(out.enable_transfer_hook).to.be.false;
    expect(out.default_account_frozen).to.be.false;
  });
});
