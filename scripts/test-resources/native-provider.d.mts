import type { ManagedResourceRun } from "./managed-resources.mjs";
import type { ResourceProvider } from "./resource-provider.mjs";

export type NativeApisixConfigOptions = {
  httpPort: number;
  adminPort: number;
  etcdClientPort: number;
  apisixDir: string;
};

export type NativeResourceProviderConfig = {
  apisixInstallDir?: string;
  tempBaseDir?: string;
};

export type CleanupNativeResourceRunOptions = {
  respectKeep?: boolean;
  cleanupTimeoutMs?: number;
  diagnostics?: boolean;
};

export function parseSimpleYaml(source: string): unknown;
export function stringifySimpleYaml(value: unknown, indent?: number): string;
export function buildNativeApisixConfig(
  sourceYaml: string,
  options: NativeApisixConfigOptions,
): { adminKey: string; yaml: string };
export function cleanupNativeResourceRun(
  run: ManagedResourceRun,
  options?: CleanupNativeResourceRunOptions,
): Promise<void>;
export function createNativeResourceProvider(config?: NativeResourceProviderConfig): ResourceProvider;
export declare const nativeResourceProvider: ResourceProvider;
