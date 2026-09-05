import type { CustomSsoClientConfig } from "@iam/db/schema";
import type { SubjectProjectionCutoverManifest } from "./subject-projection-cutover.manifest";
import { CustomSsoClientMode } from "@iam/contracts";

export interface SubjectProjectionCutoverClientRecord {
  clientCode: string;
  customSsoEnabled: boolean;
  customSsoConfig: CustomSsoClientConfig | null;
  customSsoSecretHash: string | null;
  customSsoConfigVersion: number;
  legacyCustomSsoAttributesPresent: boolean;
}

export interface SubjectProjectionClientCutoverDeps {
  clients: {
    readInventory: (clientCodes: string[]) => Promise<{
      legacyEnabledClientCodes: string[];
      records: SubjectProjectionCutoverClientRecord[];
    }>;
    applyUpdates: (updates: SubjectProjectionCutoverClientRecord[]) => Promise<void>;
  };
  secrets: {
    generate: () => string;
    hash: (secret: string) => Promise<string>;
  };
}

export interface SubjectProjectionClientVerificationFailure {
  clientCode: string;
  reason:
    | "config-mismatch"
    | "config-version-not-ready"
    | "enabled-state-mismatch"
    | "legacy-attributes-not-removed"
    | "manifest-missing-enabled-client"
    | "manifest-client-not-found"
    | "secret-delivery-unconfirmed"
    | "secret-not-allowed"
    | "secret-not-ready";
}

