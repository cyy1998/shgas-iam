import { timingSafeEqual } from "node:crypto";
import { BAD_GATEWAY, BAD_REQUEST, SERVICE_UNAVAILABLE, UNAUTHORIZED } from "@iam/api-core/core/http-status-codes";
import { ClientStatus } from "@iam/contracts";
import { parseDocument } from "yaml";
import { ApisixReadError } from "../../apisix.error";
import { renderEnvValue } from "../../env";
import { isRecord, materializeManifest, parseManifestScope } from "../../manifest";
import { serializePlan } from "../../output";
import { planChanges } from "../../planner";
import { countResources } from "../../resources";
import type { LoadedManifest, ManifestScope, ValidationIssue } from "../../types";
import { validateManifest } from "../../validators";
import { GatewayError } from "./gateway.error";
import type { GatewayCredentialReader, GatewayRemoteReader, GatewayRemoteWriter } from "./gateway.port";
import type { GatewayApplyInput, GatewayInput } from "./gateway.schema";
import { createGatewayExecution } from "./gateway-execution";
import { publishGatewayPlan } from "./gateway-publication";

export type { GatewayInput } from "./gateway.schema";

export function createGatewayService(deps: {
  credentials: GatewayCredentialReader;
  remote?: GatewayRemoteReader;
  writer?: GatewayRemoteWriter;
  operationTimeoutMs?: number;
}) {
  const execution = createGatewayExecution();
  async function prepare(input: GatewayInput, secret: string) {
    let scope: ManifestScope;
    try {
      scope = parseManifestScope(input.scope);
    } catch {
      throw new GatewayError("GATEWAY_INPUT_INVALID", "scope must use lowercase <env>:<app> segments", BAD_REQUEST);
    }
    let credential: Awaited<ReturnType<GatewayCredentialReader["readByClientCode"]>>;
    try {
      credential = await deps.credentials.readByClientCode(scope.app);
    } catch {
      throw new GatewayError(
        "GATEWAY_AUTH_UNAVAILABLE",
        "Client authentication is temporarily unavailable",
        SERVICE_UNAVAILABLE,
      );
    }
    if (
      !credential ||
      credential.isDelete ||
      credential.status !== ClientStatus.Enable ||
      !sameSecret(secret, credential.clientSecret)
    ) {
      throw new GatewayError("GATEWAY_UNAUTHORIZED", "Client authentication failed", UNAUTHORIZED);
    }
    let sourceManifest: LoadedManifest;
    try {
      const document = parseDocument(input.yaml, { logLevel: "silent" });
      if (document.errors.length > 0) throw new Error("invalid YAML");
      const source: unknown = document.toJS({ maxAliasCount: 100 });
      if (!isRecord(source)) throw new Error("invalid manifest");
      sourceManifest = materializeManifest(source, input.scope);
    } catch {
      throw new GatewayError("GATEWAY_INPUT_INVALID", "yaml must contain a valid manifest object", BAD_REQUEST);
    }
    const sourceIssues = validateManifest(sourceManifest);
    let rendered: unknown;
    try {
      rendered = renderEnvValue(sourceManifest.source, input.variables, "request");
    } catch {
      throw new GatewayError(
        "GATEWAY_VARIABLES_INVALID",
        "Every YAML placeholder requires a request variable",
        BAD_REQUEST,
      );
    }
    if (!isRecord(rendered))
      throw new GatewayError("GATEWAY_INPUT_INVALID", "yaml must contain a manifest object", BAD_REQUEST);
    const manifest = materializeManifest(rendered, input.scope);
    const issues = [...sourceIssues, ...validateManifest(manifest, { sensitiveValues: false })];
    if (issues.length > 0) {
      throw new GatewayError("GATEWAY_VALIDATION_FAILED", "Manifest validation failed", BAD_REQUEST, {
        valid: false,
        resources: countResources(manifest.resources),
        issues: safeIssues(issues),
      });
    }
    return manifest;
  }

  async function preview(manifest: LoadedManifest) {
    if (!deps.remote)
      throw new GatewayError("GATEWAY_REMOTE_UNAVAILABLE", "APISIX is unavailable", SERVICE_UNAVAILABLE);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), deps.operationTimeoutMs ?? 60_000);
    try {
      const remote = await deps.remote.read(controller.signal);
      return { outcome: "preview", plan: serializePlan(planChanges(manifest, remote)) };
    } catch (error) {
      if (error instanceof ApisixReadError && error.code === "APISIX_READ_INVALID")
        throw new GatewayError("GATEWAY_REMOTE_INVALID", error.message, BAD_GATEWAY);
      throw new GatewayError("GATEWAY_REMOTE_UNAVAILABLE", "APISIX resource reading failed", SERVICE_UNAVAILABLE);
    } finally {
      clearTimeout(timer);
    }
  }
  return {
    prepare,
    async diff(input: GatewayInput, secret: string) {
      return preview(await prepare(input, secret));
    },
    async apply(input: GatewayApplyInput, secret: string) {
      const manifest = await prepare(input, secret);
      return execution.run(async () => {
        if (input.dryRun) return { ...(await preview(manifest)), dryRun: true, prune: input.prune };
        if (!deps.remote || !deps.writer)
          throw new GatewayError("GATEWAY_REMOTE_UNAVAILABLE", "APISIX is unavailable", SERVICE_UNAVAILABLE);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), deps.operationTimeoutMs ?? 60_000);
        try {
          let remote: Awaited<ReturnType<GatewayRemoteReader["read"]>>;
          try {
            remote = await deps.remote.read(controller.signal);
          } catch (error) {
            throw new GatewayError(
              error instanceof ApisixReadError && error.code === "APISIX_READ_INVALID"
                ? "GATEWAY_REMOTE_INVALID"
                : "GATEWAY_REMOTE_UNAVAILABLE",
              "APISIX resource reading failed",
              error instanceof ApisixReadError && error.code === "APISIX_READ_INVALID"
                ? BAD_GATEWAY
                : SERVICE_UNAVAILABLE,
            );
          }
          return await publishGatewayPlan({
            writer: deps.writer,
            plan: planChanges(manifest, remote),
            prune: input.prune,
            signal: controller.signal,
            block: execution.block,
          });
        } finally {
          clearTimeout(timer);
        }
      });
    },
    async validate(input: GatewayInput, secret: string) {
      const manifest = await prepare(input, secret);
      return { valid: true, resources: countResources(manifest.resources), issues: [] };
    },
  };
}

function safeIssues(issues: ValidationIssue[]) {
  const result = issues.map((issue) => ({
    path:
      issue.path.match(
        /^(?:service(?:\.plugin_configs)?|upstreams|plugin_metadata|routes|consumers|ssls)(?:\[\d+\])?/,
      )?.[0] ?? "manifest",
    message: issue.message.includes("private_key")
      ? "SSL requires cert and an external private_key"
      : issue.message.includes("secret") || issue.message.includes("sensitive")
        ? "Secret fields must use request placeholders or external secret references"
        : issue.message.includes("references missing")
          ? "Resource references a missing target"
          : issue.message.includes("trust all")
            ? "Trusted proxies must not include all addresses"
            : issue.message.includes("key")
              ? "Resource keys must be unique lowercase kebab-case segments"
              : "Resource does not satisfy manifest rules",
  }));
  return result.filter(
    (issue, index) =>
      result.findIndex((other) => other.path === issue.path && other.message === issue.message) === index,
  );
}

export type GatewayService = ReturnType<typeof createGatewayService>;

function sameSecret(supplied: string, expected: string) {
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
