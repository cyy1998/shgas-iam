import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { command } from "./commands.ts";

export async function withTestResources<T>(
  cwd: string,
  use: (resources: { network: string; env: Record<string, string> }) => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const name = `iam-afk-${randomUUID()}`;
  const descriptor = join(cwd, ".sandcastle", "resources", `${name}.json`);
  const containers: string[] = [];
  let network: string | undefined;
  const save = () => writeFileSync(descriptor, JSON.stringify({ network, containers }, null, 2));
  const docker = (args: string[]) => command("docker", args, cwd);
  // Persist each resource ID before dispatching signal handlers.
  const create = (args: string[]) => execFileSync("docker", args, {
    cwd,
    timeout: 60_000,
    windowsHide: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  await mkdir(join(cwd, ".sandcastle", "resources"), { recursive: true });

  // A synchronous exit cannot await the normal finalizer.
  const cleanupOnExit = () => {
    let failed = false;
    const remove = (args: string[]) => {
      try {
        execFileSync("docker", args, { cwd, timeout: 30_000, windowsHide: true, stdio: "ignore" });
      }
      catch { failed = true; }
    };
    for (const id of containers)
      remove(["rm", "-f", "-v", id]);
    if (network)
      remove(["network", "rm", network]);
    if (failed) {
      console.error(`中断清理未完成，按准确 ID 恢复：${descriptor}`);
    }
    else {
      try {
        unlinkSync(descriptor);
      }
      catch { /* No descriptor exists if provisioning never started. */ }
    }
  };
  process.once("exit", cleanupOnExit);

  async function cleanup() {
    const settled = await Promise.allSettled(containers.map(id => docker(["rm", "-f", "-v", id])));
    const failures = settled.filter(result => result.status === "rejected");
    if (network && failures.length === 0) {
      try {
        await docker(["network", "rm", network]);
      }
      catch (error) {
        failures.push({ status: "rejected", reason: error });
      }
    }
    if (failures.length > 0)
      throw new AggregateError(failures.map(result => result.reason), `临时资源清理失败，恢复记录：${descriptor}`);
    await rm(descriptor, { force: true });
  }

  try {
    signal?.throwIfAborted();
    network = create(["network", "create", "--label", `iam.afk.run=${name}`, name]);
    save();
    const services = [
      {
        alias: "postgres",
        image: "docker.xuanyuan.run/postgres:18.4",
        args: ["-e", "POSTGRES_USER=iam_afk", "-e", "POSTGRES_PASSWORD=iam_afk_test", "-e", "POSTGRES_DB=iam_afk"],
        ready: ["pg_isready", "-U", "iam_afk", "-d", "iam_afk"],
      },
      {
        alias: "redis",
        image: "docker.xuanyuan.run/library/redis:8.8.0",
        args: [],
        ready: ["redis-cli", "ping"],
      },
    ];
    for (const service of services) {
      signal?.throwIfAborted();
      try {
        await docker(["image", "inspect", service.image]);
      }
      catch {
        await command("docker", ["pull", service.image], cwd, 600_000);
      }
      signal?.throwIfAborted();
      const id = create([
        "create",
        "--name",
        `${name}-${service.alias}`,
        "--label",
        `iam.afk.run=${name}`,
        "--network",
        network,
        "--network-alias",
        service.alias,
        ...service.args,
        service.image,
      ]);
      containers.push(id);
      save();
      await docker(["start", id]);
      const deadline = Date.now() + 60_000;
      while (true) {
        signal?.throwIfAborted();
        try {
          await docker(["exec", id, ...service.ready]);
          break;
        }
        catch (error) {
          if (Date.now() >= deadline)
            throw error;
          await setTimeout(1000, undefined, { signal });
        }
      }
    }

    // The canonical task graph owns the list of dedicated test resource variables.
    const turbo: { tasks: Record<string, { passThroughEnv?: string[] }> }
      = JSON.parse(await readFile(join(cwd, "turbo.json"), "utf8"));
    const names = new Set(Object.values(turbo.tasks).flatMap(task => task.passThroughEnv ?? []));
    const env = Object.fromEntries([...names]
      .filter(key => /_TEST_(?:DATABASE|REDIS)_URL$/.test(key))
      .map(key => [key, key.endsWith("DATABASE_URL")
        ? "postgresql://iam_afk:iam_afk_test@postgres:5432/iam_afk"
        : "redis://redis:6379/0"]));
    signal?.throwIfAborted();
    return await use({ network, env });
  }
  finally {
    try {
      await cleanup();
    }
    finally {
      process.removeListener("exit", cleanupOnExit);
    }
  }
}
