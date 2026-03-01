import { expect } from "chai";
import {
  mintBodySchema,
  burnBodySchema,
  freezeThawBodySchema,
  pauseUnpauseBodySchema,
  seizeBodySchema,
  rolesBodySchema,
} from "../src/schemas";

const VALID_MINT = "47TNsKC1iJvLTKYRMbfYjrod4a56YE1f4qv73hZkdWUZ";
const VALID_ADDR = "7dcFLm6QsT8Zo7MAXQFrmJaDDxf5RDZb7VuiHupuiNwZ";

describe("Validation schemas", () => {
  describe("mintBodySchema", () => {
    it("rejects missing recipient", () => {
      const r = mintBodySchema.safeParse({ amount: "1000" });
      expect(r.success).to.be.false;
    });

    it("rejects amount <= 0", () => {
      const r = mintBodySchema.safeParse({ recipient: VALID_ADDR, amount: "0" });
      expect(r.success).to.be.false;
    });

    it("rejects negative amount", () => {
      const r = mintBodySchema.safeParse({ recipient: VALID_ADDR, amount: "-1" });
      expect(r.success).to.be.false;
    });

    it("accepts valid mint body", () => {
      const r = mintBodySchema.safeParse({ recipient: VALID_ADDR, amount: "1000" });
      expect(r.success).to.be.true;
    });
  });

  describe("burnBodySchema", () => {
    it("rejects amount <= 0", () => {
      const r = burnBodySchema.safeParse({ amount: "0" });
      expect(r.success).to.be.false;
    });

    it("accepts valid burn body", () => {
      const r = burnBodySchema.safeParse({ amount: "100" });
      expect(r.success).to.be.true;
    });
  });

  describe("freezeThawBodySchema", () => {
    it("accepts with account", () => {
      const r = freezeThawBodySchema.safeParse({ mint: VALID_MINT, account: VALID_ADDR });
      expect(r.success).to.be.true;
    });

    it("accepts with owner", () => {
      const r = freezeThawBodySchema.safeParse({ mint: VALID_MINT, owner: VALID_ADDR });
      expect(r.success).to.be.true;
    });

    it("rejects missing mint", () => {
      const r = freezeThawBodySchema.safeParse({});
      expect(r.success).to.be.false;
    });
  });

  describe("pauseUnpauseBodySchema", () => {
    it("accepts valid body", () => {
      const r = pauseUnpauseBodySchema.safeParse({ mint: VALID_MINT });
      expect(r.success).to.be.true;
    });
  });

  describe("seizeBodySchema", () => {
    it("rejects missing from", () => {
      const r = seizeBodySchema.safeParse({ mint: VALID_MINT, to: VALID_ADDR, amount: "100" });
      expect(r.success).to.be.false;
    });

    it("rejects missing to", () => {
      const r = seizeBodySchema.safeParse({ mint: VALID_MINT, from: VALID_ADDR, amount: "100" });
      expect(r.success).to.be.false;
    });

    it("accepts valid seize body", () => {
      const r = seizeBodySchema.safeParse({ mint: VALID_MINT, from: VALID_ADDR, to: VALID_ADDR, amount: "100" });
      expect(r.success).to.be.true;
    });
  });

  describe("rolesBodySchema", () => {
    it("rejects missing holder", () => {
      const r = rolesBodySchema.safeParse({ mint: VALID_MINT, roles: { minter: true } });
      expect(r.success).to.be.false;
    });

    it("accepts valid roles body", () => {
      const r = rolesBodySchema.safeParse({
        mint: VALID_MINT,
        holder: VALID_ADDR,
        roles: { minter: true, burner: false },
      });
      expect(r.success).to.be.true;
    });
  });
});
