import { parseArgs } from "node:util";
import { ClientCodeSchema } from "@iam/contracts";
import { z } from "zod";

export function parseOnlineStateArgs(argv: string[]) {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const { values, positionals } = parseArgs({ args, strict: true, allowPositionals: true, options: {
    "layout": { type: "string" },
    "owner": { type: "string" },
    "kernel-namespace": { type: "string" },
    "custom-namespace": { type: "string" },
    "oidc-namespace": { type: "string" },
    "client-code": { type: "string" },
    "artifacts": { type: "string" },
    "writers-stopped": { type: "boolean" },
    "drained": { type: "boolean" },
    "deadline-ms": { type: "string" },
  } });
  const flags = args.filter(value => value.startsWith("--")).map(value => value.split("=")[0]);
  if (new Set(flags).size !== flags.length || positionals.length !== 1 || !values["writers-stopped"] || !values.drained)
    throw new Error("Explicit stopped and drained scope required");
  const mode = z.enum(["inventory", "apply", "verify"]).parse(positionals[0]);
  const layout = z.literal("unified").parse(values.layout);
  const owner = z.enum(["all", "kernel", "custom-sso", "oidc"]).parse(values.owner ?? "all");
  const namespace = z.string().regex(/^[\w:-]{1,128}$/u);
  const kernelNamespace = values["kernel-namespace"] === undefined ? undefined : namespace.parse(values["kernel-namespace"]);
  const customNamespace = values["custom-namespace"] === undefined ? undefined : namespace.parse(values["custom-namespace"]);
  const oidcNamespace = values["oidc-namespace"] === undefined ? undefined : namespace.parse(values["oidc-namespace"]);
  const clientCode = values["client-code"] === undefined ? undefined : ClientCodeSchema.parse(values["client-code"]);
  const artifacts = z.enum(["all", "authorization"]).parse(values.artifacts ?? "all");
  if (artifacts === "authorization" && (owner !== "custom-sso" || !clientCode))
    throw new Error("Authorization cleanup requires an explicit unified Custom Client scope");
  if (((owner === "all" || owner === "kernel") && !kernelNamespace)
    || ((owner === "all" || owner === "custom-sso") && !customNamespace)
    || ((owner === "all" || owner === "oidc") && !oidcNamespace)
    || (clientCode !== undefined && owner !== "custom-sso" && owner !== "oidc")) {
    throw new Error("Maintenance scope is incomplete");
  }
  const deadlineMs = values["deadline-ms"] === undefined ? 300_000 : z.coerce.number().int().positive().max(300_000).parse(values["deadline-ms"]);
  return { mode, layout, owner, kernelNamespace, customNamespace, oidcNamespace, clientCode, artifacts, deadlineMs };
}
export type OnlineStateInput = ReturnType<typeof parseOnlineStateArgs>;