export function createSubjectProjectionClientCutover(
  deps: SubjectProjectionClientCutoverDeps,
) {
  async function applyManifest(
    manifest: SubjectProjectionCutoverManifest,
    options: {
      deliverGeneratedSecrets?: (
        secrets: Array<{ clientCode: string; secret: string }>,
      ) => Promise<void>;
    } = {},
  ) {
    const manifestCodes = manifest.clients.map(client => client.clientCode);
    const inventory = await deps.clients.readInventory(manifestCodes);
    assertLegacyCoverage(inventory.legacyEnabledClientCodes, manifestCodes);
    const recordsByCode = new Map(
      inventory.records.map(record => [record.clientCode, record]),
    );
    const generatedSecrets: Array<{ clientCode: string; secret: string }> = [];
    const blockers: Array<{
      clientCode: string;
      reason: "secret-delivery-unconfirmed";
    }> = [];
    const updates: SubjectProjectionCutoverClientRecord[] = [];
    let hasChanges = false;

    for (const client of manifest.clients) {
      const current = recordsByCode.get(client.clientCode);
      if (current === undefined) {
        throw new Error(`manifest client does not exist: ${client.clientCode}`);
      }
      if (
        current.customSsoConfig !== null
        && !sameConfig(current.customSsoConfig, client.config)
      ) {
        throw new Error(
          `manifest conflicts with existing Custom SSO configuration: ${client.clientCode}`,
        );
      }

      let secretHash = current.customSsoSecretHash;
      if (client.config.mode === CustomSsoClientMode.Gateway) {
        if (secretHash !== null) {
          throw new Error(`Gateway client unexpectedly has a Custom SSO secret: ${client.clientCode}`);
        }
      }
      else if (secretHash === null) {
        if (current.customSsoConfig !== null) {
          throw new Error(`Independent client has no reusable Custom SSO secret: ${client.clientCode}`);
        }
        if (client.secretDelivery.status === "confirmed") {
          throw new Error(
            `Independent client secret cannot be confirmed before it is generated: ${client.clientCode}`,
          );
        }
        const secret = deps.secrets.generate();
        secretHash = await deps.secrets.hash(secret);
        generatedSecrets.push({ clientCode: client.clientCode, secret });
      }

      const secretConfirmed
        = client.config.mode === CustomSsoClientMode.Gateway
          || client.secretDelivery.status === "confirmed";
      if (!secretConfirmed) {
        blockers.push({
          clientCode: client.clientCode,
          reason: "secret-delivery-unconfirmed",
        });
      }
      const enabled = client.targetEnabled && secretConfirmed;
      const configurationChanged = current.customSsoConfig === null
        || current.customSsoEnabled !== enabled
        || current.customSsoSecretHash !== secretHash;
      const changed = configurationChanged
        || current.legacyCustomSsoAttributesPresent;
      hasChanges ||= changed;
      updates.push(changed
        ? {
            ...current,
            customSsoEnabled: enabled,
            customSsoConfig: client.config,
            customSsoSecretHash: secretHash,
            customSsoConfigVersion: current.customSsoConfigVersion
              + (configurationChanged ? 1 : 0),
            legacyCustomSsoAttributesPresent: false,
          }
        : current);
    }

    if (generatedSecrets.length > 0 && options.deliverGeneratedSecrets !== undefined)
      await options.deliverGeneratedSecrets(generatedSecrets);
    if (hasChanges) {
      await deps.clients.applyUpdates(updates);
    }
    return { blockers, generatedSecrets };
  }

  async function verifyManifest(manifest: SubjectProjectionCutoverManifest) {
    const manifestCodes = manifest.clients.map(client => client.clientCode);
    const inventory = await deps.clients.readInventory(manifestCodes);
    const recordsByCode = new Map(
      inventory.records.map(record => [record.clientCode, record]),
    );
    const failures: SubjectProjectionClientVerificationFailure[] = [];
    const manifestCodeSet = new Set(manifestCodes);
    for (const clientCode of [...new Set(inventory.legacyEnabledClientCodes)].sort()) {
      if (!manifestCodeSet.has(clientCode)) {
        failures.push({ clientCode, reason: "manifest-missing-enabled-client" });
      }
    }

    for (const client of manifest.clients) {
      const current = recordsByCode.get(client.clientCode);
      if (current === undefined) {
        failures.push({
          clientCode: client.clientCode,
          reason: "manifest-client-not-found",
        });
        continue;
      }
      if (current.legacyCustomSsoAttributesPresent) {
        failures.push({
          clientCode: client.clientCode,
          reason: "legacy-attributes-not-removed",
        });
      }
      if (
        current.customSsoConfig === null
        || !sameConfig(current.customSsoConfig, client.config)
      ) {
        failures.push({ clientCode: client.clientCode, reason: "config-mismatch" });
      }
      if (current.customSsoConfigVersion < 1) {
        failures.push({
          clientCode: client.clientCode,
          reason: "config-version-not-ready",
        });
      }
      if (client.config.mode === CustomSsoClientMode.Independent) {
        if (client.secretDelivery.status !== "confirmed") {
          failures.push({
            clientCode: client.clientCode,
            reason: "secret-delivery-unconfirmed",
          });
        }
        if (current.customSsoSecretHash === null) {
          failures.push({ clientCode: client.clientCode, reason: "secret-not-ready" });
        }
      }
      else if (current.customSsoSecretHash !== null) {
        failures.push({ clientCode: client.clientCode, reason: "secret-not-allowed" });
      }
      if (current.customSsoEnabled !== client.targetEnabled) {
        failures.push({
          clientCode: client.clientCode,
          reason: "enabled-state-mismatch",
        });
      }
    }

    return { failures };
  }

  return { applyManifest, verifyManifest };
}

function assertLegacyCoverage(legacyCodes: string[], manifestCodes: string[]) {
  const manifestCodeSet = new Set(manifestCodes);
  const missing = [...new Set(legacyCodes)]
    .filter(clientCode => !manifestCodeSet.has(clientCode))
    .sort();
  if (missing.length > 0) {
    throw new Error(
      `manifest does not cover enabled legacy Custom SSO clients: ${missing.join(", ")}`,
    );
  }
}

function sameConfig(left: CustomSsoClientConfig, right: CustomSsoClientConfig) {
  return JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}
