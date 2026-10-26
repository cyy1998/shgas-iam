import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const listArgs = ["list", "--recursive", "--depth", "-1", "--json"];

/** Resolve host tooling before invoking cmd, whose default search includes the checkout. */
async function windowsPnpm(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  const checkout = await realpath(cwd);
  const outsideCheckout = (path: string) => {
    const fromCheckout = relative(checkout, path);
    return isAbsolute(fromCheckout) || fromCheckout === ".." || fromCheckout.startsWith(`..${sep}`);
  };
  const paths: string[] = [];
  for (const entry of (process.env.PATH ?? "").split(delimiter)) {
    const path = entry.startsWith('"') && entry.endsWith('"') ? entry.slice(1, -1) : entry;
    if (!isAbsolute(path)) continue;
    const absolute = await realpath(path).catch(() => undefined);
    if (absolute && outsideCheckout(absolute)) paths.push(absolute);
  }
  let launcher: string | undefined;
  for (const path of paths) {
    for (const name of ["pnpm.exe", "pnpm.cmd"]) {
      const candidate = await realpath(join(path, name)).catch(() => undefined);
      if (candidate && outsideCheckout(candidate) && (await stat(candidate)).isFile()) {
        launcher = candidate;
        break;
      }
    }
    if (launcher) break;
  }
  if (!launcher) throw new Error("PATH 中没有 checkout 之外的固定 pnpm 工具；不能从 ticket 目录执行 launcher。");
  const emptyCwd = await mkdtemp(join(tmpdir(), "iam-afk-pnpm-"));
  try {
    const launchEnv = Object.fromEntries(Object.entries(env).filter(([name]) => name.toLowerCase() !== "path"));
    launchEnv.PATH = paths.join(delimiter);
    const options = { cwd: emptyCwd, windowsHide: true, timeout: 30_000, maxBuffer: 2 * 1024 * 1024, env: launchEnv };
    if (launcher.endsWith(".exe")) return await exec(launcher, ["--dir", cwd, ...args], options);
    const cmd = process.env.ComSpec;
    if (!cmd || !isAbsolute(cmd)) throw new Error("Windows 缺少绝对 ComSpec 路径，无法启动固定 pnpm launcher。");
    // Static command text; quoted environment expansion preserves spaces, %, &, and parentheses in paths.
    return await exec(
      cmd,
      ["/d", "/s", "/v:off", "/c", `""%IAM_AFK_PNPM_LAUNCHER%" --dir "%IAM_AFK_PNPM_DIRECTORY%" ${args.join(" ")}"`],
      {
        ...options,
        windowsVerbatimArguments: true,
        env: { ...launchEnv, IAM_AFK_PNPM_LAUNCHER: launcher, IAM_AFK_PNPM_DIRECTORY: cwd },
      },
    );
  } finally {
    await rm(emptyCwd, { recursive: true, force: true });
  }
}

/** Ask the selected checkout's package manager, including uncommitted workspace changes. */
export async function workspaceDependencyPaths(cwd: string): Promise<string[]> {
  const manager = process.env.npm_execpath;
  const output = async (version: boolean) => {
    const managerArgs = version ? ["--version"] : listArgs;
    const env = {
      ...process.env,
      COREPACK_ENABLE_NETWORK: "0",
      COREPACK_ENABLE_PROJECT_SPEC: "0",
      npm_config_manage_package_manager_versions: "false",
    };
    if (process.platform === "win32" && (!manager || /\.(?:cmd|bat)$/i.test(manager)))
      return windowsPnpm(cwd, managerArgs, env);
    const [file, args] =
      manager && !/\.(?:cmd|bat)$/i.test(manager)
        ? /\.[cm]?js$/i.test(manager)
          ? ["node", [manager, ...managerArgs]]
          : [manager, managerArgs]
        : ["pnpm", managerArgs];
    return exec(file!, args!, {
      cwd,
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 2 * 1024 * 1024,
      env,
    });
  };
  const version = (await output(true)).stdout.trim();
  const manifest = JSON.parse(await readFile(join(cwd, "package.json"), "utf8"));
  if (manifest.packageManager && manifest.packageManager.split("+")[0] !== `pnpm@${version}`)
    throw new Error(`当前固定 pnpm ${version} 与 checkout 的 packageManager 不符；不自动下载或切换工具版本。`);
  const result = await output(false);
  const packages: unknown = JSON.parse(result.stdout);
  if (!Array.isArray(packages)) throw new Error("pnpm 没有返回有效的 workspace 清单。");
  const paths = ["node_modules"];
  for (const entry of packages) {
    if (!entry || typeof entry.path !== "string") throw new Error("pnpm workspace 清单缺少准确路径。");
    const path = relative(resolve(cwd), resolve(entry.path));
    if (isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`))
      throw new Error("workspace 位于当前 checkout 之外，不能创建依赖卷。");
    paths.push(path ? `${path.replaceAll("\\", "/")}/node_modules` : "node_modules");
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
