export class InvalidSubjectClaimSelectionError extends Error {
  public readonly code = "INVALID_SUBJECT_CLAIM_SELECTION";

  constructor() {
    super("Subject Claim Selection is invalid");
    this.name = "InvalidSubjectClaimSelectionError";
  }
}
