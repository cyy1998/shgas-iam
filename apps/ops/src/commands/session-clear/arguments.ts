import { parseArgs } from "node:util";
import { z } from "zod";

export function parseSessionClearArgs(argv: string[]) {
  const args = argv.filter((arg) => arg !== "--");
  const { values, positionals } = parseArgs({
    args,
    strict: true,
    allowPositionals: true,
    options: {
      layout: { type: "string" },
      owner: { type: "string" },
      "kernel-namespace": { type: "string" },
      "custom-namespace": { type: "string" },
      "oidc-namespace": { type: "string" },
      "writers-stopped": { type: "boolean" },
      drained: { type: "boolean" },
      "deadline-ms": { type: "string" },
    },
  });
  const flags = args.filter((value) => value.startsWith("--")).map((value) => value.split("=")[0]);
  if (new Set(flags).size !== flags.length || positionals.length !== 1 || !values["writers-stopped"] || !values.drained)
    throw new Error("Explicit stopped and drained scope required");
  const mode = z.enum(["inventory", "apply", "verify"]).parse(positionals[0]);
  const layout = z.literal("unified").parse(values.layout);
  const owner = z.enum(["all", "kernel", "custom-sso", "oidc"]).parse(values.owner ?? "all");
  const namespace = z.string().regex(/^[\w:-]{1,128}$/u);
  const kernelNamespace =
    values["kernel-namespace"] === undefined ? undefined : namespace.parse(values["kernel-namespace"]);
  const customNamespace =
    values["custom-namespace"] === undefined ? undefined : namespace.parse(values["custom-namespace"]);
  const oidcNamespace = values["oidc-namespace"] === undefined ? undefined : namespace.parse(values["oidc-namespace"]);
  if (
    ((owner === "all" || owner === "kernel") && !kernelNamespace) ||
    ((owner === "all" || owner === "custom-sso") && !customNamespace) ||
    ((owner === "all" || owner === "oidc") && !oidcNamespace)
  ) {
    throw new Error("Maintenance scope is incomplete");
  }
  const deadlineMs =
    values["deadline-ms"] === undefined
      ? 300_000
      : z.coerce.number().int().positive().max(300_000).parse(values["deadline-ms"]);
  return { mode, layout, owner, kernelNamespace, customNamespace, oidcNamespace, deadlineMs };
}
export type SessionClearInput = ReturnType<typeof parseSessionClearArgs>;
