import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  analyzeArchiveIntegrity,
  runArchiveIntegrityCli,
} from "../check-openspec-archive-integrity";

const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("analyzeArchiveIntegrity", () => {
  test("reports a stable finding when archive metadata is missing", () => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-07-10-valid-change";
    createValidArchive(archiveRoot, archive, { metadata: false });

    const result = analyzeArchiveIntegrity({ archiveRoot, waivers: [] });

    expect(result.findings).toEqual([
      {
        archive,
        file: `${archive}/.openspec.yaml`,
        message: "missing .openspec.yaml",
        ruleId: "metadata",
      },
    ]);
    expect(result.waivedFindings).toEqual([]);
  });

  test("fails closed when archive metadata cannot be parsed", () => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-07-10-invalid-metadata";
    createValidArchive(archiveRoot, archive, { metadataText: "schema: [\n" });

    const result = analyzeArchiveIntegrity({ archiveRoot, waivers: [] });

    expect(result.findings).toEqual([
      {
        archive,
        file: `${archive}/.openspec.yaml`,
        message: "invalid .openspec.yaml: metadata must be parseable YAML with schema: spec-driven and a valid YYYY-MM-DD created field",
        ruleId: "metadata",
      },
    ]);
  });

  test("fails closed when archive metadata names an unsupported schema", () => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-07-10-invalid-schema";
    createValidArchive(archiveRoot, archive, {
      metadataText: "schema: unknown\ncreated: 2026-07-10\n",
    });

    const result = analyzeArchiveIntegrity({ archiveRoot, waivers: [] });

    expect(result.findings).toEqual([
      {
        archive,
        file: `${archive}/.openspec.yaml`,
        message: "invalid .openspec.yaml: metadata must be parseable YAML with schema: spec-driven and a valid YYYY-MM-DD created field",
        ruleId: "metadata",
      },
    ]);
  });

  test.each([
    ["proposal.md", "required-proposal", "proposal.md"],
    ["design.md", "required-design", "design.md"],
    ["tasks.md", "required-tasks", "tasks.md"],
    ["specs/example/spec.md", "delta-spec", "specs/<capability>/spec.md"],
  ] as const)("reports missing required archive content: %s", (missingFile, ruleId, expectedFile) => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-07-10-missing-content";
    createValidArchive(archiveRoot, archive, { missingFile });

    const result = analyzeArchiveIntegrity({ archiveRoot, waivers: [] });

    expect(result.findings).toEqual([
      {
        archive,
        file: `${archive}/${expectedFile}`,
        message: `missing required archive content: ${expectedFile}`,
        ruleId,
      },
    ]);
  });

  test("reports an archive directory with an invalid name", () => {
    const archiveRoot = createFixtureRoot();
    const archive = "invalid-name";
    createValidArchive(archiveRoot, archive);

    const result = analyzeArchiveIntegrity({ archiveRoot, waivers: [] });

    expect(result.findings).toEqual([
      {
        archive,
        file: archive,
        message: "archive directory must match YYYY-MM-DD-<change-name>",
        ruleId: "archive-name",
      },
    ]);
  });

  test("reports incomplete tasks with their first location and count", () => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-07-10-incomplete-tasks";
    createValidArchive(archiveRoot, archive, {
      tasksText: "# Tasks\n\n- [ ] first smoke\n- [ ] second smoke\n",
    });

    const result = analyzeArchiveIntegrity({ archiveRoot, waivers: [] });

    expect(result.findings).toEqual([
      {
        archive,
        file: `${archive}/tasks.md`,
        line: 3,
        message: "archive contains 2 incomplete tasks",
        ruleId: "tasks-complete",
      },
    ]);
  });

  test("accepts an exact waiver without rewriting historical tasks", () => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-05-27-historical-change";
    const tasksText = "- [x] implementation\n- [ ] environment smoke not executed\n";
    createValidArchive(archiveRoot, archive, { tasksText });
    const tasksPath = join(archiveRoot, archive, "tasks.md");

    const result = analyzeArchiveIntegrity({
      archiveRoot,
      waivers: [{
        archive,
        reason: "The environment-only smoke predates the current archive gate.",
        residualRisk: "The historical environment smoke remains unverified.",
        ruleId: "tasks-complete",
      }],
    });

    expect(result.findings).toEqual([]);
    expect(result.waivedFindings).toEqual([
      {
        archive,
        file: `${archive}/tasks.md`,
        line: 2,
        message: "archive contains 1 incomplete task",
        ruleId: "tasks-complete",
        waiver: {
          reason: "The environment-only smoke predates the current archive gate.",
          residualRisk: "The historical environment smoke remains unverified.",
        },
      },
    ]);
    expect(readFileSync(tasksPath, "utf8")).toBe(tasksText);
  });

  test.each([
    ["missing reason", {
      archive: "2026-05-27-historical-change",
      reason: "",
      residualRisk: "Smoke remains unverified.",
      ruleId: "tasks-complete",
    }],
    ["missing residual risk", {
      archive: "2026-05-27-historical-change",
      reason: "Predates the gate.",
      residualRisk: "",
      ruleId: "tasks-complete",
    }],
    ["wildcard archive", {
      archive: "*",
      reason: "Predates the gate.",
      residualRisk: "Smoke remains unverified.",
      ruleId: "tasks-complete",
    }],
    ["wildcard rule", {
      archive: "2026-05-27-historical-change",
      reason: "Predates the gate.",
      residualRisk: "Smoke remains unverified.",
      ruleId: "*",
    }],
  ] as const)("rejects an invalid waiver: %s", (_label, waiver) => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-05-27-historical-change";
    createValidArchive(archiveRoot, archive, { tasksText: "- [ ] smoke\n" });

    const result = analyzeArchiveIntegrity({ archiveRoot, waivers: [waiver] as any });

    expect(result.findings).toContainEqual({
      archive: waiver.archive,
      file: "archive-integrity-waivers.json",
      message: "waiver 1 must use an exact archive name and waivable rule ID with non-empty reason and residualRisk",
      ruleId: "waiver-invalid",
    });
    expect(result.findings).toContainEqual({
      archive,
      file: `${archive}/tasks.md`,
      line: 1,
      message: "archive contains 1 incomplete task",
      ruleId: "tasks-complete",
    });
  });

  test("reports a valid waiver that no longer matches a finding", () => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-05-27-complete-change";
    createValidArchive(archiveRoot, archive);

    const result = analyzeArchiveIntegrity({
      archiveRoot,
      waivers: [{
        archive,
        reason: "The smoke once predated the gate.",
        residualRisk: "No residual risk remains after task completion.",
        ruleId: "tasks-complete",
      }],
    });

    expect(result.findings).toEqual([
      {
        archive,
        file: "archive-integrity-waivers.json",
        message: `waiver for ${archive}#tasks-complete does not match an active finding`,
        ruleId: "waiver-stale",
      },
    ]);
    expect(result.waivedFindings).toEqual([]);
  });
});

