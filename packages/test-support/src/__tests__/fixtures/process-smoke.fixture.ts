import { spawn } from "node:child_process";

const descendant = `
  const timeout = setTimeout(() => process.exit(1), 15_000);
  process.once("SIGTERM", () => {
    clearTimeout(timeout);
    console.error("stopped " + process.pid);
  });
  console.log("ready " + process.pid);
`;

const child = spawn(process.execPath, ["-e", descendant], {
  detached: true,
  stdio: ["ignore", "pipe", "inherit"],
});
child.stdout.once("data", (chunk) => {
  process.stdout.write(chunk);
  process.exit(0);
});
