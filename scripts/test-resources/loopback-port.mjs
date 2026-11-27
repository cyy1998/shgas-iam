import { execFileSync } from "node:child_process";
import process from "node:process";

export function resolveLoopbackPort(envKey) {
  const existing = process.env[envKey];
  if (existing) {
    const parsed = Number(existing);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) return parsed;
    throw new Error(`Invalid ${envKey}: "${existing}"`);
  }
  const output = execFileSync(
    process.execPath,
    [
      "-e",
      [
        'const net = require("node:net");',
        "const server = net.createServer();",
        'server.on("error", (error) => { console.error(error); process.exit(1); });',
        'server.listen(0, "127.0.0.1", () => {',
        "  const address = server.address();",
        '  if (!address || typeof address === "string") process.exit(1);',
        "  process.stdout.write(String(address.port));",
        "  server.close();",
        "});",
      ].join("\n"),
    ],
    { encoding: "utf8" },
  ).trim();
  const port = Number(output);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Failed to allocate loopback port for ${envKey}: "${output}"`);
  }
  process.env[envKey] = String(port);
  return port;
}
