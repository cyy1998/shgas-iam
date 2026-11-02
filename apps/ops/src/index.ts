import { loadOpsEnvironment } from "./env";

const commands = {
  "user-document": {
    backfill: { load: () => import("./commands/user-document/user-document-backfill"), prefix: [] },
    repair: { load: () => import("./commands/user-document/user-document-repair"), prefix: [] },
    "verify-postgres": {
      load: () => import("./commands/user-document/user-document-readiness"),
      prefix: ["verify-postgres"],
    },
    "verify-redis": {
      load: () => import("./commands/user-document/user-document-readiness"),
      prefix: ["verify-redis"],
    },
  },
  "organization-document": {
    backfill: { load: () => import("./commands/organization-document/organization-document-backfill"), prefix: [] },
    repair: { load: () => import("./commands/organization-document/organization-document-repair"), prefix: [] },
    verify: { load: () => import("./commands/organization-document/organization-document-verify"), prefix: [] },
  },
  session: {
    inventory: { load: () => import("./commands/session-clear/session-clear"), prefix: ["inventory"] },
    apply: { load: () => import("./commands/session-clear/session-clear"), prefix: ["apply"] },
    verify: { load: () => import("./commands/session-clear/session-clear"), prefix: ["verify"] },
  },
  "client-snapshot": {
    repair: { load: () => import("./commands/client-runtime/client-snapshot-maintenance"), prefix: ["repair"] },
    verify: { load: () => import("./commands/client-runtime/client-snapshot-maintenance"), prefix: ["verify"] },
  },
  employment: { verify: { load: () => import("./commands/employment-verifier"), prefix: [] } },
  "audit-action": {
    inventory: { load: () => import("./commands/audit-action-maintenance"), prefix: ["inventory"] },
    apply: { load: () => import("./commands/audit-action-maintenance"), prefix: ["apply"] },
    verify: { load: () => import("./commands/audit-action-maintenance"), prefix: ["verify"] },
  },
} satisfies Record<
  string,
  Record<string, { load: () => Promise<{ run: (args: string[]) => Promise<void> }>; prefix: string[] }>
>;

function help(group?: keyof typeof commands, operation?: string) {
  console.log(`iam-ops ${group ?? "<group>"} ${operation ?? "<operation>"} [options]`);
  for (const [name, operations] of Object.entries(commands)) {
    if (!group || name === group) console.log(`  ${name}: ${Object.keys(operations).join(", ")}`);
  }
  const options: Record<string, string> = {
    "user-document":
      "backfill / verify: --batch-size <n> --deadline-ms <ms>; repair: --limit <n> --stale-before <date> --deadline-ms <ms> [--subject-access-only | --force | --retry-user-id <id> --retry-version <version>]",
    "organization-document":
      "backfill: --batch-size <n>; repair: --limit <n> --stale-before <date>; all operations: --deadline-ms <ms>",
    session:
      "--layout unified --owner <all|kernel|custom-sso|oidc> --kernel-namespace <value> --custom-namespace <value> --oidc-namespace <value> --writers-stopped --drained [--deadline-ms <ms>]",
    "client-snapshot":
      "repair: --client-code <code>; full repair / verify: --all --writers-stopped --drained; --deadline-ms <ms>",
    employment: "verify is a read-only full inventory diagnostic; no repair or filtering options",
    "audit-action": "inventory / verify are read-only; apply requires --writers-stopped",
  };
  if (group) console.log(options[group]);
  console.log("Use --help at any command. Connection settings use IAM_OPS_*; source configuration is apps/ops/.env.");
}

async function main() {
  const args = process.argv.slice(2).filter((argument) => argument !== "--");
  const [group, operation, ...options] = args;
  if (!group || group === "--help" || group === "-h" || group === "help") return help();
  if (!Object.hasOwn(commands, group)) throw new Error("Unknown Ops command");
  const selectedGroup = group as keyof typeof commands;
  if (!operation || operation === "--help" || operation === "-h") return help(selectedGroup);
  if (!Object.hasOwn(commands[selectedGroup], operation)) throw new Error("Unknown Ops command");
  const entry = (
    commands[selectedGroup] as Record<
      string,
      { load: () => Promise<{ run: (args: string[]) => Promise<void> }>; prefix: string[] }
    >
  )[operation];
  if (!entry) throw new Error("Unknown Ops command");
  if (options.includes("--help") || options.includes("-h")) return help(selectedGroup, operation);
  loadOpsEnvironment();
  const command = await entry.load();
  await command.run([...entry.prefix, ...options]);
}

try {
  await main();
} catch (error) {
  const unknown = error instanceof Error && error.message === "Unknown Ops command";
  process.exitCode = unknown ? 2 : process.exitCode || 1;
  process.stderr.write(
    unknown
      ? "Unknown Ops command; use iam-ops --help.\n"
      : "Ops command failed; inspect the command configuration and arguments.\n",
  );
}
