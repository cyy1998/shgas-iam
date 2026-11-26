import type { createDocumentBuilder } from "../build/document-builder.service";
import type { createSubjectFactsRedisPublisher } from "../subject-facts/subject-facts-redis";
import type { createCurrentUserDocumentProjectionBundle, SubjectFactsPublisherPort } from "../worker";

type AssertAssignable<Port, _Provider extends Port> = true;

type _SubjectFactsPublisherPort = AssertAssignable<
  SubjectFactsPublisherPort,
  ReturnType<typeof createSubjectFactsRedisPublisher>
>;
type _UserDocumentBuilder = AssertAssignable<
  ReturnType<ReturnType<typeof createCurrentUserDocumentProjectionBundle>["createBuilder"]>,
  ReturnType<typeof createDocumentBuilder>
>;
