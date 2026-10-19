import type { UserProfileSearchRepositoryPort } from "../query/user-profile-search.port";
import type { UserProfileSearchRepository } from "../query/user-profile-search.repository";

type AssertAssignable<Port, _Provider extends Port> = true;

type _UserProfileSearchRepositoryPort = AssertAssignable<UserProfileSearchRepositoryPort, UserProfileSearchRepository>;
