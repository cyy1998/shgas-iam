import { SubjectAccessUnavailableError } from "@iam/api-core/subject-access";

export class PrincipalSessionInspectionUnavailableError extends SubjectAccessUnavailableError {
  constructor(options?: { cause?: unknown }) {
    super(options?.cause);
    this.name = "PrincipalSessionInspectionUnavailableError";
  }
}
