import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const integrationExecutors = ["bun", "vitest", "playwright"];
// The root Compose Redis enables 32 logical databases. Slot 0 is reserved.
export const integrationRedisSlotLimit = 31;
export const testPostgresUrlEnv = "IAM_TEST_POSTGRES_URL";
export const testRedisUrlEnv = "IAM_TEST_REDIS_URL";
export const integrationResourceEnvNames = {
  postgres: testPostgresUrlEnv,
  redis: testRedisUrlEnv,
};
export const gatewayApisixWorkspace = "@iam/gateway-apisix";
export const gatewayApisixIntegrationFiles = new Set([
  "test-integration/preview/preview.integration.test.ts",
  "test-integration/publication/publication.integration.test.ts",
  "test-integration/publication/seven-kinds.integration.test.ts",
  "test-integration/runtime/publication-lifecycle.integration.test.ts",
]);

export function taskRequiresGatewayApisix(task) {
  return (
    task.name === gatewayApisixWorkspace &&
    task.executor === "bun" &&
    task.files.some((file) => gatewayApisixIntegrationFiles.has(file))
  );
}

export function parseBrowserWorkers(value, option) {
  const workers = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(workers) || workers > 16) {
    throw new Error(`${option} requires an integer from 1 to 16`);
  }
  return workers;
}

export function parseIntegrationConcurrency(value, option) {
  const concurrency = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(concurrency)) {
    throw new Error(`${option} requires a positive integer`);
  }
  return concurrency;
}

export function integrationDeclarations(manifest) {
  const declarations = manifest.iamTest?.integration ?? {};
  if (!declarations || typeof declarations !== "object" || Array.isArray(declarations))
    throw new Error(`Invalid Integration declaration for ${manifest.name}`);
  if (declarations.bun && declarations.vitest)
    throw new Error(`${manifest.name} must choose one executor for non-browser Integration tests`);
  return Object.entries(declarations).map(([executor, resources]) => {
    if (!integrationExecutors.includes(executor)) throw new Error(`Unknown Integration executor: ${executor}`);
    if (!resources || typeof resources !== "object" || Array.isArray(resources))
      throw new Error(`Invalid resources for ${manifest.name}:${executor}`);
    const enabledResources = {};
    for (const [service, enabled] of Object.entries(resources)) {
      if (!Object.hasOwn(integrationResourceEnvNames, service) || typeof enabled !== "boolean")
        throw new Error(`Invalid ${service} resource declaration for ${manifest.name}:${executor}`);
      if (enabled) enabledResources[service] = true;
    }
    const task = `test:integration:${executor}`;
    if (!manifest.scripts?.[task]) throw new Error(`Missing declared Integration task ${manifest.name}#${task}`);
    return {
      executor,
      resources: enabledResources,
      task,
      environmentNames: Object.keys(enabledResources).map((service) => integrationResourceEnvNames[service]),
    };
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
    } else if (argument === "--browser-workers") {
      if (options.browserWorkers !== undefined) throw new Error(`${argument} may be supplied once`);
      options.browserWorkers = parseBrowserWorkers(args[++index], argument);
    } else if (argument === "--concurrency") {
      if (options.concurrency !== undefined) throw new Error(`${argument} may be supplied once`);
      options.concurrency = parseIntegrationConcurrency(args[++index], argument);
    } else if (argument === "--timeout-ms" || argument === "--cleanup-timeout-ms") {
      const value = Number(args[++index]);
      if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${argument} requires a positive integer`);
      options[argument === "--timeout-ms" ? "timeoutMs" : "cleanupTimeoutMs"] = value;
    } else throw new Error(`Unknown Integration argument: ${argument}`);
  }
  return options;
}

export function selectIntegrationTasks(root, options) {
  const manifestPaths = [];
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
        directory: path.slice(0, -"/package.json".length),
        manifest,
      };
    });
  for (const workspace of options.workspaces)
    if (!owners.some((owner) => owner.name === workspace || owner.directory === workspace))
      throw new Error(`Unknown workspace: ${workspace}`);
  const selectedOwners =
    options.workspaces.length > 0
      ? owners.filter((owner) =>
          options.workspaces.some((workspace) => workspace === owner.name || workspace === owner.directory),
        )
      : owners;
  const tasks = [];
  for (const owner of selectedOwners) {
    const candidates = globSync("test-integration/**/*.{integration.test.ts,integration.test.tsx,spec.ts}", {
      cwd: join(root, owner.directory),
    }).sort();
    if (
      options.files.length > 0 &&
      !options.files.some((file) => {
        const ownerRoot = join(root, owner.directory);
        const paths = isAbsolute(file) ? [file] : [resolve(root, file), resolve(ownerRoot, file)];
        return paths.some((path) => candidates.includes(relative(ownerRoot, path)));
      })
    )
      continue;
    const declarations = integrationDeclarations(owner.manifest);
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
          const local = relative(ownerRoot, path);
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
  const selectedTasks = tasks
    .filter((task) => task.files.length > 0)
    .map((task) => ({ ...task, requiresApisix: taskRequiresGatewayApisix(task) }));
  if (selectedTasks.length === 0) throw new Error("No Integration tests match the selection");
  for (const workspace of options.workspaces)
    if (!selectedTasks.some((task) => task.name === workspace || task.directory === workspace))
      throw new Error(`No Integration tests match workspace ${workspace}`);
  return selectedTasks;
}
