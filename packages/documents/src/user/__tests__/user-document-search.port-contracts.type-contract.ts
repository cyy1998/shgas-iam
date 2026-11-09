import type { UserDocumentSearchRepositoryPort } from "../query/user-document-search.port";
import type { UserDocumentSearchRepository } from "../query/user-document-search.repository";

type AssertAssignable<Port, _Provider extends Port> = true;

type _UserDocumentSearchRepositoryPort = AssertAssignable<
  UserDocumentSearchRepositoryPort,
  UserDocumentSearchRepository
>;
