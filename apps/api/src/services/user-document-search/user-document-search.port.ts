import type { UserDocument } from "@iam/contracts";

export interface UserDocumentSearchPort {
  readonly searchDsl: (input: unknown, authenticatedClientCode: string) => Promise<UserDocument[]>;
}
