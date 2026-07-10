import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dirname, "..");

export type WaivableArchiveIntegrityRuleId =
  | "archive-name"
  | "metadata"
  | "required-proposal"
  | "required-design"
  | "required-tasks"
  | "delta-spec"
  | "tasks-complete";

export type ArchiveIntegrityRuleId = WaivableArchiveIntegrityRuleId | "waiver-invalid" | "waiver-stale";

export type ArchiveIntegrityFinding = {
  archive: string;
  ruleId: ArchiveIntegrityRuleId;
  file: string;
  message: string;
  line?: number;
};

export type ArchiveIntegrityWaiver = {
  archive: string;
  ruleId: WaivableArchiveIntegrityRuleId;
  reason: string;
  residualRisk: string;
};

export type ArchiveIntegrityResult = {
  findings: ArchiveIntegrityFinding[];
  waivedFindings: Array<ArchiveIntegrityFinding & {
    waiver: Pick<ArchiveIntegrityWaiver, "reason" | "residualRisk">;
  }>;
};

export function analyzeArchiveIntegrity(options: {
  archiveRoot: string;
  waivers: readonly unknown[];
  waiverFile?: string;
}): ArchiveIntegrityResult {
  const findings: ArchiveIntegrityFinding[] = [];
  const waiverFile = options.waiverFile ?? "archive-integrity-waivers.json";
  const waivers: ArchiveIntegrityWaiver[] = [];

  options.waivers.forEach((candidate, index) => {
    if (isValidWaiver(candidate)) {
      waivers.push(candidate);
      return;
    }

    findings.push({
      archive: waiverArchiveName(candidate, index),
      file: waiverFile,
      message: `waiver ${index + 1} must use an exact archive name and waivable rule ID with non-empty reason and residualRisk`,
      ruleId: "waiver-invalid",
    });
  });

  for (const archive of listArchiveDirectories(options.archiveRoot)) {
    const archivePath = join(options.archiveRoot, archive);
    if (!isValidArchiveName(archive)) {
      findings.push({
        archive,
        file: archive,
        message: "archive directory must match YYYY-MM-DD-<change-name>",
        ruleId: "archive-name",
      });
    }

    const metadataFile = `${archive}/.openspec.yaml`;
    const metadataPath = join(options.archiveRoot, metadataFile);
    if (!existsSync(metadataPath)) {
      findings.push({
        archive,
        file: metadataFile,
        message: "missing .openspec.yaml",
        ruleId: "metadata",
      });
    }
    else if (!hasValidMetadata(metadataPath)) {
      findings.push({
        archive,
        file: metadataFile,
        message: "invalid .openspec.yaml: metadata must be parseable YAML with schema: spec-driven and a valid YYYY-MM-DD created field",
        ruleId: "metadata",
      });
    }

    for (const required of [
      { file: "proposal.md", ruleId: "required-proposal" },
      { file: "design.md", ruleId: "required-design" },
      { file: "tasks.md", ruleId: "required-tasks" },
    ] as const) {
      if (!existsSync(join(archivePath, required.file))) {
        findings.push({
          archive,
          file: `${archive}/${required.file}`,
          message: `missing required archive content: ${required.file}`,
          ruleId: required.ruleId,
        });
      }
    }

    if (!hasDeltaSpec(archivePath)) {
      const file = "specs/<capability>/spec.md";
      findings.push({
        archive,
        file: `${archive}/${file}`,
        message: `missing required archive content: ${file}`,
        ruleId: "delta-spec",
      });
    }

    const tasksPath = join(archivePath, "tasks.md");
    if (existsSync(tasksPath)) {
      const incompleteTaskLines = readFileSync(tasksPath, "utf8")
        .split(/\r?\n/)
        .flatMap((line, index) => /^\s*-\s*\[ \]/.test(line) ? [index + 1] : []);

      if (incompleteTaskLines.length > 0) {
        findings.push({
          archive,
          file: `${archive}/tasks.md`,
          line: incompleteTaskLines[0],
          message: `archive contains ${incompleteTaskLines.length} incomplete ${incompleteTaskLines.length === 1 ? "task" : "tasks"}`,
          ruleId: "tasks-complete",
        });
      }
    }
  }

  const waivedFindings: ArchiveIntegrityResult["waivedFindings"] = [];
  const matchedWaivers = new Set<ArchiveIntegrityWaiver>();
  const activeFindings = findings.filter((finding) => {
    const waiver = waivers.find(candidate => candidate.archive === finding.archive
      && candidate.ruleId === finding.ruleId
      && candidate.reason.trim().length > 0
      && candidate.residualRisk.trim().length > 0);
    if (!waiver) return true;

    matchedWaivers.add(waiver);
    waivedFindings.push({
      ...finding,
      waiver: {
        reason: waiver.reason,
        residualRisk: waiver.residualRisk,
      },
    });
    return false;
  });

  for (const waiver of waivers) {
    if (matchedWaivers.has(waiver)) continue;

    activeFindings.push({
      archive: waiver.archive,
      file: waiverFile,
      message: `waiver for ${waiver.archive}#${waiver.ruleId} does not match an active finding`,
      ruleId: "waiver-stale",
    });
  }

  return { findings: activeFindings, waivedFindings };
}

