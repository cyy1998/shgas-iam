import type { DocumentFactsCacheRecord } from "../document";
export interface SubjectFactsPublisherPort<
  TFactsRecord extends { subjectIdentifier: string; sourceVersion: string } = DocumentFactsCacheRecord,
> {
  publish(record: TFactsRecord): Promise<{ status: "published" | "retained-newer" }>;
}
export interface UserDocumentRebuildLoggerPort {
  warn(data: Record<string, unknown>, message: string): void;
}
export interface SubjectAccessRepairPort {
  repairSubject(subjectIdentifier: string): Promise<unknown>;
}
