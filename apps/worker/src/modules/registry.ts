import type { WorkerModuleSelection } from "@worker/env";

export interface WorkerQueueRegistration {
  moduleKey: string;
  queueName: string;
  queue: unknown;
}

export interface WorkerModule {
  key: string;
  queueRegistrations: WorkerQueueRegistration[];
  startConsumers: () => Promise<void>;
  close: () => Promise<void>;
}

export function resolveModuleKeys(
  selection: WorkerModuleSelection,
  knownModules: readonly WorkerModule[],
): string[] {
  const knownKeys = knownModules.map(module => module.key);

  if (selection.mode === "all")
    return knownKeys;
  if (selection.mode === "none")
    return [];

  const unknownKeys = selection.keys.filter(key => !knownKeys.includes(key));
  if (unknownKeys.length > 0) {
    throw new Error(`Unknown worker module key(s): ${unknownKeys.join(", ")}`);
  }

  return selection.keys;
}

export function selectModules(
  selection: WorkerModuleSelection,
  knownModules: readonly WorkerModule[],
): WorkerModule[] {
  const keys = new Set(resolveModuleKeys(selection, knownModules));
  return knownModules.filter(module => keys.has(module.key));
}

export function selectQueueRegistrations(
  selection: WorkerModuleSelection,
  knownModules: readonly WorkerModule[],
): WorkerQueueRegistration[] {
  return selectModules(selection, knownModules).flatMap(module => module.queueRegistrations);
}

export async function startWorkerModules(modules: readonly WorkerModule[]) {
  for (const module of modules) {
    await module.startConsumers();
  }
}

export async function closeWorkerModules(modules: readonly WorkerModule[]) {
  for (const module of modules.toReversed()) {
    await module.close();
  }
}