describe("runArchiveIntegrityCli", () => {
  test("returns a non-zero exit code and formats archive findings", () => {
    const archiveRoot = createFixtureRoot();
    const archive = "2026-07-10-cli-failure";
    createValidArchive(archiveRoot, archive, { metadata: false });
    const waiverPath = join(archiveRoot, "waivers.json");
    writeFileSync(waiverPath, JSON.stringify({ waivers: [] }));
    const stderr: string[] = [];

    const exitCode = runArchiveIntegrityCli({
      archiveRoot,
      stderr: message => stderr.push(message),
      stdout: () => {},
      waiverPath,
    });

    expect(exitCode).toBe(1);
    expect(stderr.join("\n")).toContain(
      `[metadata] ${archive}/.openspec.yaml: missing .openspec.yaml`,
    );
  });
});

function createFixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "openspec-archive-integrity-"));
  fixtureRoots.push(root);
  return root;
}

function createValidArchive(
  archiveRoot: string,
  archive: string,
  options: {
    metadata?: boolean;
    metadataText?: string;
    missingFile?: string;
    tasksText?: string;
  } = {},
): void {
  const root = join(archiveRoot, archive);
  mkdirSync(join(root, "specs", "example"), { recursive: true });
  writeFileSync(join(root, "proposal.md"), "# Proposal\n");
  writeFileSync(join(root, "design.md"), "# Design\n");
  writeFileSync(join(root, "tasks.md"), options.tasksText ?? "- [x] complete\n");
  writeFileSync(join(root, "specs", "example", "spec.md"), "# Example\n");

  if (options.metadata !== false) {
    writeFileSync(
      join(root, ".openspec.yaml"),
      options.metadataText ?? "schema: spec-driven\ncreated: 2026-07-10\n",
    );
  }

  if (options.missingFile) {
    rmSync(join(root, options.missingFile), { force: true });
  }
}
