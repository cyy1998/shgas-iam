import type { UserStatus } from "@iam/contracts";
import { z } from "@hono/zod-openapi";
import { UserStatus as UserStatusValues } from "@iam/contracts";

export const PublishedProfileBaseSchema = z.object({
  userId: z.number().int().positive(),
  subjectIdentifier: z.uuid(),
  username: z.string().min(1),
  name: z.string().min(1),
  mobile: z.string().nullable(),
  wxId: z.string().nullable(),
  status: z.enum(UserStatusValues),
  isDelete: z.boolean(),
  searchVisible: z.boolean(),
  sourceDirtyVersion: z.string().regex(/^[1-9]\d*$/u),
  rebuiltAt: z.date(),
}).strict();

export interface PublishedProfileRowInput {
  userId: number;
  subjectIdentifier: string;
  username: string;
  name: string;
  mobile: string | null;
  wxId: string | null;
  status: UserStatus;
  isDelete: boolean;
  searchVisible: boolean;
  profileSchemaVersion: number;
  sourceDirtyVersion: string;
  detail: unknown;
  searchDoc: unknown;
  subjectFacts: unknown;
  rebuiltAt: Date;
}
