import { existsSync, globSync, readdirSync, readFileSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const integrationProfiles = ["component", "process", "redis", "postgres", "composition", "browser"];
const ownerPrefixes = {
  "@iam/api": "API",
  "@iam/admin-api": "ADMIN_API",
  "@iam/worker": "WORKER",
  "@iam/api-core": "API_CORE",
  "@iam/session-kernel": "SESSION_KERNEL",
  "@iam/oidc": "OIDC",
  "@iam/user-profile-read-model": "USER_PROFILE",
  "@iam/db": "DB",
  "@iam/role-assignment-resolution": "ROLE_ASSIGNMENT",
  "@iam/organization-responsibility-resolution": "ORGANIZATION_RESPONSIBILITY",
  "@iam/organization-search-read-model": "ORGANIZATION_SEARCH",
};

export function resourceEnvironmentNames(owner, profile) {
  const resources =
    profile === "postgres"
      ? ["DATABASE"]
      : profile === "redis"
        ? ["REDIS"]
        : profile === "composition" && ["@iam/api", "@iam/admin-api", "@iam/worker"].includes(owner)
          ? ["DATABASE", "REDIS"]
          : profile === "browser" && owner === "@iam/api"
            ? ["REDIS"]
            : [];
  if (resources.length > 0 && !ownerPrefixes[owner]) throw new Error(`No resource owner registered for ${owner}`);
  return resources.map((resource) => `IAM_${ownerPrefixes[owner]}_TEST_${resource}_URL`);
}

export function parseIntegrationArguments(args) {
  const options = {
    workspaces: [],
    profiles: [],
    files: [],
    keep: false,
    timeoutMs: 30 * 60_000,
    cleanupTimeoutMs: 30_000,
  };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--") continue;
    if (argument === "--keep-resources") {
      options.keep = true;
      continue;
    }
    const fields = { "--workspace": "workspaces", "--profile": "profiles", "--file": "files" };
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
  for (const profile of options.profiles)
    if (!integrationProfiles.includes(profile)) throw new Error(`Unknown profile: ${profile}`);
  return options;
}

export function selectIntegrationTasks(root, options) {
  const manifestPaths = ["package.json", "gateway/package.json", "e2e/system/package.json"];
  for (const directory of ["apps", "packages"]) {
    if (!existsSync(join(root, directory))) continue;
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      if (entry.isDirectory()) manifestPaths.push(`${directory}/${entry.name}/package.json`);
    }
  }
  const owners = manifestPaths
    .filter((path) => existsSync(join(root, path)))
    .map((path) => {
      const manifest = JSON.parse(readFileSync(join(root, path), "utf8"));
      return {
        name: manifest.name,
        directory: path === "package.json" ? "." : path.slice(0, -"/package.json".length),
        scripts: manifest.scripts ?? {},
      };
    });
  for (const workspace of options.workspaces) {
    if (!owners.some((owner) => owner.name === workspace || owner.directory === workspace))
      throw new Error(`Unknown workspace: ${workspace}`);
  }
  const tasks = [];
  for (const profile of integrationProfiles.filter(
    (profile) => options.profiles.length === 0 || options.profiles.includes(profile),
  )) {
    for (const owner of owners) {
      if (
        options.workspaces.length > 0 &&
        !options.workspaces.some((workspace) => workspace === owner.name || workspace === owner.directory)
      )
        continue;
      const rootOwner = owner.directory === ".";
      const task = `test:integration:${profile}${rootOwner ? ":root" : ""}`;
      if (!owner.scripts[task]) continue;
      const directory = `${rootOwner ? "scripts/" : ""}test-integration/${profile}`;
      const pattern =
        profile === "browser" ? `${directory}/**/*.spec.ts` : `${directory}/**/*.integration.test.{ts,tsx}`;
      const files = globSync(pattern, { cwd: join(root, owner.directory) })
        .map((file) => file.replaceAll("\\", "/"))
        .sort();
      if (files.length === 0) continue;
      tasks.push({ ...owner, profile, task, files, environmentNames: resourceEnvironmentNames(owner.name, profile) });
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
          const key = `${task.name}:${task.profile}`;
          if (!selected.has(key)) selected.set(key, new Set());
          selected.get(key).add(local);
        }
      }
      if (!matched) throw new Error(`File does not match the selected workspace/profile: ${file}`);
    }
    for (const task of tasks) task.files = [...(selected.get(`${task.name}:${task.profile}`) ?? [])];
  }
  const selectedTasks = tasks.filter((task) => task.files.length > 0);
  if (selectedTasks.length === 0) throw new Error("No Integration tests match the selection");
  for (const profile of options.profiles)
    if (!selectedTasks.some((task) => task.profile === profile))
      throw new Error(`No Integration tests match profile ${profile}`);
  return selectedTasks;
}
