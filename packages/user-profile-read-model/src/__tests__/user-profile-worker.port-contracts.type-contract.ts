import type { createProfileBuilder } from "../build/profile-builder.service";
import type { UserProfileDirtyRepository } from "../invalidation/dirty.repository";
import type { UserProfileJobProducer } from "../invalidation/user-profile-job.producer";
import type { createSubjectFactsRedisPublisher } from "../subject-facts/subject-facts-redis";
import type { createCurrentUserProfileProjectionBundle, SubjectFactsPublisherPort, UserProfileMaintenanceDirtyRepositoryPort, UserProfileMaintenanceJobProducerPort, UserProfileMaintenanceUserRepositoryPort, UserProfilePublicationPort, UserProfileRebuildBuilderPort, UserProfileRebuildDirtyStorePort } from "../worker";
import type { UserProfileMaintenanceRepository } from "../worker/user-profile-maintenance.repository";
import type {
  createUserProfileJobProcessor,
  UserProfileJobProcessor,
} from "../worker/user-profile-worker.module";

type AssertAssignable<Port, _Provider extends Port> = true;

type Assert<T extends true> = T;
type IsEqual<TActual, TExpected> = (
  <T>() => T extends TActual ? 1 : 2
) extends (
  <T>() => T extends TExpected ? 1 : 2
) ? true : false;
type _JobProcessorMatchesFactoryReturn = Assert<
  IsEqual<UserProfileJobProcessor, ReturnType<typeof createUserProfileJobProcessor>>
>;

type _UserProfileMaintenanceUserRepositoryPort = AssertAssignable<
  UserProfileMaintenanceUserRepositoryPort,
  UserProfileMaintenanceRepository
>;
type _UserProfileMaintenanceDirtyRepositoryPort = AssertAssignable<
  UserProfileMaintenanceDirtyRepositoryPort,
  UserProfileDirtyRepository
>;
type _UserProfileMaintenanceJobProducerPort = AssertAssignable<
  UserProfileMaintenanceJobProducerPort,
  UserProfileJobProducer
>;

type _UserProfilePublicationPort = AssertAssignable<
  UserProfilePublicationPort,
  ReturnType<ReturnType<typeof createCurrentUserProfileProjectionBundle>["createPublicationRepository"]>
>;
type _SubjectFactsPublisherPort = AssertAssignable<
  SubjectFactsPublisherPort,
  ReturnType<typeof createSubjectFactsRedisPublisher>
>;
type _UserProfileRebuildDirtyStorePort = AssertAssignable<
  UserProfileRebuildDirtyStorePort,
  UserProfileDirtyRepository
>;
type _UserProfileRebuildBuilderPort = AssertAssignable<
  UserProfileRebuildBuilderPort,
  ReturnType<typeof createProfileBuilder>
>;
