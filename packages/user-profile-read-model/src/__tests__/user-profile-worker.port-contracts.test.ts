import type { createProfileBuilder } from "../build/profile-builder.service";
import type { UserProfileDirtyRepository } from "../invalidation/dirty.repository";
import type { UserProfileJobProducer } from "../invalidation/user-profile-job.producer";
import type { createProfilePublicationRepository } from "../publication/profile-publication.repository";
import type { createSubjectFactsRedisPublisher } from "../subject-facts/subject-facts-redis";
import type {
  SubjectFactsPublisherPort,
  UserProfileMaintenanceDirtyRepositoryPort,
  UserProfileMaintenanceJobProducerPort,
  UserProfileMaintenanceUserRepositoryPort,
  UserProfilePublicationPort,
  UserProfileRebuildBuilderPort,
  UserProfileRebuildDirtyStorePort,
} from "../worker";
import type { UserProfileMaintenanceRepository } from "../worker/user-profile-maintenance.repository";
import type {
  createUserProfileJobProcessor,
  UserProfileJobProcessor,
} from "../worker/user-profile-worker.module";
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

    assertAssignable<UserProfilePublicationPort, ReturnType<typeof createProfilePublicationRepository>>();
    assertAssignable<SubjectFactsPublisherPort, ReturnType<typeof createSubjectFactsRedisPublisher>>();
    assertAssignable<UserProfileRebuildDirtyStorePort, UserProfileDirtyRepository>();
    assertAssignable<UserProfileRebuildBuilderPort, ReturnType<typeof createProfileBuilder>>();
  });
});
