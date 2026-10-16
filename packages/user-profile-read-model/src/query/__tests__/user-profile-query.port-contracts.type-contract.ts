import type { UserProfileQueryRepositoryPort } from "../user-profile-query.port";
import type { UserProfileQueryRepository } from "../user-profile-query.repository";

type AssertAssignable<Port, _Provider extends Port> = true;

type _UserProfileQueryRepositoryPort = AssertAssignable<UserProfileQueryRepositoryPort, UserProfileQueryRepository>;
