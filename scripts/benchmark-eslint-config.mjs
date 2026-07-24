import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cpus, freemem, platform, release, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eslintBenchmarkProfiles } from "./tooling-performance/profiles.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDirectory, "..");

export function parseArgs(argv) {
  const options = {
    profiles: [],
    rounds: 5,
    includeLint: true,
    compileCacheDir: undefined,
    repoRoot: defaultRepoRoot,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--profile") {
      options.profiles.push(requireValue(argv, ++index, argument));
    }
    else if (argument === "--rounds") {
      options.rounds = Number.parseInt(requireValue(argv, ++index, argument), 10);
    }
    else if (argument === "--config-only") {
      options.includeLint = false;
    }
    else if (argument === "--compile-cache-dir") {
      options.compileCacheDir = resolve(requireValue(argv, ++index, argument));
    }
    else if (argument === "--repo-root") {
      options.repoRoot = resolve(requireValue(argv, ++index, argument));
    }
    else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (options.profiles.length === 0)
    options.profiles = ["current-backend", "current-frontend"];
  if (!Number.isInteger(options.rounds) || options.rounds < 5)
    throw new Error("--rounds must be an integer of at least 5");

  const unknownProfile = options.profiles.find(profile => !(profile in eslintBenchmarkProfiles));
  if (unknownProfile)
    throw new Error(`Unknown ESLint benchmark profile: ${unknownProfile}`);

  return options;
}

export function buildInterleavedPlan(profiles, rounds) {
  return Array.from({ length: rounds }, (_, roundIndex) => {
    const offset = roundIndex % profiles.length;
    return profiles.map((_, profileIndex) => profiles[(profileIndex + offset) % profiles.length]);
  });
}

export function summarize(samples, field) {
  const values = samples
    .map(sample => sample[field])
    .filter(value => typeof value === "number")
    .sort((left, right) => left - right);
  if (values.length === 0)
    return null;

  return {
    min: values[0],
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    max: values.at(-1),
  };
}

export function profileCompileCacheDirectory(baseDirectory, profileName, phase) {
  if (!baseDirectory)
    return undefined;
  if (!["config", "first-file-lint", "workspace-lint"].includes(phase))
    throw new Error(`Unknown compile cache phase: ${phase}`);
  return join(baseDirectory, profileName.replaceAll(/[^a-z0-9-]/gi, "_"), phase);
}

export async function runBenchmark(options) {
  const plan = buildInterleavedPlan(options.profiles, options.rounds);
  const samples = [];

  for (const [roundIndex, profileNames] of plan.entries()) {
    for (const profileName of profileNames) {
      const profileSampleIndex = samples.filter(sample => sample.profile === profileName).length;
      const config = await runConfigWorker(profileName, options);
      const firstFileLint = options.includeLint
        ? await runProfileLint(profileName, "first-file-lint", options)
        : null;
      const lint = options.includeLint
        ? await runProfileLint(profileName, "workspace-lint", options)
        : null;
      samples.push({
        round: roundIndex + 1,
        profile: profileName,
        cacheState: {
          processStart: "fresh",
          filesystemCache: profileSampleIndex === 0
            ? "uncontrolled-first-observation"
            : "warm-observation",
          nodeCompileCache: !options.compileCacheDir
            ? "disabled"
            : profileSampleIndex === 0
              ? "write"
              : "warm",
        },
        config,
        firstFileLint,
        lint,
      });
    }
  }

  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    machine: {
      platform: platform(),
      release: release(),
      node: process.version,
      logicalCpuCount: cpus().length,
      totalMemoryBytes: totalmem(),
      freeMemoryBytesAtStart: freemem(),
    },
    cache: {
      nodeCompileCache: options.compileCacheDir ? "enabled" : "disabled",
      directory: options.compileCacheDir ?? null,
      note: options.compileCacheDir
        ? "Each profile's first sample writes the cache and is excluded from its warm summary."
        : "Node compile cache is disabled. The first filesystem observation is reported separately; OS caches are not forcibly cleared.",
    },
    plan,
    samples,
    summaries: Object.fromEntries(options.profiles.map(profileName => [
      profileName,
      summarizeProfile(samples.filter(sample => sample.profile === profileName)),
    ])),
  };
}

async function runConfigWorker(profileName, options) {
  const workerPath = join(scriptDirectory, "tooling-performance", "config-worker.mjs");
  const env = benchmarkEnvironment(options, profileName, "config");

  const result = await runProcess(process.execPath, [workerPath, profileName], {
    cwd: options.repoRoot,
    env,
  });
  if (result.exitCode !== 0)
    throw new Error(`Config worker failed for ${profileName}:\n${result.stderr}`);
  return JSON.parse(result.stdout.trim());
}

async function runProfileLint(profileName, phase, options) {
  const profile = eslintBenchmarkProfiles[profileName];
  const workspace = resolve(options.repoRoot, profile.workspace);
  const lintArgs = phase === "first-file-lint"
    ? profile.firstFileLintArgs
    : profile.lintArgs;
  const timeExecutable = "/usr/bin/time";
  const executable = existsSync(timeExecutable) ? timeExecutable : "pnpm";
  const arguments_ = existsSync(timeExecutable)
    ? ["-f", "__IAM_METRICS__%e %U %S %M", "pnpm", "exec", "eslint", "--format", "json", ...lintArgs]
    : ["exec", "eslint", "--format", "json", ...lintArgs];
  const startedAt = performance.now();
  const result = await runProcess(executable, arguments_, {
    cwd: workspace,
    env: benchmarkEnvironment(options, profileName, phase),
  });
  const wallMs = performance.now() - startedAt;
  return parseLintMeasurement(profileName, phase, result, wallMs);
}

