import type { SubjectFactsCacheRecordV1 } from "@iam/user-profile-read-model/worker";
import { Writable } from "node:stream";
import { buildLoggerOptions, LoggerSourceApp } from "@iam/api-core/logger";
import { UserProfileDirtyReason, UserStatus } from "@iam/contracts";
import {
  createUserProfileJobProcessor,
  createUserProfileRebuildProcessor,
} from "@iam/user-profile-read-model/worker";
import { describe, expect, test } from "bun:test";
import pino from "pino";

const SUBJECT_FACTS_CANARY = "SUBJECT_FACTS_MUST_NOT_REACH_LOGS";
const NOW = new Date("2026-07-25T10:00:00.000Z");

describe("User Profile publication logging", () => {
  test("serializes cache failures without the ioredis command or Subject Facts record", async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString());
        callback();
      },
    });
    const logger = pino(buildLoggerOptions({
      nodeEnv: "test",
      logFormat: "json",
      sourceApp: LoggerSourceApp.Worker,
    }), stream).child({ sourceApp: LoggerSourceApp.Worker });
    let rejectedRecord: SubjectFactsCacheRecordV1 | undefined;
    const rebuildProcessor = createUserProfileRebuildProcessor({
      dirtyRepository: {
        claimForProcessing: async () => ({ userId: 1, dirtyVersion: "4" }),
        markFailed: async () => {
          throw new Error("cache failure must not mark the committed publication as failed");
        },
      },
      builder: {
        buildOne: async () => ({
          userId: 1,
          subjectIdentifier: "8af9666f-3e20-49ef-bd03-7ca7f5c51ed4",
          username: "user1",
          name: "User 1",
          mobile: null,
          wxId: null,
          status: UserStatus.Enable,
          isDelete: false,
          searchVisible: true,
          profileSchemaVersion: 1,
          sourceDirtyVersion: "4",
          detail: {} as never,
          searchDoc: {} as never,
          subjectFacts: {
            employments: [{
              isPrimary: true,
              organization: {
                code: "ORG",
                name: SUBJECT_FACTS_CANARY,
                type: "department",
                path: [{
                  code: "ORG",
                  name: SUBJECT_FACTS_CANARY,
                  type: "department",
                }],
              },
              position: {
                code: "POSITION",
                name: "Position",
              },
              clientAuthorizations: [],
            }],
          },
          rebuiltAt: NOW,
        }),
      },
      publicationRepository: {
        publishCandidate: async () => ({ status: "published" }),
      },
      subjectFactsPublisher: {
        publish: async (record) => {
          rejectedRecord = record;
          const serializedRecord = JSON.stringify(record);
          throw Object.assign(
            new Error(`ERR failed to evaluate Subject Facts ${SUBJECT_FACTS_CANARY}`),
            {
              name: "ReplyError",
              code: "ERR",
              command: {
                name: "eval",
                args: ["return redis.call('set', KEYS[1], ARGV[1])", "1", "subject-key", serializedRecord],
              },
            },
          );
        },
      },
      subjectAccessRepair: {
        repairSubject: async () => ({ status: "stable" }),
      },
      logger,
      clock: { nowDate: () => NOW },
    });
    const processor = createUserProfileJobProcessor({
      rebuildProcessor,
      logger,
    });

    await expect(processor({
      id: "rebuild-user-profile|1|4",
      name: "rebuild-user-profile",
      data: {
        userId: 1,
        dirtyVersion: "4",
        reason: UserProfileDirtyReason.UserUpdated,
      },
    })).resolves.toMatchObject({
      status: "rebuilt",
      cacheStatus: "failed",
    });

    expect(rejectedRecord).toBeDefined();
    expect(lines).toHaveLength(2);
    const output = lines.join("");
    const logs = output.trim().split("\n").map(line => JSON.parse(line) as Record<string, unknown>);
    expect(logs).toContainEqual(expect.objectContaining({
      sourceApp: LoggerSourceApp.Worker,
      userId: 1,
      dirtyVersion: "4",
      cacheStatus: "failed",
      errorType: "ReplyError",
      errorCode: "ERR",
      msg: "user profile Subject Facts cache publication failed",
    }));
    expect(logs).toContainEqual(expect.objectContaining({
      sourceApp: LoggerSourceApp.Worker,
      userId: 1,
      dirtyVersion: "4",
      jobId: "rebuild-user-profile|1|4",
      status: "rebuilt",
      cacheStatus: "failed",
      msg: "user profile rebuild job processed",
    }));
    expect(logs.every(log => log.err === undefined)).toBe(true);
    expect(output).not.toContain(SUBJECT_FACTS_CANARY);
    expect(output).not.toContain(JSON.stringify(rejectedRecord));
    expect(output).not.toContain("\"command\"");
    expect(output).not.toContain("\"args\"");
  });
});
