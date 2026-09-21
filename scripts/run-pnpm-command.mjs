import { spawnSync } from "node:child_process";
import process from "node:process";

export function runPnpmCommand(pnpmCli, args) {
  const isJavaScriptEntry = /\.[cm]?js$/i.test(pnpmCli);
  return spawnSync(isJavaScriptEntry ? process.execPath : pnpmCli, isJavaScriptEntry ? [pnpmCli, ...args] : args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
}
