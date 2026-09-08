import { z } from "zod";
import { SubjectAccessUnavailableError } from "./errors";

const SubjectAccessContextSchema = z.object({
  version: z.literal(1),
  subjectIdentifier: z.uuid(),
  transitionId: z.uuid(),
}).strict();

export type SubjectAccessContext = z.infer<typeof SubjectAccessContextSchema>;

/** Persisted context is identity data, never an access permission. */
export function parseSubjectAccessContext(serialized: unknown): SubjectAccessContext {
  try {
    if (typeof serialized !== "string")
      throw new Error("Subject context must be serialized");
    return SubjectAccessContextSchema.parse(JSON.parse(serialized) as unknown);
  }
  catch {
    throw new SubjectAccessUnavailableError();
  }
}

export function encodeSubjectAccessContext(context: SubjectAccessContext): string {
  try {
    return JSON.stringify(SubjectAccessContextSchema.parse(context));
  }
  catch {
    throw new SubjectAccessUnavailableError();
  }
}
