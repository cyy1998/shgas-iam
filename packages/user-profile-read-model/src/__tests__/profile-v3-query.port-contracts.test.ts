import type {
  V3UserProfileQueryRepositoryPort,
} from "../query/profile-v3-query.port";
import type {
  V3UserProfileQueryRepository,
} from "../query/profile-v3-query.repository";
import { test } from "bun:test";

function assertAssignable<Port, _Provider extends Port>() {}

test("the v3 query repository satisfies its consumer-owned port", () => {
  assertAssignable<
    V3UserProfileQueryRepositoryPort,
    V3UserProfileQueryRepository
  >();
});
