import type { UserProfileDirtyRepository } from "../dirty.repository";
import type { UserProfileBuilder } from "../user-profile-builder.service";
import type { UserProfileJobProducer } from "../user-profile-job.producer";
import type { UserProfileMaintenanceRepository } from "../user-profile-maintenance.repository";
import type {
  createUserProfileJobProcessor,
  UserProfileJobProcessor,
} from "../user-profile-worker.module";
import type { UserProfileRepository } from "../user-profile.repository";
import type {
  UserProfileMaintenanceDirtyRepositoryPort,
  UserProfileMaintenanceJobProducerPort,
  UserProfileMaintenanceUserRepositoryPort,
  UserProfileRebuildBuilderPort,
  UserProfileRebuildDirtyStorePort,
  UserProfileRebuildProfileStorePort,
} from "../worker";
import { describe, test } from "bun:test";

function assertAssignable<Port, _Provider extends Port>() {}

type Assert<T extends true> = T;
type IsEqual<TActual, TExpected> = (
  <T>() => T extends TActual ? 1 : 2
) extends (
  <T>() => T extends TExpected ? 1 : 2
) ? true : false;
type _JobProcessorMatchesFactoryReturn = Assert<
  IsEqual<UserProfileJobProcessor, ReturnType<typeof createUserProfileJobProcessor>>
>;

describe("User Profile worker port contracts", () => {
  test("production providers satisfy the consumer-owned worker ports", () => {
    assertAssignable<UserProfileMaintenanceUserRepositoryPort, UserProfileMaintenanceRepository>();
    assertAssignable<UserProfileMaintenanceDirtyRepositoryPort, UserProfileDirtyRepository>();
    assertAssignable<UserProfileMaintenanceJobProducerPort, UserProfileJobProducer>();

    assertAssignable<UserProfileRebuildProfileStorePort, UserProfileRepository>();
    assertAssignable<UserProfileRebuildDirtyStorePort, UserProfileDirtyRepository>();
    assertAssignable<UserProfileRebuildBuilderPort, UserProfileBuilder>();
  });
});
