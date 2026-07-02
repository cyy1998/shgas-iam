import type { WorkerEnv } from "@worker/env";
import type { WorkerQueueRegistration } from "@worker/modules/registry";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { HonoAdapter } from "@bull-board/hono";
import { serveStatic } from "hono/bun";

export interface CreateDashboardPluginInput {
  env: WorkerEnv;
  queues: WorkerQueueRegistration[];
}

export function createDashboardQueueAdapters(input: CreateDashboardPluginInput) {
  return input.queues.map(registration =>
    new BullMQAdapter(registration.queue as never, {
      readOnlyMode: input.env.dashboard.readOnly,
      displayName: registration.queueName,
      description: `${registration.moduleKey} queue`,
    }),
  );
}

export function createDashboardPlugin(input: CreateDashboardPluginInput) {
  const serverAdapter = new HonoAdapter(serveStatic);
  serverAdapter.setBasePath(input.env.dashboard.path);

  createBullBoard({
    queues: createDashboardQueueAdapters(input),
    serverAdapter,
  });

  return serverAdapter.registerPlugin();
}
