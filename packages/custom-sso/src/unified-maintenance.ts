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

export type CustomSsoInventoryRedis = MaintenanceScanRedis;
export type CustomSsoMaintenanceRedis = MaintenanceRemovalRedis;
export type CustomSsoInventoryInput = MaintenanceScanInput;

function ownerPrefix(namespace: string) {
  return `${z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace)}:custom-sso:`;
}

export function createUnifiedCustomSsoVerifier(redis: CustomSsoInventoryRedis, namespace: string) {
  return createMaintenanceVerifier(redis, ownerPrefix(namespace));
}

export function createUnifiedCustomSsoInventory(redis: CustomSsoInventoryRedis, namespace: string) {
  return createMaintenanceInventory(redis, ownerPrefix(namespace));
}

export function createUnifiedCustomSsoMaintenance(redis: CustomSsoMaintenanceRedis, namespace: string) {
  return createMaintenanceRemoval(redis, ownerPrefix(namespace));
}
