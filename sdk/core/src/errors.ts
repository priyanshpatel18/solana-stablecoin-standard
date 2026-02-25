export const StablecoinErrorCode = {
  Unauthorized: 6000,
  Paused: 6001,
  ComplianceNotEnabled: 6002,
  AlreadyBlacklisted: 6003,
  NotBlacklisted: 6004,
  QuotaExceeded: 6005,
  ZeroAmount: 6006,
  NameTooLong: 6007,
  SymbolTooLong: 6008,
  UriTooLong: 6009,
  ReasonTooLong: 6010,
  Blacklisted: 6011,
  MathOverflow: 6012,
  InvalidRoleConfig: 6013,
} as const;

export class ComplianceNotEnabledError extends Error {
  constructor() {
    super(
      "Compliance module is not enabled for this stablecoin (SSS-2 required)."
    );
    this.name = "ComplianceNotEnabledError";
  }
}

export function parseAnchorErrorCode(logs: string[]): number | null {
  const withCode = logs.find((l) => l.includes("Error Code: "));
  if (!withCode) return null;
  const match = withCode.match(/Error Code: (\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
