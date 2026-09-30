import { spawn } from "node:child_process";
import { rename, writeFile } from "node:fs/promises";
import { createServer } from "node:net";

const [mode, readyPath] = process.argv.slice(2);
if (mode === "descendant") {
  const server = createServer();
  server.listen(0, "127.0.0.1", async () => {
    await writeFile(`${readyPath}.tmp`, JSON.stringify({ port: server.address().port }), "utf8");
    await rename(`${readyPath}.tmp`, readyPath);
  });
} else {
  const child = spawn(process.execPath, [import.meta.filename, "descendant", readyPath], {
    stdio: "inherit",
    windowsHide: true,
  });
  process.on("SIGINT", () => child.kill("SIGINT"));
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.once("error", (error) => {
    throw error;
  });
  child.once("exit", (code) => process.exit(code ?? 1));
}
