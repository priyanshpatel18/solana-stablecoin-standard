import { expect } from "chai";
import {
  getUserFacingMessage,
  getErrorMessage,
  parseProgramErrorFromError,
  parseAnchorErrorCode,
  parseProgramError,
  validateMintAmount,
  validateBurnAmount,
  StablecoinErrorCode,
} from "../src/errors";

describe("Error mapping", () => {
  describe("getUserFacingMessage", () => {
    it("returns friendly message for known codes 6000-6014", () => {
      expect(getUserFacingMessage(6000)).to.include("Unauthorized");
      expect(getUserFacingMessage(6001)).to.include("paused");
      expect(getUserFacingMessage(6002)).to.include("Compliance");
      expect(getUserFacingMessage(6003)).to.include("already blacklisted");
      expect(getUserFacingMessage(6004)).to.include("not blacklisted");
      expect(getUserFacingMessage(6005)).to.include("quota");
      expect(getUserFacingMessage(6006)).to.include("greater than zero");
      expect(getUserFacingMessage(6007)).to.include("Name");
      expect(getUserFacingMessage(6008)).to.include("Symbol");
      expect(getUserFacingMessage(6009)).to.include("URI");
      expect(getUserFacingMessage(6010)).to.include("Reason");
      expect(getUserFacingMessage(6011)).to.include("blacklisted");
      expect(getUserFacingMessage(6012)).to.include("overflow");
      expect(getUserFacingMessage(6013)).to.include("role");
      expect(getUserFacingMessage(6014)).to.include("Supply cap");
    });

    it("returns fallback for unknown code", () => {
      expect(getUserFacingMessage(9999)).to.equal("Program error 9999");
    });
  });

  describe("parseAnchorErrorCode", () => {
    it("extracts code from log line", () => {
      const logs = ["Error Code: 6006. Error Number: 6006."];
      expect(parseAnchorErrorCode(logs)).to.equal(6006);
    });

    it("returns null for empty logs", () => {
      expect(parseAnchorErrorCode([])).to.be.null;
    });
  });

  describe("parseProgramError", () => {
    it("returns friendly message for known code", () => {
      const logs = ["Error Code: 6006. Error Message: Zero amount."];
      expect(parseProgramError(logs)).to.include("greater than zero");
    });

    it("returns null when no code in logs", () => {
      expect(parseProgramError(["Program log: something"])).to.be.null;
    });
  });

  describe("parseProgramErrorFromError", () => {
    it("extracts and maps program error from Error message", () => {
      const err = new Error("Transaction failed\nError Code: 6001. Error Message: Paused.");
      expect(parseProgramErrorFromError(err)).to.include("paused");
    });

    it("returns null for non-program Error", () => {
      const err = new Error("Something else");
      expect(parseProgramErrorFromError(err)).to.be.null;
    });
  });

  describe("getErrorMessage", () => {
    it("returns friendly message for program error", () => {
      const err = new Error("Error Code: 6006. Error Message: Zero amount.");
      expect(getErrorMessage(err)).to.include("greater than zero");
    });

    it("returns role-friendly message for Anchor 3003 + role", () => {
      const err = new Error("AnchorError caused by account: role. Error Code: AccountDidNotDeserialize. Error Number: 3003.");
      expect(getErrorMessage(err)).to.include("wallet does not have a role");
    });

    it("returns original message for non-Error", () => {
      expect(getErrorMessage("plain string")).to.equal("plain string");
    });

    it("returns original message when no mapping", () => {
      const err = new Error("Generic failure");
      expect(getErrorMessage(err)).to.equal("Generic failure");
    });
  });

  describe("validateMintAmount", () => {
    it("returns error for zero", () => {
      expect(validateMintAmount(0)).to.equal("Amount must be greater than zero");
      expect(validateMintAmount("0")).to.equal("Amount must be greater than zero");
      expect(validateMintAmount(0n)).to.equal("Amount must be greater than zero");
    });

    it("returns error for negative", () => {
      expect(validateMintAmount(-1)).to.equal("Amount must be greater than zero");
    });

    it("returns null for positive", () => {
      expect(validateMintAmount(1)).to.be.null;
      expect(validateMintAmount("1000")).to.be.null;
      expect(validateMintAmount(1n)).to.be.null;
    });
  });

  describe("validateBurnAmount", () => {
    it("returns error for zero", () => {
      expect(validateBurnAmount(0)).to.equal("Amount must be greater than zero");
    });

    it("returns null for positive", () => {
      expect(validateBurnAmount(1)).to.be.null;
    });
  });
});
