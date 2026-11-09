import type { PublishedUserDocumentRow } from "../document";
export interface InternalUserDocumentQueryRepositoryPort {
  readonly getCurrentByUsername: (username: string) => Promise<PublishedUserDocumentRow | null>;
}
