import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const listArgs = ["list", "--recursive", "--depth", "-1", "--json"];

/** Ask the selected checkout's package manager, including uncommitted workspace changes. */
export async function workspaceDependencyPaths(cwd: string): Promise<string[]> {
  const manager = process.env.npm_execpath || "pnpm";
  const isJavaScriptEntry = /\.[cm]?js$/i.test(manager);
  const runPnpm = (args: string[]) =>
    exec(isJavaScriptEntry ? process.execPath : manager, isJavaScriptEntry ? [manager, ...args] : args, {
      cwd,
      env: {
        ...process.env,
        COREPACK_ENABLE_NETWORK: "0",
        COREPACK_ENABLE_PROJECT_SPEC: "0",
        npm_config_manage_package_manager_versions: "false",
      },
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
    });
  const version = (await runPnpm(["--version"])).stdout.trim();
  const manifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
  if (manifest.packageManager && manifest.packageManager.split("+")[0] !== `pnpm@${version}`)
    throw new Error(`当前固定 pnpm ${version} 与 checkout 的 packageManager 不符；不自动下载或切换工具版本。`);
  const result = await runPnpm(listArgs);
  const packages: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(packages)) throw new Error("pnpm 没有返回有效的 workspace 清单。");
  const paths = ["node_modules"];
  for (const entry of packages) {
    if (!entry || typeof entry.path !== "string") throw new Error("pnpm workspace 清单缺少准确路径。");
    const path = relative(resolve(cwd), resolve(entry.path));
    if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`))
      throw new Error("workspace 位于当前 checkout 之外，不能创建依赖卷。");
    paths.push(path ? `${path}/node_modules` : "node_modules");
  }
  return [...new Set(paths)].sort();
}

export async function dependencyVolumeTargets(cwd: string): Promise<string[]> {
  return (await workspaceDependencyPaths(cwd)).map((path) => `/home/agent/workspace/${path}`);
}

/** New workspaces require a new executor; never let pnpm fall through to the source bind mount. */
export async function assertDependencyMounts(cwd: string): Promise<void> {
  const mounts = new Set(
    (await readFile("/proc/self/mountinfo", "utf8"))
      .split("\n")
      .map((line) =>
        line
          .split(" ")[4]
          ?.replace(/\\([0-7]{3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8))),
      ),
  );
  for (const path of await workspaceDependencyPaths(cwd)) {
    const target = join(cwd, path);
    if (!mounts.has(target))
      throw new Error(`依赖挂载未覆盖 ${path}；停止安装，请保留改动并在新的执行器中重新准备工作区。`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await assertDependencyMounts(process.cwd());
}
