import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(readFileSync(resolve(root, "src-tauri/tauri.conf.json"), "utf8"));
const cargoToml = readFileSync(resolve(root, "src-tauri/Cargo.toml"), "utf8");
const cargoVersion = cargoToml.match(/^version = "([^"]+)"$/m)?.[1];
const errors = [];

function requireCondition(condition, message) {
  if (!condition) errors.push(message);
}

requireCondition(packageJson.version === tauriConfig.version, "package.json and tauri.conf.json versions differ");
requireCondition(packageJson.version === cargoVersion, "package.json and Cargo.toml versions differ");
requireCondition(/^\d+\.\d+\.\d+$/.test(packageJson.version), "release version must use major.minor.patch");
requireCondition(tauriConfig.identifier === "com.aijadwali.desktop", "unexpected application identifier");
requireCondition(tauriConfig.bundle?.active === true, "Tauri bundle must be active");
requireCondition(tauriConfig.bundle?.windows?.allowDowngrades === false, "Windows downgrades must be blocked");
requireCondition(tauriConfig.bundle?.windows?.webviewInstallMode?.type === "offlineInstaller", "Windows WebView2 must use offline installer mode");
requireCondition(Array.isArray(tauriConfig.bundle?.icon) && tauriConfig.bundle.icon.length >= 4, "desktop icon set is incomplete");
requireCondition(!tauriConfig.app?.security?.csp?.includes("https:"), "CSP must not allow remote HTTPS content");

for (const icon of tauriConfig.bundle?.icon ?? []) {
  const path = resolve(root, "src-tauri", icon);
  requireCondition(existsSync(path) && statSync(path).size > 0, `missing or empty icon: ${icon}`);
}

if (errors.length) {
  for (const error of errors) process.stderr.write(`release verification failed: ${error}\n`);
  process.exit(1);
}

process.stdout.write(`release metadata verified: AI Jadwali Desktop ${packageJson.version}\n`);
