import type { JobsOptions, Processor, QueueOptions, WorkerOptions } from "bullmq";
import type { BullMqRedisConfig, CreateBullMqConnectionOptions } from "./connection";
import { Queue, Worker } from "bullmq";
import { createBullMqConnectionOptions } from "./connection";
import { DEFAULT_QUEUE_PREFIX, resolveDefaultJobOptions } from "./options";

export type CreateJobQueueOptions = Omit<QueueOptions, "connection" | "defaultJobOptions" | "prefix">;

export interface CreateJobQueueInput {
  name: string;
  redis: BullMqRedisConfig;
  prefix?: string;
  defaultJobOptions?: JobsOptions;
  queueOptions?: CreateJobQueueOptions;
  connectionOptions?: CreateBullMqConnectionOptions;
}

export type JobQueue<DataType = unknown, ResultType = unknown, NameType extends string = string> = Queue<
  DataType,
  ResultType,
  NameType,
  DataType,
  ResultType,
  NameType
>;

export function createJobQueue<DataType = unknown, ResultType = unknown, NameType extends string = string>(
  input: CreateJobQueueInput,
): JobQueue<DataType, ResultType, NameType> {
  const connection = createBullMqConnectionOptions(input.redis, input.connectionOptions);

  return new Queue<DataType, ResultType, NameType, DataType, ResultType, NameType>(input.name, {
    ...input.queueOptions,
    connection,
    prefix: input.prefix ?? DEFAULT_QUEUE_PREFIX,
    defaultJobOptions: resolveDefaultJobOptions(input.defaultJobOptions),
  });
}

export type CreateJobWorkerOptions = Omit<WorkerOptions, "connection" | "concurrency" | "prefix">;

export interface CreateJobWorkerInput<DataType = unknown, ResultType = unknown, NameType extends string = string> {
  name: string;
  redis: BullMqRedisConfig;
  processor: Processor<DataType, ResultType, NameType>;
  prefix?: string;
  concurrency?: number;
  workerOptions?: CreateJobWorkerOptions;
  connectionOptions?: CreateBullMqConnectionOptions;
}

export function createJobWorker<DataType = unknown, ResultType = unknown, NameType extends string = string>(
  input: CreateJobWorkerInput<DataType, ResultType, NameType>,
): Worker<DataType, ResultType, NameType> {
  const connection = createBullMqConnectionOptions(input.redis, input.connectionOptions);

  return new Worker<DataType, ResultType, NameType>(input.name, input.processor, {
    ...input.workerOptions,
    connection,
    prefix: input.prefix ?? DEFAULT_QUEUE_PREFIX,
    concurrency: input.concurrency,
  });
}