export function parseLintMeasurement(profileName, phase, result, wallMs) {
  const resourceMatch = /__IAM_METRICS__([\d.]+) ([\d.]+) ([\d.]+) (\d+)/u.exec(result.stderr);
  const stderr = result.stderr.replace(/\n?__IAM_METRICS__[^\n]+\n?/u, "");
  const diagnostics = parseLintDiagnostics(result.stdout);

  if (result.exitCode !== 0) {
    throw new Error(formatLintFailure(
      `ESLint ${phase} failed for ${profileName} with exit code ${result.exitCode}`,
      result.stdout,
      stderr,
    ));
  }
  if (!diagnostics) {
    throw new Error(formatLintFailure(
      `ESLint ${phase} returned invalid JSON for ${profileName}`,
      result.stdout,
      stderr,
    ));
  }

  return {
    exitCode: result.exitCode,
    wallMs,
    measuredWallMs: resourceMatch ? Number(resourceMatch[1]) * 1000 : null,
    userCpuMs: resourceMatch ? Number(resourceMatch[2]) * 1000 : null,
    systemCpuMs: resourceMatch ? Number(resourceMatch[3]) * 1000 : null,
    maxRssKiB: resourceMatch ? Number(resourceMatch[4]) : null,
    stdout: result.stdout,
    stderr,
    diagnostics,
  };
}

export function parseLintDiagnostics(stdout) {
  try {
    const reports = JSON.parse(stdout);
    const messages = reports.flatMap(report => report.messages ?? []);
    return {
      fileCount: reports.length,
      errorCount: messages.filter(message => message.severity === 2).length,
      warningCount: messages.filter(message => message.severity === 1).length,
      ruleIds: [...new Set(messages.map(message => message.ruleId).filter(Boolean))].sort(),
    };
  }
  catch {
    return null;
  }
}

function benchmarkEnvironment(options, profileName, phase) {
  const env = { ...process.env };
  const compileCacheDirectory = profileCompileCacheDirectory(options.compileCacheDir, profileName, phase);
  if (compileCacheDirectory)
    env.NODE_COMPILE_CACHE = compileCacheDirectory;
  else
    delete env.NODE_COMPILE_CACHE;
  return env;
}

function summarizeProfile(samples) {
  return {
    firstObservation: summarizeSampleSet(samples.slice(0, 1)),
    warmObservations: summarizeSampleSet(samples.slice(1)),
    allObservations: summarizeSampleSet(samples),
  };
}

function summarizeSampleSet(samples) {
  return {
    sampleCount: samples.length,
    configImportMs: summarize(samples.map(sample => sample.config), "importMs"),
    configComposeMs: summarize(samples.map(sample => sample.config), "composeMs"),
    configTotalMs: summarize(samples.map(sample => sample.config), "totalMs"),
    configMaxRssKiB: summarize(samples.map(sample => sample.config), "maxRssKiB"),
    firstFileLintWallMs: summarize(
      samples.flatMap(sample => sample.firstFileLint ? [sample.firstFileLint] : []),
      "wallMs",
    ),
    firstFileLintUserCpuMs: summarize(
      samples.flatMap(sample => sample.firstFileLint ? [sample.firstFileLint] : []),
      "userCpuMs",
    ),
    firstFileLintSystemCpuMs: summarize(
      samples.flatMap(sample => sample.firstFileLint ? [sample.firstFileLint] : []),
      "systemCpuMs",
    ),
    firstFileLintMaxRssKiB: summarize(
      samples.flatMap(sample => sample.firstFileLint ? [sample.firstFileLint] : []),
      "maxRssKiB",
    ),
    lintWallMs: summarize(samples.flatMap(sample => sample.lint ? [sample.lint] : []), "wallMs"),
    lintUserCpuMs: summarize(samples.flatMap(sample => sample.lint ? [sample.lint] : []), "userCpuMs"),
    lintSystemCpuMs: summarize(
      samples.flatMap(sample => sample.lint ? [sample.lint] : []),
      "systemCpuMs",
    ),
    lintMaxRssKiB: summarize(samples.flatMap(sample => sample.lint ? [sample.lint] : []), "maxRssKiB"),
  };
}

function formatLintFailure(message, stdout, stderr) {
  const output = [
    stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
    stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
  ].filter(Boolean).join("\n");
  return output ? `${message}\n${output}` : message;
}

function runProcess(command, arguments_, options) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => stdout += chunk.toString());
    child.stderr.on("data", chunk => stderr += chunk.toString());
    child.once("error", rejectPromise);
    child.once("close", exitCode => resolvePromise({ exitCode, stdout, stderr }));
  });
}

function percentile(sortedValues, percentileValue) {
  const index = Math.ceil(sortedValues.length * percentileValue) - 1;
  return sortedValues[Math.max(0, index)];
}

function requireValue(argv, index, argument) {
  const value = argv[index];
  if (!value)
    throw new Error(`${argument} requires a value`);
  return value;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runBenchmark(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
  catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
