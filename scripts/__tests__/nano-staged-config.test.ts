import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";
import { tmpdir } from "node:os";
import nanoStaged from "nano-staged";

import config, {
  OPEN_SPEC_CHECK_COMMAND,
  OPEN_SPEC_SENSITIVE_PATTERN,
} from "../../nano-staged.mjs";

const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("nano-staged OpenSpec routing", () => {
  test("uses one composite pattern and returns one filename-free command", () => {
    expect(Object.keys(config)).toEqual([OPEN_SPEC_SENSITIVE_PATTERN]);

    const command = config[OPEN_SPEC_SENSITIVE_PATTERN];
    expect(typeof command).toBe("function");
    expect(command({
      filenames: [
        "/repo/openspec/specs/example/spec.md",
        "/repo/package.json",
      ],
      type: "staged",
    })).toBe(OPEN_SPEC_CHECK_COMMAND);
    expect(OPEN_SPEC_CHECK_COMMAND).toBe("pnpm run check:openspec --staged");
  });

  test("matches nested OpenSpec files through nano-staged's public runner", async () => {
    const root = createGitFixture("openspec/specs/example/spec.md");
    let matchedFilenames: string[] = [];

    await nanoStaged({
      allowEmpty: true,
      config: {
        [OPEN_SPEC_SENSITIVE_PATTERN]: ({ filenames }) => {
          matchedFilenames = filenames;
          return "node -e \"\"";
        },
      },
      cwd: root,
      quiet: true,
      stream: new Writable({ write: (_chunk, _encoding, callback) => callback() }),
    });

    expect(matchedFilenames).toEqual([join(root, "openspec/specs/example/spec.md")]);
  });
});

function createGitFixture(file: string): string {
  const root = mkdtempSync(join(tmpdir(), "nano-staged-routing-"));
  fixtureRoots.push(root);
  const target = join(root, file);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, "staged\n");

  for (const args of [["init", "--quiet"], ["add", file]]) {
    const result = Bun.spawnSync({ cmd: ["git", ...args], cwd: root });
    if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  }
  return root;
}
