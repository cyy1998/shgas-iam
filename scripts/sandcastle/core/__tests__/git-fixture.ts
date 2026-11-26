import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { command } from "../command.ts";

export async function commit(cwd: string, file: string, value: string) {
  await writeFile(join(cwd, file), value);
  await command("git", ["add", "--", file], cwd);
  await command("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", value], cwd);
  return command("git", ["rev-parse", "HEAD"], cwd);
}
