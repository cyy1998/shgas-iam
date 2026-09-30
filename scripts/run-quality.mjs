import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const supportedActions = new Set(["format", "format-check", "lint", "lint-fix"]);
const biomeExtensions = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);
const prettierExtensions = new Set([".less", ".md", ".yaml", ".yml"]);
const lockfiles = new Set(["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);
const excludedPrefixes = [
  ".agents/skills/",
  ".codex/skills/",
  ".scratch/",
  "apps/admin-api/static/",
  "apps/api/static/",
  "apps/sso/public/cap/",
  "docs/reviews/",
  "openspec/",
  "packages/db/src/migrations/",
];
const excludedSegments = new Set([
  ".cache",
  ".turbo",
  ".umi",
  ".umi-production",
  ".umi-test",
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "out",
  "playwright-report",
  "test-results",
]);

function fail(message) {
  console.error(`quality: ${message}`);
  process.exit(2);
}

function parseArguments(argv) {
  const [action, ...args] = argv;
  if (!supportedActions.has(action)) {
    fail("expected one of: format, format-check, lint, lint-fix");
  }

  let workspace;
  let files;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--workspace") {
      if (workspace !== undefined || files !== undefined || index + 1 >= args.length) {
        fail("--workspace requires exactly one directory before --files");
      }
      workspace = args[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--files") {
      if (files !== undefined) {
        fail("--files may only be specified once");
      }
      files = args.slice(index + 1);
      break;
    }
    fail(`unknown argument: ${argument}`);
  }

  return { action, files, workspace };
}

function toPosix(path) {
  return path.split(sep).join("/");
}

function resolveWorkspace(value) {
  if (value === undefined) {
    return undefined;
  }
  const absolute = resolve(repoRoot, value);
  const fromRoot = toPosix(relative(repoRoot, absolute));
  if (
    fromRoot === "" ||
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith("../") ||
    !existsSync(absolute) ||
    !statSync(absolute).isDirectory()
  ) {
    fail(`workspace must be an existing repository subdirectory: ${value}`);
  }
  return { absolute, relative: fromRoot };
}

function listRepositoryFiles(workspace) {
  const pathspec = workspace === undefined ? [] : ["--", workspace.relative];
  const result = spawnSync(
    "git",
    ["--no-optional-locks", "ls-files", "--cached", "--others", "--exclude-standard", "-z", ...pathspec],
    {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    fail("unable to enumerate repository files");
  }
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((path) => resolve(repoRoot, path));
}

function resolveExplicitFiles(values, workspace) {
  return values.map((value) => {
    const absolute = isAbsolute(value) ? resolve(value) : resolve(process.cwd(), value);
    if (repositoryRelative(absolute) === undefined) {
      fail(`file is outside repository: ${value}`);
    }
    if (workspace !== undefined) {
      const fromWorkspace = toPosix(relative(workspace.absolute, absolute));
      if (isAbsolute(fromWorkspace) || fromWorkspace === ".." || fromWorkspace.startsWith("../")) {
        fail(`file is outside workspace ${workspace.relative}: ${value}`);
      }
    }
    return absolute;
  });
}

function repositoryRelative(path) {
  const fromRoot = toPosix(relative(repoRoot, path));
  return isAbsolute(fromRoot) || fromRoot === ".." || fromRoot.startsWith("../") ? undefined : fromRoot;
}

function isExcluded(path) {
  const relativePath = repositoryRelative(path);
  if (relativePath === undefined) {
    return false;
  }
  const basename = relativePath.slice(relativePath.lastIndexOf("/") + 1);
  if (lockfiles.has(basename) || excludedPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    return true;
  }
  return relativePath.split("/").some((segment) => excludedSegments.has(segment));
}

function selectFiles(files) {
  const selected = { biome: [], less: [], prettier: [] };
  const seen = new Set();
  for (const path of files) {
    const absolute = resolve(path);
    if (seen.has(absolute) || !existsSync(absolute) || !statSync(absolute).isFile() || isExcluded(absolute)) {
      continue;
    }
    seen.add(absolute);
    const extension = extname(absolute).toLowerCase();
    if (biomeExtensions.has(extension)) {
      selected.biome.push(absolute);
    } else if (prettierExtensions.has(extension)) {
      selected.prettier.push(absolute);
      if (extension === ".less") {
        selected.less.push(absolute);
      }
    }
  }
  for (const paths of Object.values(selected)) {
    paths.sort((left, right) => left.localeCompare(right));
  }
  return selected;
}

function chunkArguments(files, baseLength) {
  const chunks = [];
  let chunk = [];
  let length = baseLength;
  for (const file of files) {
    const nextLength = file.length + 3;
    if (chunk.length > 0 && length + nextLength > 18_000) {
      chunks.push(chunk);
      chunk = [];
      length = baseLength;
    }
    chunk.push(file);
    length += nextLength;
  }
  if (chunk.length > 0) {
    chunks.push(chunk);
  }
  return chunks;
}

function runTool(label, command, baseArguments, files) {
  if (files.length === 0) {
    return;
  }
  for (const chunk of chunkArguments(files, command.length + baseArguments.join(" ").length)) {
    const result = spawnSync(command, [...baseArguments, "--", ...chunk], {
      cwd: repoRoot,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) {
      console.error(`quality: failed to start ${label}: ${result.error.message}`);
      process.exit(1);
    }
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
  }
}

const { action, files, workspace: workspaceArgument } = parseArguments(process.argv.slice(2));
const workspace = resolveWorkspace(workspaceArgument);
const candidates = files === undefined ? listRepositoryFiles(workspace) : resolveExplicitFiles(files, workspace);
const selected = selectFiles(candidates);
const biomeConfig = resolve(repoRoot, "biome.jsonc");
const prettierConfig = resolve(repoRoot, ".prettierrc.json");
const stylelintConfig = resolve(repoRoot, "stylelint.config.mjs");
const biomeCli = resolve(repoRoot, "node_modules/@biomejs/biome/bin/biome");
const prettierCli = resolve(repoRoot, "node_modules/prettier/bin/prettier.cjs");
const stylelintCli = resolve(repoRoot, "node_modules/stylelint/bin/stylelint.mjs");

if (action === "format" || action === "format-check") {
  const biomeArguments = [biomeCli, "format", `--config-path=${biomeConfig}`];
  if (action === "format") {
    biomeArguments.push("--write");
  }
  runTool("Biome formatter", process.execPath, biomeArguments, selected.biome);
  runTool(
    "Prettier",
    process.execPath,
    [prettierCli, action === "format" ? "--write" : "--check", "--config", prettierConfig],
    selected.prettier,
  );
} else {
  const biomeArguments = [
    biomeCli,
    "check",
    `--config-path=${biomeConfig}`,
    "--formatter-enabled=false",
    "--linter-enabled=true",
    "--assist-enabled=true",
    "--enforce-assist=true",
  ];
  if (action === "lint-fix") {
    biomeArguments.push("--write");
  }
  runTool("Biome linter", process.execPath, biomeArguments, selected.biome);
  runTool("Stylelint", process.execPath, [stylelintCli, "--config", stylelintConfig], selected.less);
}
