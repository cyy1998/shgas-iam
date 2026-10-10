import { z } from "zod";
import type { MaintenanceRemovalRedis, MaintenanceScanInput, MaintenanceScanRedis } from "./storage/maintenance-scan";
import {
  createMaintenanceInventory,
  createMaintenanceRemoval,
  createMaintenanceVerifier,
} from "./storage/maintenance-scan";

export type UnifiedSessionInventoryRedis = MaintenanceScanRedis;
export type UnifiedSessionMaintenanceRedis = MaintenanceRemovalRedis;
export type UnifiedSessionInventoryInput = MaintenanceScanInput;

function ownerPrefix(namespace: string) {
  return `${z
    .string()
    .regex(/^[\w:-]+$/u)
    .parse(namespace)}:unified:`;
}

export function createUnifiedSessionVerifier(redis: UnifiedSessionInventoryRedis, namespace: string) {
  return createMaintenanceVerifier(redis, ownerPrefix(namespace));
}

export function createUnifiedSessionInventory(redis: UnifiedSessionInventoryRedis, namespace: string) {
  return createMaintenanceInventory(redis, ownerPrefix(namespace));
}

export function createUnifiedSessionMaintenance(redis: UnifiedSessionMaintenanceRedis, namespace: string) {
  return createMaintenanceRemoval(redis, ownerPrefix(namespace));
}
