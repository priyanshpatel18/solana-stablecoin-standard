import * as fs from "fs";
import * as path from "path";

export interface TuiConfig {
  mint?: string;
  backendUrl?: string;
}

function getConfigPath(): string {
  const xdg = process.env.XDG_CONFIG_HOME;
  const home = process.env.HOME || process.env.USERPROFILE || "";
  const base = xdg ? path.join(xdg, "sss-tui") : path.join(home, ".config", "sss-tui");
  return path.join(base, "config.json");
}

export function loadConfig(): TuiConfig {
  try {
    const p = getConfigPath();
    const raw = fs.readFileSync(p, "utf-8");
    const data = JSON.parse(raw) as TuiConfig;
    return data;
  } catch {
    return {};
  }
}

export function saveConfig(config: Partial<TuiConfig>): void {
  try {
    const p = getConfigPath();
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const existing = loadConfig();
    const merged = { ...existing, ...config };
    fs.writeFileSync(p, JSON.stringify(merged, null, 2), "utf-8");
  } catch {
    // ignore write failures (e.g. read-only fs)
  }
}
