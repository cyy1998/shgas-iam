import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { RunDescriptor } from "./lifecycle.ts";

const runIdPattern = /^[a-z0-9][a-z0-9-]{7,62}$/u;

export function createRunDescriptor(options: {
  artifactRoot: string;
  gatewayPort: number;
  runId: string;
  dualEntry?: boolean;
  wecomMobilePort?: number;
}): RunDescriptor {
  if (!runIdPattern.test(options.runId)) throw new Error("E2E run id must be a lowercase Docker-safe identifier");
  if (!Number.isInteger(options.gatewayPort) || options.gatewayPort < 1 || options.gatewayPort > 65_535) {
    throw new Error("E2E Gateway port must be an integer between 1 and 65535");
  }
  const mobilePort = options.wecomMobilePort;
  if (
    mobilePort !== undefined &&
    (!options.dualEntry ||
      !Number.isInteger(mobilePort) ||
      mobilePort < 1 ||
      mobilePort > 65_535 ||
      mobilePort === options.gatewayPort)
  ) {
    throw new Error("E2E WeCom mobile port requires a separate port and dual entry");
  }

  const project = `iam-e2e-${options.runId}`;
  return {
    version: 1,
    runId: options.runId,
    project,
    gatewayPort: options.gatewayPort,
    origin: `http://${options.dualEntry ? "external.iam.localhost" : "127.0.0.1"}:${options.gatewayPort}`,
    ...(options.dualEntry ? { internalOrigin: `http://internal.iam.localhost:${options.gatewayPort}` } : {}),
    ...(mobilePort === undefined ? {} : { wecomMobileOrigin: `https://external.iam.localhost:${mobilePort}` }),
    artifactDirectory: resolve(options.artifactRoot, options.runId),
    labels: {
      "com.docker.compose.project": project,
      "com.shgas-iam.e2e.run-id": options.runId,
    },
  };
}

export async function persistRunDescriptor(descriptor: RunDescriptor) {
  await mkdir(descriptor.artifactDirectory, { recursive: true });
  const descriptorPath = join(descriptor.artifactDirectory, "run-descriptor.json");
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return descriptorPath;
}
