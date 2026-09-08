import { oidcProtocolObjectMaintenancePrefixes } from "../../storage/redis-adapter.ts";

export function oidcObjectMaintenanceOwner() {
  return { owner: "oidcObjects", prefixes: oidcProtocolObjectMaintenancePrefixes() };
}
