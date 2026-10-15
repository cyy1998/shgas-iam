import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { join } from "node:path";
import type { BindMountSandboxHandle } from "@ai-hero/sandcastle";
import { shellQuote } from "./codex-provider.mts";
import { command } from "./commands.ts";
import { dockerSandbox } from "./sandbox.mts";

const hostNetworkRequirements =
  "需要 Linux Docker Engine，或 Docker Desktop 4.34+ 已启用 host networking 且关闭 Enhanced Container Isolation；" +
  "仅支持 Linux containers，不自动切换 DinD、代理或其他网络。";

type SmokeOptions = { cwd: string; image: string; signal: AbortSignal };
type SmokeSandbox = {
  project: string;
  composePath: string;
  sandboxName: string;
  handle?: BindMountSandboxHandle;
  containerId?: string;
  serviceId?: string;
  port?: number;
};

/** Exercise the runner's Docker boundary without Git worktrees, models or credentials. */
export async function smokeDocker({ cwd, image, signal }: SmokeOptions): Promise<void> {
  const runId = randomUUID();
  const directory = join(cwd, ".sandcastle", "resources", `docker-smoke-${runId}`);
  await mkdir(directory, { recursive: true });
  const sandboxes: SmokeSandbox[] = [0, 1].map((index) => ({
    project: `iam-afk-smoke-${runId}-${index}`,
    composePath: join(directory, `compose-${index}.json`),
    sandboxName: `iam-afk-sandbox-${runId}-${index}`,
  }));
  const candidate = await command("git", ["rev-parse", "HEAD"], cwd);
  const probeName = `iam-afk-socket-${runId}`;
  const checks: Record<string, unknown> = {};
  const failures: unknown[] = [];
  let aborted: Promise<unknown[]> | undefined;
  const hostDocker = (...args: string[]) => command("docker", args, cwd, 90_000);
  const persist = (stage: string) =>
    writeFile(
      join(directory, "run.json"),
      JSON.stringify(
        {
          runId,
          candidate,
          stage,
          probeName,
          sandboxes: sandboxes.map(({ handle: _handle, ...resource }) => resource),
          checks,
          failures: failures.map(describeFailure),
        },
        null,
        2,
      ),
    );
  const onAbort = () => {
    // Stop inner CLI processes before down so no resource creator can race cleanup.
    aborted = Promise.all(
      sandboxes.flatMap(({ containerId }) =>
        containerId ? [hostDocker("stop", "--time", "1", containerId).catch((error) => error)] : [],
      ),
    );
  };
  const exec = async (resource: SmokeSandbox, script: string) => {
    signal.throwIfAborted();
    const result = await resource.handle!.exec(`timeout --kill-after=5s 180s sh -c ${shellQuote(script)}`);
    signal.throwIfAborted();
    if (result.exitCode !== 0)
      throw new Error(`${resource.project} 命令失败 (${result.exitCode})：\n${result.stdout}\n${result.stderr}`);
    return result.stdout.trim();
  };
  const compose = (resource: SmokeSandbox) =>
    `docker compose --project-name ${resource.project} --file /tmp/iam-docker-smoke/compose.json`;
  const down = async (resource: SmokeSandbox) => {
    await hostDocker(
      "compose",
      "--project-name",
      resource.project,
      "--file",
      resource.composePath,
      "down",
      "--volumes",
      "--remove-orphans",
      "--rmi",
      "local",
    );
    for (const kind of ["container", "network", "volume"]) {
      const remaining = await hostDocker(
        kind === "container" ? "ps" : kind,
        ...(kind === "container" ? ["-a"] : ["ls"]),
        "--filter",
        `label=com.docker.compose.project=${resource.project}`,
        "--format",
        kind === "volume" ? "{{.Name}}" : "{{.ID}}",
      );
      if (remaining) throw new Error(`${resource.project} 清理后仍有 ${kind}：${remaining}`);
    }
  };
  const server = createServer((_request, response) => response.end(runId));
  await persist("created");
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    signal.throwIfAborted();
    if ((await hostDocker("info", "--format", "{{.OSType}}")) !== "linux") throw new Error(hostNetworkRequirements);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Host loopback server 没有动态端口。");
    // Only the daemon resolves this source; Windows clients never stat the socket path.
    const socketGroupId = Number(
      await hostDocker(
        "run",
        "--rm",
        "--name",
        probeName,
        "--mount",
        "type=bind,source=/var/run/docker.sock,target=/var/run/docker.sock,readonly",
        "--entrypoint",
        "stat",
        image,
        "-c",
        "%g",
        "/var/run/docker.sock",
      ),
    );
    if (!Number.isSafeInteger(socketGroupId) || socketGroupId < 0) throw new Error("无法读取 daemon socket GID。");
    checks.socketGroupId = socketGroupId;
    for (const [index, resource] of sandboxes.entries()) {
      signal.throwIfAborted();
      await writeFile(
        resource.composePath,
        JSON.stringify({
          services: {
            web: {
              build: { context: "./context" },
              environment: { SMOKE_RUN: `${runId}-${index}` },
              ports: ["127.0.0.1::3000"],
              volumes: ["data:/data"],
            },
          },
          volumes: { data: {} },
        }),
      );
      const provider = dockerSandbox({
        imageName: image,
        containerName: resource.sandboxName,
        containerUid: 1000,
        containerGid: 1000,
        network: "host",
        daemonAccess: { socketGroupId },
      });
      resource.handle = await provider.create({ hostRepoPath: cwd, worktreePath: cwd, mounts: [], env: provider.env });
      const identity = await hostDocker("inspect", "--format", "{{.Id}}", resource.sandboxName);
      if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error("Sandbox 没有交付可恢复的 container ID。");
      resource.containerId = identity;
      await persist("sandbox-created");
      const tools = await exec(
        resource,
        'test "$(id -u)" = 1000 && id && docker version && docker compose version && docker buildx version',
      );
      await writeFile(join(directory, `tools-${index}.log`), tools);
      try {
        const probe = `fetch("http://127.0.0.1:${address.port}", { signal: AbortSignal.timeout(10000) }).then(r => r.text()).then(text => { if (text !== ${JSON.stringify(runId)}) throw Error("host response mismatch"); }).catch(error => { console.error(error); process.exitCode = 1; });`;
        await exec(resource, `node -e ${shellQuote(probe)}`);
      } catch (error) {
        throw new Error(`Host-network loopback 不可达。${hostNetworkRequirements}`, { cause: error });
      }
      await exec(resource, "mkdir -p /tmp/iam-docker-smoke/context");
      await resource.handle.copyFileIn(resource.composePath, "/tmp/iam-docker-smoke/compose.json");
      await resource.handle.copyFileIn(join(cwd, "package.json"), "/tmp/iam-docker-smoke/context/package.json");
      await resource.handle.copyFileIn(
        join(cwd, "scripts/sandcastle/docker-smoke-service.cjs"),
        "/tmp/iam-docker-smoke/context/service.cjs",
      );
      const inputs = {
        Dockerfile: `FROM ${image}\nUSER 0:0\nRUN mkdir /data && chown 1000:1000 /data\nCOPY . /opt/smoke/\nUSER 1000:1000\nENTRYPOINT ["node", "/opt/smoke/service.cjs"]\n`,
        "candidate.json": JSON.stringify({ candidate, marker: runId }),
      };
      for (const [name, content] of Object.entries(inputs)) {
        const path = join(directory, `${index}-${name}`);
        await writeFile(path, content);
        await resource.handle.copyFileIn(path, `/tmp/iam-docker-smoke/context/${name}`);
      }
    }
    checks.nonRootDocker = true;
    checks.hostLoopback = true;
    const started = await Promise.allSettled(
      sandboxes.map(async (resource) => {
        const output = await exec(resource, `${compose(resource)} up --build --detach`);
        await writeFile(join(directory, `${resource.project}-build.log`), output);
        resource.serviceId = await exec(resource, `${compose(resource)} ps --quiet web`);
        const published = await exec(resource, `${compose(resource)} port web 3000`);
        resource.port = Number(published.split(":").at(-1));
        if (!resource.serviceId || !resource.port) throw new Error(`${resource.project} 未交付 service/port。`);
      }),
    );
    const startupErrors = started.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (startupErrors.length) throw new AggregateError(startupErrors, "并行 Compose 启动失败。");
    await persist("running");
    if (sandboxes[0]!.port === sandboxes[1]!.port) throw new Error("并行 project 复用了动态端口。");
    for (const [index, resource] of sandboxes.entries()) {
      console.log(
        await exec(
          resource,
          `NODE_PATH="$(npm root -g)" node -e ${shellQuote(browserProbe(resource.port!, `${runId}-${index}`, candidate, runId))}`,
        ),
      );
      await exec(resource, `docker stop ${resource.serviceId}`);
      if ((await hostDocker("inspect", "--format", "{{.State.Running}}", resource.serviceId!)) !== "false")
        throw new Error("文件导出前 service 未停止。");
      await exec(resource, `docker cp ${resource.serviceId}:/data/receipt.json /tmp/iam-docker-smoke/receipt.json`);
      const receiptPath = join(directory, `receipt-${index}.json`);
      await resource.handle!.copyFileOut("/tmp/iam-docker-smoke/receipt.json", receiptPath);
      const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
      if (receipt.run !== `${runId}-${index}` || receipt.candidate !== candidate || receipt.marker !== runId)
        throw new Error("停止容器后的 receipt 与候选输入不匹配。");
      if (index === 0) {
        await down(resource);
        const other = sandboxes[1]!;
        const probe = `fetch("http://127.0.0.1:${other.port}").then(r => r.json()).then(body => { if (body.run !== ${JSON.stringify(`${runId}-1`)}) throw Error("other project changed"); }).catch(error => { console.error(error); process.exitCode = 1; });`;
        await exec(other, `node -e ${shellQuote(probe)}`);
        checks.parallelIsolation = true;
      }
    }
    checks.candidateBuild = true;
    checks.chromiumHostnames = true;
    checks.stoppedContainerExport = true;
  } catch (error) {
    failures.push(error);
  } finally {
    signal.removeEventListener("abort", onAbort);
    if (aborted) failures.push(...(await aborted).filter(Boolean));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const beforeCleanup = failures.length;
    for (const resource of sandboxes) {
      try {
        await readFile(resource.composePath);
        await down(resource);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) failures.push(error);
      }
      try {
        const remaining = await hostDocker(
          "ps",
          "--all",
          "--filter",
          `name=^${resource.sandboxName}$`,
          "--format",
          "{{.ID}}",
        );
        if (remaining) await hostDocker("rm", "--force", remaining);
        await resource.handle?.close();
      } catch (error) {
        failures.push(error);
      }
    }
    try {
      const probe = await hostDocker("ps", "--all", "--filter", `name=^${probeName}$`, "--format", "{{.ID}}");
      if (probe) await hostDocker("rm", "--force", probe);
    } catch (error) {
      failures.push(error);
    }
    checks.cleaned = failures.length === beforeCleanup;
    await persist(failures.length ? "failed" : "passed");
    console.log(`Docker smoke 记录：${join(directory, "run.json")}`);
  }
  if (failures.length) throw new AggregateError(failures, failures.map(describeFailure).join("\n"));
  console.log("非 root Docker、host loopback、候选构建、Chromium 双 hostname、停止后导出与并行准确清理通过。");
}

