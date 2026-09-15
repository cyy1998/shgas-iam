import type {
  V3UserProfileQueryRepositoryPort,
} from "../query/profile-v3-query.port";
import type {
  V3UserProfileQueryRepository,
} from "../query/profile-v3-query.repository";

type AssertAssignable<Port, _Provider extends Port> = true;

type _V3UserProfileQueryRepositoryPort = AssertAssignable<
  V3UserProfileQueryRepositoryPort,
  V3UserProfileQueryRepository
>;
