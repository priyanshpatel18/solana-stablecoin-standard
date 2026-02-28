/**
 * Pyth oracle helpers for stablecoin price conversions.
 * Uses Hermes REST API: https://hermes.pyth.network
 */

const DEFAULT_HERMES = "https://hermes.pyth.network";

export interface PythPrice {
  /** Raw price (e.g. 6140993501000 for BTC/USD) */
  price: string;
  /** Exponent (e.g. -8). Actual price = price * 10^expo */
  expo: number;
  /** Confidence interval (optional) */
  conf?: string;
  /** Publish timestamp (optional) */
  publish_time?: number;
}

/**
 * Fetch latest Pyth price for a feed.
 * @param feedId - Pyth price feed ID (hex, e.g. 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43)
 * @param endpoint - Hermes endpoint (default: https://hermes.pyth.network)
 * @returns Parsed price or null if not found
 */
export async function fetchPythPrice(
  feedId: string,
  endpoint: string = DEFAULT_HERMES
): Promise<PythPrice | null> {
  const id = feedId.startsWith("0x") ? feedId.slice(2) : feedId;
  const url = `${endpoint}/v2/updates/price/latest?ids[]=0x${id}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    parsed?: Array<{ id: string; price: { price: string; conf: string; expo: number; publish_time: number } }>;
  };
  const first = json.parsed?.[0];
  if (!first?.price) return null;
  return {
    price: first.price.price,
    expo: first.price.expo,
    conf: first.price.conf,
    publish_time: first.price.publish_time,
  };
}

/**
 * Get the numeric price from Pyth format: price * 10^expo
 */
export function pythPriceToNumber(p: PythPrice): number {
  const raw = Number(p.price);
  const exp = Math.pow(10, p.expo);
  return raw * exp;
}

/**
 * Convert USD amount to token base units using a Pyth price.
 * For a stablecoin priced at ~1 USD (e.g. USDC/USD), token base = usdAmount * 10^decimals.
 * For other feeds (e.g. BTC/USD), token base = (usdAmount / price) * 10^decimals.
 *
 * @param usdAmount - Amount in USD
 * @param price - Pyth price (e.g. from fetchPythPrice)
 * @param decimals - Token decimals (e.g. 6)
 * @returns Token amount in base units (bigint)
 */
export function usdToTokenAmount(
  usdAmount: number,
  price: PythPrice,
  decimals: number
): bigint {
  const priceNum = pythPriceToNumber(price);
  if (priceNum <= 0) throw new Error("Invalid price: must be positive");
  const tokenAmount = usdAmount / priceNum;
  const factor = BigInt(10 ** decimals);
  return BigInt(Math.floor(tokenAmount * 10 ** decimals));
}

/**
 * Convert token base units to USD using a Pyth price.
 *
 * @param tokenAmount - Token amount in base units (bigint)
 * @param price - Pyth price (e.g. from fetchPythPrice)
 * @param decimals - Token decimals (e.g. 6)
 * @returns USD value (number)
 */
export function tokenAmountToUsd(
  tokenAmount: bigint,
  price: PythPrice,
  decimals: number
): number {
  const priceNum = pythPriceToNumber(price);
  const tokenNum = Number(tokenAmount) / 10 ** decimals;
  return tokenNum * priceNum;
}