function describeFailure(error: unknown): string {
  if (error instanceof AggregateError) return `${error.message}\n${error.errors.map(describeFailure).join("\n")}`;
  if (error instanceof Error && error.cause) return `${error.message}\n${describeFailure(error.cause)}`;
  return String(error);
}

function browserProbe(port: number, run: string, candidate: string, marker: string): string {
  return `
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ headless: true, channel: "chromium", args: [
    "--no-proxy-server", "--host-resolver-rules=MAP internal.iam.localhost 127.0.0.1, MAP external.iam.localhost 127.0.0.1"
  ] });
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const origin = host => "http://" + host + ":${port}";
    const response = await page.goto(origin("internal.iam.localhost") + "/set-cookie");
    const body = await response.json();
    if (body.run !== ${JSON.stringify(run)} || body.candidate !== ${JSON.stringify(candidate)} || body.marker !== ${JSON.stringify(marker)} || body.packageName !== "iam-monorepo") throw Error("candidate build context mismatch");
    await page.goto(origin("external.iam.localhost") + "/cookie");
    const external = JSON.parse(await page.textContent("body"));
    if (external.cookie.includes("smoke=")) throw Error("host-only Cookie leaked between hostnames");
    await page.goto(origin("internal.iam.localhost") + "/cookie");
    const internal = JSON.parse(await page.textContent("body"));
    if (!internal.cookie.includes("smoke=${run}")) throw Error("internal Cookie was not retained");
    console.log("Chromium " + browser.version() + " candidate and host-only Cookie isolation passed");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
`;
}
