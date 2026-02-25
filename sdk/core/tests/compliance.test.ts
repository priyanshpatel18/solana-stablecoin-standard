import { expect } from "chai";
import { ComplianceNotEnabledError, parseAnchorErrorCode, StablecoinErrorCode } from "../src/errors";

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
});
