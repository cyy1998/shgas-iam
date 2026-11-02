/** A deterministic source-data failure raised after successful database reads. */
export class UserDocumentSourceIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserDocumentSourceIntegrityError";
  }
}
