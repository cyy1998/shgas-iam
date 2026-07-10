import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import {
  classifyStagedOpenSpecScope,
  runOpenSpecChecks,
} from "../check-openspec";

describe("classifyStagedOpenSpecScope", () => {
  test("routes only OpenSpec-sensitive staged paths to the full check", () => {
    expect(classifyStagedOpenSpecScope({
      staged: ["apps/api/src/routes/open/handlers.ts"],
      unstaged: [],
      untracked: [],
    })).toEqual({
      allowed: true,
      conflicts: [],
      shouldRun: false,
    });

    expect(classifyStagedOpenSpecScope({
      staged: ["openspec/specs/example/spec.md"],
      unstaged: [],
      untracked: [],
    })).toEqual({
      allowed: true,
      conflicts: [],
      shouldRun: true,
    });
  });

  test("fails closed when sensitive files remain outside the staged snapshot", () => {
    expect(classifyStagedOpenSpecScope({
      staged: ["openspec/specs/example/spec.md"],
      unstaged: [
        "apps/api/src/index.ts",
        "scripts/check-openspec-archive-integrity.ts",
      ],
      untracked: [
        "docs/notes.md",
        "openspec/changes/untracked-change/proposal.md",
      ],
    })).toEqual({
      allowed: false,
      conflicts: [
        "openspec/changes/untracked-change/proposal.md",
        "scripts/check-openspec-archive-integrity.ts",
      ],
      shouldRun: true,
    });
  });
});

describe("runOpenSpecChecks", () => {
  test("preserves strict and archive failures in one aggregate result", async () => {
    const output: string[] = [];

    const exitCode = await runOpenSpecChecks({
      dependencies: {
        readGitPaths: async () => ({ staged: [], unstaged: [], untracked: [] }),
        runArchiveIntegrity: async () => ({
          exitCode: 1,
          stderr: "archive integrity finding",
          stdout: "",
        }),
        runStrictValidation: async () => ({
          exitCode: 1,
          stderr: "strict validation finding",
          stdout: "",
        }),
      },
      stderr: message => output.push(message),
      stdout: message => output.push(message),
    });

    expect(exitCode).toBe(1);
    expect(output.join("\n")).toContain("strict validation finding");
    expect(output.join("\n")).toContain("archive integrity finding");
  });

  test("starts the real staged CLI without initialization errors", async () => {
    const repoRoot = join(import.meta.dirname, "..", "..");
    const subprocess = Bun.spawn({
      cmd: [process.execPath, "scripts/check-openspec.ts", "--staged"],
      cwd: repoRoot,
      stderr: "pipe",
      stdout: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
      subprocess.exited,
      new Response(subprocess.stdout).text(),
      new Response(subprocess.stderr).text(),
    ]);

    expect({ exitCode, stderr, stdout }).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "OpenSpec staged check skipped: no sensitive staged paths.\n",
    });
  });
});
