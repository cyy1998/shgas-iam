import type { RebuildUserProfileJobPayload, UserProfileJobName } from "@iam/contracts";
import type { JobQueue } from "@iam/jobs";
import type {
  UserProfileJobProducer,
  UserProfileRebuildJobQueuePort,
} from "../user-profile-job.producer";
import { resolve } from "node:path";
import { UserProfileDirtyReason } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";
import ts from "typescript";
import { createUserProfileJobProducer } from "../user-profile-job.producer";

type IsEqual<TActual, TExpected> = (
  <T>() => T extends TActual ? 1 : 2
) extends (
  <T>() => T extends TExpected ? 1 : 2
) ? true : false;
type Assert<T extends true> = T;
type _ProducerRuntimeSurfaceIsBulkRebuildOnly = Assert<
  IsEqual<keyof UserProfileJobProducer, "enqueueRebuildJobs">
>;
type _ProducerQueuePortIsAddBulkOnly = Assert<
  IsEqual<keyof UserProfileRebuildJobQueuePort, "addBulk">
>;
type _BullMqQueueSatisfiesProducerPort = Assert<
  JobQueue<
    RebuildUserProfileJobPayload,
    unknown,
    UserProfileJobName
  > extends UserProfileRebuildJobQueuePort
    ? true
    : false
>;

const PRODUCER_EXPORT_ALLOWLIST = [
  "CreateUserProfileInvalidationDeps",
  "UserProfileInvalidation",
  "UserProfileJobProducer",
  "UserProfileRebuildJobQueuePort",
  "UserProfileSourceChange",
  "createUserProfileInvalidation",
  "createUserProfileJobProducer",
];
const RETIRED_USER_PROFILE_EXPORT_PATTERN
  = /^(?:ExpandUserProfileScope.*|UserProfileScope.*|.*ScopeExpansionCompatibility.*|UserProfileDirtyMarker|createUserProfileDirtyMarker)$/u;

function createQueue() {
  return {
    addBulk: mock(async (jobs: Array<{ opts: { jobId: string } }>) => jobs.map(job => ({
      id: job.opts.jobId,
    }))),
  };
}

