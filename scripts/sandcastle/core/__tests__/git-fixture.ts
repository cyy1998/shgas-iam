import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { command } from "../command.ts";

export async function commit(cwd: string, file: string, value: string) {
  await writeFile(join(cwd, file), value);
  await command("git", ["add", "--", file], cwd);
  await command("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", value], cwd);
  return command("git", ["rev-parse", "HEAD"], cwd);
}

export async function withGitTrace<T>(
  tracePath: string,
  run: (controls: {
    start: () => void;
    readCommands: () => Promise<string[][]>;
    reset: () => Promise<void>;
  }) => Promise<T>,
  autoStart = true,
): Promise<T> {
  const variable = "GIT_TRACE2_EVENT";
  const previous = process.env[variable];
  const start = () => {
    process.env[variable] = tracePath;
  };
  const readCommands = async (): Promise<string[][]> => {
    const contents = await readFile(tracePath, "utf8");
    return contents
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter(({ event }) => event === "start")
      .map(({ argv }) => argv);
  };
  const reset = () => writeFile(tracePath, "");
  if (autoStart) start();
  try {
    return await run({ start, readCommands, reset });
  } finally {
    if (previous === undefined) delete process.env[variable];
    else process.env[variable] = previous;
  }
}
