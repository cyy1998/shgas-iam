import type { UserDocumentQueryRepositoryPort } from "../user-document-query.port";
import type { UserDocumentQueryRepository } from "../user-document-query.repository";

type AssertAssignable<Port, _Provider extends Port> = true;

type _UserDocumentQueryRepositoryPort = AssertAssignable<UserDocumentQueryRepositoryPort, UserDocumentQueryRepository>;