describe("createUserProfileJobProducer", () => {
  test("exposes only the exact producer TypeScript surface", () => {
    expect(collectModuleExportNames(resolve(import.meta.dir, "../producer.ts"))).toEqual(
      PRODUCER_EXPORT_ALLOWLIST,
    );
  });

  test("detects a legacy type-only marker export", () => {
    const exports = collectModuleExportNames(
      resolve(import.meta.dir, "synthetic-producer.ts"),
      `
        export interface UserProfileDirtyMarker {
          markUsersDirty: () => Promise<void>;
        }
      `,
    );

    expect(exports.filter(name => !PRODUCER_EXPORT_ALLOWLIST.includes(name))).toEqual([
      "UserProfileDirtyMarker",
    ]);
  });

  test("keeps retired marker, scope protocol, producer, and consumer names out of production exports", () => {
    const moduleFiles = [
      resolve(import.meta.dir, "../index.ts"),
      resolve(import.meta.dir, "../producer.ts"),
      resolve(import.meta.dir, "../worker.ts"),
      resolve(import.meta.dir, "../../../contracts/src/index.ts"),
      resolve(import.meta.dir, "../../../contracts/src/jobs/user-profile.ts"),
      resolve(import.meta.dir, "../../../jobs/src/index.ts"),
    ];
    const exportsByFile = collectModuleExportNamesByFile(moduleFiles);
    const retiredExports = moduleFiles.flatMap(file =>
      (exportsByFile.get(canonicalPath(file)) ?? [])
        .filter(name => RETIRED_USER_PROFILE_EXPORT_PATTERN.test(name))
        .map(name => `${file}: ${name}`));
    const jobsFile = resolve(import.meta.dir, "../../../jobs/src/index.ts");
    const jobsExports = exportsByFile.get(canonicalPath(jobsFile)) ?? [];

    expect(retiredExports).toEqual([]);
    expect(jobsExports).not.toContain("createUserProfileJobProducer");
  });

  test("exposes only bulk rebuild delivery at runtime", () => {
    const producer = createUserProfileJobProducer(createQueue());

    expect(Object.keys(producer)).toEqual(["enqueueRebuildJobs"]);
  });

  test("validates and bulk-enqueues rebuild payloads with versioned job ids", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue);

    await expect(producer.enqueueRebuildJobs([
      {
        userId: 123,
        dirtyVersion: "42",
        reason: UserProfileDirtyReason.UserUpdated,
        requestedAt: "2026-07-25T10:30:00.000Z",
        requestId: "request-42",
        traceId: "trace-42",
      },
      { userId: 123, dirtyVersion: "43", reason: UserProfileDirtyReason.UserUpdated },
    ])).resolves.toEqual({
      enqueued: 2,
      jobIds: ["rebuild-user-profile|123|42", "rebuild-user-profile|123|43"],
    });

    expect(queue.addBulk).toHaveBeenCalledWith([
      {
        name: "rebuild-user-profile",
        data: {
          userId: 123,
          dirtyVersion: "42",
          reason: "user-updated",
          requestedAt: "2026-07-25T10:30:00.000Z",
          requestId: "request-42",
          traceId: "trace-42",
        },
        opts: { jobId: "rebuild-user-profile|123|42" },
      },
      {
        name: "rebuild-user-profile",
        data: { userId: 123, dirtyVersion: "43", reason: "user-updated" },
        opts: { jobId: "rebuild-user-profile|123|43" },
      },
    ]);
  });

  test("rejects invalid payloads before enqueueing", async () => {
    const queue = createQueue();
    const producer = createUserProfileJobProducer(queue);

    await expect(producer.enqueueRebuildJobs([{
      userId: 0,
      dirtyVersion: "1",
      reason: UserProfileDirtyReason.UserUpdated,
    }])).rejects.toThrow();

    expect(queue.addBulk).not.toHaveBeenCalled();
  });
});

function collectModuleExportNames(fileName: string, sourceText?: string) {
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
  };
  const host = ts.createCompilerHost(compilerOptions);
  if (sourceText !== undefined) {
    const canonicalFileName = canonicalPath(fileName);
    const originalFileExists = host.fileExists.bind(host);
    const originalGetSourceFile = host.getSourceFile.bind(host);
    const originalReadFile = host.readFile.bind(host);
    host.fileExists = candidate =>
      canonicalPath(candidate) === canonicalFileName || originalFileExists(candidate);
    host.readFile = candidate =>
      canonicalPath(candidate) === canonicalFileName ? sourceText : originalReadFile(candidate);
    host.getSourceFile = (candidate, languageVersion, onError, shouldCreateNewSourceFile) =>
      canonicalPath(candidate) === canonicalFileName
        ? ts.createSourceFile(candidate, sourceText, languageVersion, true)
        : originalGetSourceFile(candidate, languageVersion, onError, shouldCreateNewSourceFile);
  }

  const program = ts.createProgram({ rootNames: [fileName], options: compilerOptions, host });
  return collectProgramModuleExportNames(program, fileName);
}

function collectModuleExportNamesByFile(fileNames: string[]) {
  const compilerOptions: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
  };
  const program = ts.createProgram({ rootNames: fileNames, options: compilerOptions });

  return new Map(fileNames.map(fileName => [
    canonicalPath(fileName),
    collectProgramModuleExportNames(program, fileName),
  ]));
}

function collectProgramModuleExportNames(program: ts.Program, fileName: string) {
  const source = program.getSourceFiles().find(candidate =>
    canonicalPath(candidate.fileName) === canonicalPath(fileName));
  if (!source)
    throw new Error(`TypeScript could not load module ${fileName}`);
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol)
    throw new Error(`TypeScript could not resolve module symbol ${fileName}`);

  return checker.getExportsOfModule(moduleSymbol)
    .map(symbol => symbol.getName())
    .sort();
}

function canonicalPath(path: string) {
  return resolve(path).replaceAll("\\", "/").toLowerCase();
}
