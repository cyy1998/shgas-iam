import type {
  MaintenanceRemovalRedis,
  MaintenanceScanInput,
  MaintenanceScanRedis,
} from "@iam/session-kernel/maintenance";
import {
  createMaintenanceInventory,
  createMaintenanceRemoval,
  createMaintenanceVerifier,
} from "@iam/session-kernel/maintenance";
import { z } from "zod";

export type OidcInventoryRedis = MaintenanceScanRedis;
export type OidcMaintenanceRedis = MaintenanceRemovalRedis;
export type OidcInventoryInput = MaintenanceScanInput;

function ownerPrefix(namespace: string) {
  return `${z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace)}:oidc:`;
}

export function createOidcVerifier(redis: OidcInventoryRedis, namespace: string) {
  return createMaintenanceVerifier(redis, ownerPrefix(namespace));
}

export function createOidcInventory(redis: OidcInventoryRedis, namespace: string) {
  return createMaintenanceInventory(redis, ownerPrefix(namespace));
}

export function createOidcMaintenance(redis: OidcMaintenanceRedis, namespace: string) {
  return createMaintenanceRemoval(redis, ownerPrefix(namespace));
}
