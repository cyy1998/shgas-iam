import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const integrationExecutors = ["bun", "vitest", "playwright"];

export function integrationDeclarations(manifest, rootOwner = false) {
  const declarations = manifest.iamTest?.integration ?? {};
  if (!declarations || typeof declarations !== "object" || Array.isArray(declarations))
    throw new Error(`Invalid Integration declaration for ${manifest.name}`);
  if (declarations.bun && declarations.vitest)
    throw new Error(`${manifest.name} must choose one executor for non-browser Integration tests`);
  return Object.entries(declarations).map(([executor, resources]) => {
    if (!integrationExecutors.includes(executor)) throw new Error(`Unknown Integration executor: ${executor}`);
    if (!resources || typeof resources !== "object" || Array.isArray(resources))
      throw new Error(`Invalid resources for ${manifest.name}:${executor}`);
    for (const [service, name] of Object.entries(resources)) {
      const suffix = { postgres: "DATABASE", redis: "REDIS" }[service];
      if (!suffix || typeof name !== "string" || !new RegExp(`^IAM_[A-Z_]+_TEST_${suffix}_URL$`).test(name))
        throw new Error(`Invalid ${service} environment mapping for ${manifest.name}:${executor}`);
    }
    const task = `test:integration:${executor}${rootOwner ? ":root" : ""}`;
    if (!manifest.scripts?.[task]) throw new Error(`Missing declared Integration task ${manifest.name}#${task}`);
    return { executor, resources, task, environmentNames: Object.values(resources) };
  });
}

export function parseIntegrationArguments(args) {
  const options = { workspaces: [], files: [], keep: false, timeoutMs: 30 * 60_000, cleanupTimeoutMs: 30_000 };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--keep-resources") {
      options.keep = true;
      continue;
    }
    const fields = { "--workspace": "workspaces", "--file": "files" };
    if (fields[argument]) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      options[fields[argument]].push(value);
    } else if (argument === "--timeout-ms" || argument === "--cleanup-timeout-ms") {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${argument} requires a positive integer`);
      options[argument === "--timeout-ms" ? "timeoutMs" : "cleanupTimeoutMs"] = value;
    } else throw new Error(`Unknown Integration argument: ${argument}`);
  }
  return options;
}

export function selectIntegrationTasks(root, options) {
  const manifestPaths = ["package.json", "e2e/system/package.json"];
  for (const directory of ["apps", "packages"]) {
    if (!existsSync(join(root, directory))) continue;
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true }))
      if (entry.isDirectory()) manifestPaths.push(`${directory}/${entry.name}/package.json`);
  }
  const owners = manifestPaths
    .filter((path) => existsSync(join(root, path)))
    .map((path) => {
      const manifest = JSON.parse(readFileSync(join(root, path), "utf8"));
      return {
        name: manifest.name,
        directory: path === "package.json" ? "." : path.slice(0, -"/package.json".length),
        manifest,
      };
    });
  for (const workspace of options.workspaces)
    if (!owners.some((owner) => owner.name === workspace || owner.directory === workspace))
      throw new Error(`Unknown workspace: ${workspace}`);
  const tasks = [];
  for (const owner of owners) {
    if (
      options.workspaces.length > 0 &&
      !options.workspaces.some((workspace) => workspace === owner.name || workspace === owner.directory)
    )
      continue;
    const rootOwner = owner.directory === ".";
    const directory = `${rootOwner ? "scripts/" : ""}test-integration`;
    const candidates = globSync(`${directory}/**/*.{integration.test.ts,integration.test.tsx,spec.ts}`, {
      cwd: join(root, owner.directory),
    })
      .map((file) => file.replaceAll("\\", "/"))
      .sort();
    if (
      options.files.length > 0 &&
      !options.files.some((file) => {
        const ownerRoot = join(root, owner.directory);
        const paths = isAbsolute(file) ? [file] : [resolve(root, file), resolve(ownerRoot, file)];
        return paths.some((path) => candidates.includes(relative(ownerRoot, path).replaceAll("\\", "/")));
      })
    )
      continue;
    const declarations = integrationDeclarations(owner.manifest, rootOwner);
    for (const file of candidates)
      if (
        !declarations.some(({ executor }) =>
          executor === "playwright" ? file.endsWith(".spec.ts") : !file.endsWith(".spec.ts"),
        )
      )
        throw new Error(`Integration tests have no declared executor in ${owner.name}: ${file}`);
    for (const declaration of declarations) {
      const files = candidates.filter((file) =>
        declaration.executor === "playwright" ? file.endsWith(".spec.ts") : !file.endsWith(".spec.ts"),
      );
      if (files.length === 0)
        throw new Error(`No Integration tests for declared executor ${owner.name}:${declaration.executor}`);
      tasks.push({ ...owner, ...declaration, files });
    }
  }
  if (options.files.length > 0) {
    const selected = new Map();
    for (const file of options.files) {
      let matched = false;
      for (const task of tasks) {
        const ownerRoot = join(root, task.directory);
        const paths = isAbsolute(file) ? [file] : [resolve(root, file), resolve(ownerRoot, file)];
        for (const path of paths) {
          const local = relative(ownerRoot, path).replaceAll("\\", "/");
          if (!task.files.includes(local)) continue;
          matched = true;
          const key = `${task.name}:${task.executor}`;
          if (!selected.has(key)) selected.set(key, new Set());
          selected.get(key).add(local);
        }
      }
      if (!matched) throw new Error(`File does not match the selected workspace: ${file}`);
    }
    for (const task of tasks) task.files = [...(selected.get(`${task.name}:${task.executor}`) ?? [])];
  }
  const selectedTasks = tasks.filter((task) => task.files.length > 0);
  if (selectedTasks.length === 0) throw new Error("No Integration tests match the selection");
  for (const workspace of options.workspaces)
    if (!selectedTasks.some((task) => task.name === workspace || task.directory === workspace))
      throw new Error(`No Integration tests match workspace ${workspace}`);
  return selectedTasks;
}
