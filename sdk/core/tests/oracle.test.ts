import { expect } from "chai";
import {
  pythPriceToNumber,
  usdToTokenAmount,
  tokenAmountToUsd,
  type PythPrice,
} from "../src/oracle";

describe("Oracle (Pyth helpers)", () => {
  describe("pythPriceToNumber", () => {
    it("converts price with expo -8", () => {
      const p: PythPrice = { price: "6140993501000", expo: -8 };
      expect(pythPriceToNumber(p)).to.be.closeTo(61409.93501, 1e-5);
    });

    it("converts USDC/USD ~1", () => {
      const p: PythPrice = { price: "100000000", expo: -8 };
      expect(pythPriceToNumber(p)).to.be.closeTo(1.0, 1e-5);
    });
  });

  describe("usdToTokenAmount", () => {
    it("converts 100 USD to token base (6 decimals, price=1)", () => {
      const p: PythPrice = { price: "100000000", expo: -8 };
      expect(usdToTokenAmount(100, p, 6)).to.equal(BigInt(100_000_000));
    });

    it("converts 1000 USD to token base (6 decimals)", () => {
      const p: PythPrice = { price: "100000000", expo: -8 };
      expect(usdToTokenAmount(1000, p, 6)).to.equal(BigInt(1_000_000_000));
    });
  });

  describe("tokenAmountToUsd", () => {
    it("converts token base to USD (6 decimals, price=1)", () => {
      const p: PythPrice = { price: "100000000", expo: -8 };
      expect(tokenAmountToUsd(BigInt(100_000_000), p, 6)).to.be.closeTo(100, 1e-5);
    });

    it("round-trip usdToTokenAmount -> tokenAmountToUsd", () => {
      const p: PythPrice = { price: "100000000", expo: -8 };
      const usd = 250.5;
      const token = usdToTokenAmount(usd, p, 6);
      const back = tokenAmountToUsd(token, p, 6);
      expect(back).to.be.closeTo(usd, 1e-5);
    });
  });
});