export function runArchiveIntegrityCli(options: {
  archiveRoot?: string;
  waiverPath?: string;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
} = {}): number {
  const archiveRoot = options.archiveRoot ?? join(repoRoot, "openspec", "changes", "archive");
  const waiverPath = options.waiverPath ?? join(repoRoot, "openspec", "archive-integrity-waivers.json");
  const stdout = options.stdout ?? console.log;
  const stderr = options.stderr ?? console.error;

  let waivers: unknown[];
  try {
    waivers = parseWaiverFile(readFileSync(waiverPath, "utf8"));
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr(`OpenSpec archive integrity configuration failed: ${message}`);
    return 1;
  }

  const result = analyzeArchiveIntegrity({
    archiveRoot,
    waiverFile: "openspec/archive-integrity-waivers.json",
    waivers,
  });

  for (const waived of result.waivedFindings) {
    stdout(`OpenSpec archive integrity waiver: [${waived.ruleId}] ${formatFindingLocation(waived)}: ${waived.message}`);
  }

  if (result.findings.length > 0) {
    stderr("OpenSpec archive integrity failed:");
    for (const finding of result.findings) {
      stderr(`- [${finding.ruleId}] ${formatFindingLocation(finding)}: ${finding.message}`);
    }
    return 1;
  }

  stdout(`OpenSpec archive integrity passed: ${listArchiveDirectories(archiveRoot).length} archives checked.`);
  return 0;
}

function parseWaiverFile(text: string): unknown[] {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("waiver file must be a JSON object with a waivers array");
  }

  const waivers = Reflect.get(value, "waivers");
  if (!Array.isArray(waivers)) {
    throw new Error("waiver file must be a JSON object with a waivers array");
  }
  return waivers;
}

function formatFindingLocation(finding: ArchiveIntegrityFinding): string {
  return finding.line ? `${finding.file}:${finding.line}` : finding.file;
}

const waivableRuleIds = new Set<WaivableArchiveIntegrityRuleId>([
  "archive-name",
  "metadata",
  "required-proposal",
  "required-design",
  "required-tasks",
  "delta-spec",
  "tasks-complete",
]);

function isValidWaiver(candidate: unknown): candidate is ArchiveIntegrityWaiver {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;

  const archive = Reflect.get(candidate, "archive");
  const ruleId = Reflect.get(candidate, "ruleId");
  const reason = Reflect.get(candidate, "reason");
  const residualRisk = Reflect.get(candidate, "residualRisk");
  return typeof archive === "string" && isValidArchiveName(archive)
    && typeof ruleId === "string" && waivableRuleIds.has(ruleId as WaivableArchiveIntegrityRuleId)
    && typeof reason === "string" && reason.trim().length > 0
    && typeof residualRisk === "string" && residualRisk.trim().length > 0;
}

function waiverArchiveName(candidate: unknown, index: number): string {
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
    const archive = Reflect.get(candidate, "archive");
    if (typeof archive === "string" && archive.length > 0) return archive;
  }
  return `<waiver-${index + 1}>`;
}

function isValidArchiveName(archive: string): boolean {
  const match = archive.match(/^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/);
  return match !== null && isValidDate(match[1]);
}

function hasDeltaSpec(archivePath: string): boolean {
  const specsPath = join(archivePath, "specs");
  if (!existsSync(specsPath)) return false;

  return readdirSync(specsPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .some(entry => existsSync(join(specsPath, entry.name, "spec.md")));
}

function hasValidMetadata(metadataPath: string): boolean {
  try {
    const metadata = Bun.YAML.parse(readFileSync(metadataPath, "utf8"));
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return false;

    const schema = Reflect.get(metadata, "schema");
    const created = Reflect.get(metadata, "created");
    return schema === "spec-driven"
      && typeof created === "string" && isValidDate(created);
  }
  catch {
    return false;
  }
}

function isValidDate(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;

  const [, year, month, day] = match.map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function listArchiveDirectories(archiveRoot: string): string[] {
  if (!existsSync(archiveRoot)) return [];

  return readdirSync(archiveRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort();
}

if (import.meta.main) {
  process.exit(runArchiveIntegrityCli());
}
