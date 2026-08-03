import { z } from "zod";

export const SUBJECT_ACCESS_RECORD_VERSION = 1;

export const SubjectAccessStateSchema = z.enum([
  "enabled",
  "blocking",
  "disabled",
]);
export type SubjectAccessState = z.infer<typeof SubjectAccessStateSchema>;

export const SubjectAccessRecordV1Schema = z.object({
  version: z.literal(SUBJECT_ACCESS_RECORD_VERSION),
  subjectIdentifier: z.uuid(),
  state: SubjectAccessStateSchema,
  transitionId: z.uuid().optional(),
  updatedAt: z.iso.datetime(),
}).strict().superRefine((record, context) => {
  if (record.state === "blocking" && record.transitionId === undefined) {
    context.addIssue({
      code: "custom",
      path: ["transitionId"],
      message: "blocking Subject Access record requires a transition ID",
    });
  }
});

export type SubjectAccessRecordV1 = z.infer<typeof SubjectAccessRecordV1Schema>;

export interface SubjectAccessTransition {
  readonly subjectIdentifier: string;
  readonly transitionId: string;
  readonly previousCommittedTransitionId: string | null;
}

export interface SubjectAccessBeginReceipt {
  readonly subjectIdentifier: string;
  readonly transitionId: string;
}

export interface SubjectAccessMutationReceipt extends SubjectAccessBeginReceipt {
  readonly ownerToken: string;
}

export type SubjectAccessTransitionTarget
  = | "enabled"
    | "disabled"
    | "rollback";

export function serializeSubjectAccessRecord(record: SubjectAccessRecordV1) {
  return JSON.stringify(SubjectAccessRecordV1Schema.parse(record));
}

export function parseSubjectAccessRecord(serialized: string) {
  try {
    return SubjectAccessRecordV1Schema.safeParse(JSON.parse(serialized) as unknown);
  }
  catch {
    return {
      success: false as const,
      error: new z.ZodError([{
        code: "custom",
        path: [],
        message: "invalid Subject Access record JSON",
      }]),
    };
  }
}
