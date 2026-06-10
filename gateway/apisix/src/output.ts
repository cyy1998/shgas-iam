import type {
  AppliedAction,
  AppliedChange,
  ApplyResult,
  ChangePlan,
  IgnoredReason,
  PlannedChange,
  Reporter,
  ResourceKind,
  ValidationIssue,
} from "./types";
import { relativePath } from "./manifest";
import { resourceDefinitions } from "./resources";

export const consoleReporter: Reporter = {
  log: message => console.log(message),
  error: message => console.error(message),
};

export function printResourceCounts(resources: Record<ResourceKind, unknown[]>, reporter: Reporter): void {
  for (const definition of resourceDefinitions) {
    reporter.log(`- ${definition.kind}: ${resources[definition.kind].length}`);
  }
}

export function printValidationIssues(issues: ValidationIssue[], asJson: boolean, reporter: Reporter): void {
  if (asJson) {
    reporter.log(JSON.stringify({ ok: false, issues: serializeIssues(issues) }, null, 2));
    return;
  }

  reporter.error(`APISIX manifest validation failed with ${issues.length} issue(s):`);
  for (const issue of issues) {
    reporter.error(`- ${relativePath(issue.file)}:${issue.path} ${issue.message}`);
  }
}

export function printPlan(plan: ChangePlan, asJson: boolean, reporter: Reporter): void {
  if (asJson) {
    reporter.log(JSON.stringify(serializePlan(plan), null, 2));
    return;
  }

  reporter.log("APISIX gateway diff:");
  printChangeGroup("create", plan.creates, reporter);
  printChangeGroup("update", plan.updates, reporter);
  printChangeGroup("delete candidates", plan.deletes, reporter);
  printIgnoredGroups(plan.ignored, reporter);
}

export function printApplyResult(result: ApplyResult, asJson: boolean, reporter: Reporter): void {
  if (asJson) {
    reporter.log(JSON.stringify(serializeApplyResult(result), null, 2));
    return;
  }

  reporter.log(result.dryRun ? "APISIX apply dry-run complete:" : "APISIX apply complete:");
  printChangeGroup("planned create", result.plan.creates, reporter);
  printChangeGroup("planned update", result.plan.updates, reporter);
  printChangeGroup(result.prune ? "planned delete" : "delete candidates (use --prune)", result.plan.deletes, reporter);
  printIgnoredGroups(result.plan.ignored, reporter);
  printAppliedGroups(result.applied, reporter);
}

export function serializePlan(plan: ChangePlan): Record<string, unknown> {
  return {
    creates: serializeChanges(plan.creates),
    updates: serializeChanges(plan.updates),
    deletes: serializeChanges(plan.deletes),
    ignored: plan.ignored.map(change => ({
      kind: change.kind,
      id: change.id,
      reason: change.reason,
    })),
  };
}

export function serializeApplyResult(result: ApplyResult): Record<string, unknown> {
  return {
    ...serializePlan(result.plan),
    dryRun: result.dryRun,
    prune: result.prune,
    applied: result.applied.map(change => ({
      kind: change.kind,
      id: change.id,
      action: change.action,
    })),
  };
}

export function serializeIssues(issues: ValidationIssue[]): Array<{ file: string; path: string; message: string }> {
  return issues.map(issue => ({
    file: relativePath(issue.file),
    path: issue.path,
    message: issue.message,
  }));
}

function printIgnoredGroups(changes: ChangePlan["ignored"], reporter: Reporter): void {
  const labels: Record<IgnoredReason, string> = {
    dynamic: "ignored dynamic-registry",
    out_of_scope: "ignored out-of-scope repo-manifest",
    unmanaged: "ignored unmanaged",
  };

  for (const reason of Object.keys(labels) as IgnoredReason[]) {
    printChangeGroup(labels[reason], changes.filter(change => change.reason === reason), reporter);
  }
}

function printAppliedGroups(changes: AppliedChange[], reporter: Reporter): void {
  const labels: Record<AppliedAction, string> = {
    create: "created",
    update: "updated",
    delete: "deleted",
  };

  for (const action of Object.keys(labels) as AppliedAction[]) {
    printChangeGroup(labels[action], changes.filter(change => change.action === action), reporter);
  }
}

function printChangeGroup(label: string, changes: PlannedChange[], reporter: Reporter): void {
  reporter.log(`- ${label}: ${changes.length}`);
  for (const change of changes) {
    reporter.log(`  - ${change.kind}/${change.id}`);
  }
}

function serializeChanges(changes: PlannedChange[]): Array<Pick<PlannedChange, "kind" | "id">> {
  return changes.map(change => ({ kind: change.kind, id: change.id }));
}
