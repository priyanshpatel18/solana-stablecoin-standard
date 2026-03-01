import { expect } from "chai";
import {
  addAuditEntry,
  getAuditLog,
  getBlacklist,
  addToBlacklistStore,
  removeFromBlacklistStore,
  isAddressBlocked,
} from "../src/compliance";

describe("Compliance", () => {
  const MINT = "47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ";
  const ADDR1 = "7dcFLm6QsT8Zo7MAXQFrmJaDDxf5RDZb7VuiHupuiNwZ";
  const ADDR2 = "AnotherAddr111111111111111111111111111111";

  describe("Blacklist", () => {
    it("addToBlacklistStore adds entry", () => {
      addToBlacklistStore(MINT, ADDR1, "test");
      const list = getBlacklist(MINT);
      expect(list).to.have.lengthOf(1);
      expect(list[0].address).to.equal(ADDR1);
      expect(list[0].reason).to.equal("test");
    });

    it("addToBlacklistStore does not duplicate", () => {
      addToBlacklistStore(MINT, ADDR1, "other");
      const list = getBlacklist(MINT);
      expect(list).to.have.lengthOf(1);
    });

    it("removeFromBlacklistStore removes entry", () => {
      addToBlacklistStore(MINT, ADDR2);
      removeFromBlacklistStore(MINT, ADDR2);
      const list = getBlacklist(MINT);
      expect(list.filter((e) => e.address === ADDR2)).to.have.lengthOf(0);
    });

    it("getBlacklist returns empty for unknown mint", () => {
      const list = getBlacklist("unknown_mint_xyz");
      expect(list).to.deep.equal([]);
    });
  });

  describe("Audit log", () => {
    it("addAuditEntry and getAuditLog", () => {
      addAuditEntry({ type: "mint", signature: "sig1", mint: MINT, address: ADDR1, amount: "100", actor: ADDR1 });
      const entries = getAuditLog({});
      expect(entries.length).to.be.greaterThan(0);
      const mintEntry = entries.find((e) => e.type === "mint" && e.signature === "sig1");
      expect(mintEntry).to.exist;
      expect(mintEntry?.mint).to.equal(MINT);
    });

    it("getAuditLog filters by action", () => {
      addAuditEntry({ type: "burn", signature: "sig2", mint: MINT, address: ADDR1, amount: "50", actor: ADDR1 });
      const entries = getAuditLog({ action: "burn" });
      expect(entries.every((e) => e.type === "burn")).to.be.true;
    });

    it("getAuditLog filters by mint", () => {
      const entries = getAuditLog({ mint: MINT });
      expect(entries.every((e) => e.mint === MINT)).to.be.true;
    });
  });

  describe("isAddressBlocked", () => {
    it("returns true for blacklisted address", async () => {
      addToBlacklistStore(MINT, ADDR1);
      const blocked = await isAddressBlocked(MINT, ADDR1);
      expect(blocked).to.be.true;
    });

    it("returns false for non-blacklisted address", async () => {
      const blocked = await isAddressBlocked(MINT, "NonBlacklisted111111111111111111111111");
      expect(blocked).to.be.false;
    });
  });
});
