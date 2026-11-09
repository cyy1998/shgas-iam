import type { createDocumentBuilder } from "../build/document-builder.service";
import type { UserDocumentJobProducer } from "../invalidation/user-document-job.producer";
import type { createSubjectFactsRedisPublisher } from "../subject-facts/subject-facts-redis";
import type { createCurrentUserDocumentProjectionBundle, SubjectFactsPublisherPort } from "../worker";
import type { createUserDocumentJobProcessor, UserDocumentJobProcessor } from "../worker/user-document-worker.module";

type AssertAssignable<Port, _Provider extends Port> = true;

type Assert<T extends true> = T;
type IsEqual<TActual, TExpected> =
  (<T>() => T extends TActual ? 1 : 2) extends <T>() => T extends TExpected ? 1 : 2 ? true : false;
type _JobProcessorMatchesFactoryReturn = Assert<
  IsEqual<UserDocumentJobProcessor, ReturnType<typeof createUserDocumentJobProcessor>>
>;

type _SubjectFactsPublisherPort = AssertAssignable<
  SubjectFactsPublisherPort,
  ReturnType<typeof createSubjectFactsRedisPublisher>
>;
type _UserDocumentBuilder = AssertAssignable<
  ReturnType<ReturnType<typeof createCurrentUserDocumentProjectionBundle>["createBuilder"]>,
  ReturnType<typeof createDocumentBuilder>
>;
