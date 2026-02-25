import { PublicKey } from "@solana/web3.js";

export interface StablecoinExtensions {
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
}

export const Presets = {
  SSS_1: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
  } as StablecoinExtensions,

  SSS_2: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: true,
  } as StablecoinExtensions,
} as const;

export type PresetName = keyof typeof Presets;

export interface CreateStablecoinParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  preset?: PresetName;
  extensions?: Partial<StablecoinExtensions>;
}

export interface InitializeParams {
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enable_permanent_delegate: boolean;
  enable_transfer_hook: boolean;
  default_account_frozen: boolean;
}

export interface RoleFlags {
  isMinter: boolean;
  isBurner: boolean;
  isPauser: boolean;
  isBlacklister: boolean;
  isSeizer: boolean;
}

export interface StablecoinStateType {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enable_permanent_delegate: boolean;
  enable_transfer_hook: boolean;
  default_account_frozen: boolean;
  paused: boolean;
  total_minted: bigint;
  total_burned: bigint;
  bump: number;
}

export interface RoleAccount {
  stablecoin: PublicKey;
  holder: PublicKey;
  roles: RoleFlags;
  bump: number;
}

export interface MinterInfo {
  stablecoin: PublicKey;
  minter: PublicKey;
  quota: bigint;
  minted_amount: bigint;
  bump: number;
}

export interface MintParams {
  recipient: PublicKey;
  amount: bigint;
  minter: PublicKey;
}

export interface BurnParams {
  amount: bigint;
}

export interface UpdateRolesParams {
  holder: PublicKey;
  roles: RoleFlags;
}

export interface UpdateMinterParams {
  minter: PublicKey;
  quota: bigint;
}

export function normalizeInitializeParams(
  params: CreateStablecoinParams
): InitializeParams {
  let ext: StablecoinExtensions;
  if (params.preset === "SSS_1" || params.preset === "SSS_2") {
    ext = Presets[params.preset];
  } else if (params.extensions) {
    ext = {
      enablePermanentDelegate: params.extensions.enablePermanentDelegate ?? false,
      enableTransferHook: params.extensions.enableTransferHook ?? false,
      defaultAccountFrozen: params.extensions.defaultAccountFrozen ?? false,
    };
  } else {
    ext = Presets.SSS_1;
  }
  return {
    name: params.name,
    symbol: params.symbol,
    uri: params.uri,
    decimals: params.decimals,
    enable_permanent_delegate: ext.enablePermanentDelegate,
    enable_transfer_hook: ext.enableTransferHook,
    default_account_frozen: ext.defaultAccountFrozen,
  };
}
