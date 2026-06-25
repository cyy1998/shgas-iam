import type {
  ApplyCommandOptions,
  CommandOptions,
  FetchLike,
  RemoteCommandOptions,
  Reporter,
} from "./types";
import { ApisixAdminClient, loadRemoteState } from "./apisix-admin-client";
import { applyPlan } from "./applier";
import { loadEnvFile } from "./env";
import { loadManifest, resolveManifestScope } from "./manifest";
import {
  consoleReporter,
  printApplyResult,
  printPlan,
  printResourceCounts,
  printValidationIssues,
} from "./output";
import { planChanges } from "./planner";
import { countResources } from "./resources";
import { validateManifest } from "./validators";

const defaultAdminUrl = "http://127.0.0.1:9180/apisix/admin";

interface CommandDependencies {
  reporter?: Reporter;
  fetch?: FetchLike;
}

export async function runValidate(options: CommandOptions = {}, dependencies: CommandDependencies = {}): Promise<void> {
  const reporter = dependencies.reporter ?? consoleReporter;
  const manifest = await loadManifestForCommand(options);
  const issues = validateManifest(manifest);

  if (issues.length > 0) {
    printValidationIssues(issues, Boolean(options.json), reporter);
    throw new Error("APISIX manifest validation failed");
  }

  if (options.json) {
    reporter.log(JSON.stringify({
      ok: true,
      env: manifest.env,
      resources: countResources(manifest.resources),
    }, null, 2));
    return;
  }

  reporter.log(`APISIX manifest validation passed for env=${manifest.env}`);
  printResourceCounts(manifest.resources, reporter);
}

export async function runDiff(
  options: RemoteCommandOptions = {},
  dependencies: CommandDependencies = {},
): Promise<void> {
  const reporter = dependencies.reporter ?? consoleReporter;
  const manifest = await loadManifestForCommand(options);
  const issues = validateManifest(manifest);

  if (issues.length > 0) {
    printValidationIssues(issues, Boolean(options.json), reporter);
    throw new Error("APISIX manifest validation failed");
  }

  const client = createAdminClient(options, dependencies);
  const remote = await loadRemoteState(client);
  const plan = planChanges(manifest, remote);

  printPlan(plan, Boolean(options.json), reporter);
}

export async function runApply(
  options: ApplyCommandOptions = {},
  dependencies: CommandDependencies = {},
): Promise<void> {
  const reporter = dependencies.reporter ?? consoleReporter;
  const manifest = await loadManifestForCommand(options);
  const issues = validateManifest(manifest);

  if (issues.length > 0) {
    printValidationIssues(issues, Boolean(options.json), reporter);
    throw new Error("APISIX manifest validation failed");
  }

  const client = createAdminClient(options, dependencies);
  const remote = await loadRemoteState(client);
  const plan = planChanges(manifest, remote);
  const result = await applyPlan(client, plan, {
    dryRun: Boolean(options.dryRun),
    prune: Boolean(options.prune),
  });

  printApplyResult(result, Boolean(options.json), reporter);
}

function createAdminClient(options: RemoteCommandOptions, dependencies: CommandDependencies): ApisixAdminClient {
  const adminKey = options.adminKey ?? process.env.APISIX_ADMIN_KEY;
  if (!adminKey) {
    throw new Error("APISIX_ADMIN_KEY is required for diff/apply. Provide --admin-key or APISIX_ADMIN_KEY.");
  }

  return new ApisixAdminClient({
    adminUrl: options.adminUrl ?? process.env.APISIX_ADMIN_URL ?? defaultAdminUrl,
    adminKey,
    fetch: dependencies.fetch,
  });
}

async function loadManifestForCommand(options: CommandOptions) {
  if (options.envFile) {
    loadEnvFile(options.envFile);
  }

  const env = resolveManifestScope(options.env);
  return loadManifest(env, options.manifest, {
    renderEnv: Boolean(options.renderEnv) || Boolean(options.envFile),
  });
}
