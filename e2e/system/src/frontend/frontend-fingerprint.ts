import { createHash } from "node:crypto";
import { type WorkspaceManifest, workspaceDependencyClosure } from "../workspace-inputs.ts";

export interface FrontendWorkspaceInputs {
  manifest: WorkspaceManifest;
  files: Record<string, string>;
}

export interface FrontendBuildFingerprint {
  fingerprint: string;
  files: Record<string, string>;
}

export function fingerprintFrontendInputs(
  app: string,
  workspaces: ReadonlyMap<string, FrontendWorkspaceInputs>,
  sharedFiles: Record<string, string>,
  environment: Readonly<Record<string, string>>,
) {
  const inputs = { ...sharedFiles };
  for (const name of workspaceDependencyClosure(app, workspaces)) {
    Object.assign(inputs, workspaces.get(name)?.files);
  }
  return createHash("sha256")
    .update(JSON.stringify([1, app, sortedEntries(inputs), sortedEntries(environment)]))
    .digest("hex");
}

export function matchesFrontendBuild(
  record: FrontendBuildFingerprint,
  fingerprint: string,
  output: Record<string, string>,
) {
  return (
    record.fingerprint === fingerprint &&
    typeof output["index.html"] === "string" &&
    Object.keys(record.files).length === Object.keys(output).length &&
    Object.entries(record.files).every(([file, digest]) => Object.hasOwn(output, file) && output[file] === digest)
  );
}

function sortedEntries(record: Readonly<Record<string, string>>) {
  return Object.keys(record)
    .sort()
    .map((key) => [key, record[key]]);
}
