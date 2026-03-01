import { expect } from "chai";
import {
  ComplianceNotEnabledError,
  parseAnchorErrorCode,
  parseProgramError,
  getUserFacingMessage,
  StablecoinErrorCode,
} from "../src/errors";

describe("Compliance gating and errors", () => {
  it("ComplianceNotEnabledError has correct message and name", () => {
    const err = new ComplianceNotEnabledError();
    expect(err.message).to.include("Compliance module");
    expect(err.message).to.include("SSS-2");
    expect(err.name).to.equal("ComplianceNotEnabledError");
  });

  it("parseAnchorErrorCode extracts code from log line", () => {
    const logs = [
      "Program log: AnchorError thrown in program.",
      "Error Code: 6002. Error Number: 6002. Error Message: Compliance module not enabled.",
    ];
    expect(parseAnchorErrorCode(logs)).to.equal(6002);
  });

  it("parseAnchorErrorCode returns null when no error code", () => {
    expect(parseAnchorErrorCode([])).to.be.null;
    expect(parseAnchorErrorCode(["Program log: something"])).to.be.null;
  });

  it("StablecoinErrorCode has expected compliance code", () => {
    expect(StablecoinErrorCode.ComplianceNotEnabled).to.equal(6002);
    expect(StablecoinErrorCode.Unauthorized).to.equal(6000);
    expect(StablecoinErrorCode.Paused).to.equal(6001);
  });

  it("StablecoinErrorCode has all documented values", () => {
    expect(StablecoinErrorCode.Unauthorized).to.equal(6000);
    expect(StablecoinErrorCode.Paused).to.equal(6001);
    expect(StablecoinErrorCode.ComplianceNotEnabled).to.equal(6002);
    expect(StablecoinErrorCode.AlreadyBlacklisted).to.equal(6003);
    expect(StablecoinErrorCode.NotBlacklisted).to.equal(6004);
    expect(StablecoinErrorCode.QuotaExceeded).to.equal(6005);
    expect(StablecoinErrorCode.ZeroAmount).to.equal(6006);
    expect(StablecoinErrorCode.NameTooLong).to.equal(6007);
    expect(StablecoinErrorCode.SymbolTooLong).to.equal(6008);
    expect(StablecoinErrorCode.UriTooLong).to.equal(6009);
    expect(StablecoinErrorCode.ReasonTooLong).to.equal(6010);
    expect(StablecoinErrorCode.Blacklisted).to.equal(6011);
    expect(StablecoinErrorCode.MathOverflow).to.equal(6012);
    expect(StablecoinErrorCode.InvalidRoleConfig).to.equal(6013);
    expect(StablecoinErrorCode.SupplyCapExceeded).to.equal(6014);
  });

  it("parseAnchorErrorCode returns first match when multiple codes in logs", () => {
    const logs = [
      "Program log: AnchorError thrown in program.",
      "Error Code: 6000. Error Message: Unauthorized.",
      "Error Code: 6002. Error Message: Compliance not enabled.",
    ];
    expect(parseAnchorErrorCode(logs)).to.equal(6000);
  });

  it("ComplianceNotEnabledError used for disabled compliance operations", () => {
    const err = new ComplianceNotEnabledError();
    expect(err).to.be.instanceOf(Error);
    expect(err).to.be.instanceOf(ComplianceNotEnabledError);
    expect(err.message).to.include("SSS-2");
  });

  it("parseProgramError maps blacklist codes to readable messages", () => {
    expect(parseProgramError(["Error Code: 6003."])).to.include("already blacklisted");
    expect(parseProgramError(["Error Code: 6004."])).to.include("not blacklisted");
    expect(parseProgramError(["Error Code: 6011."])).to.include("blacklisted");
    expect(getUserFacingMessage(6003)).to.include("already blacklisted");
  });
});
