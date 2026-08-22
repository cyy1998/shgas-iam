import {
  OrganizationResponsibilityMutationError,
  OrganizationResponsibilityMutationErrorKind,
  pauseOrganizationResponsibilityAssignment,
} from '@admin/services/organization-responsibility';
import { ApiErrorCode } from '@iam/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  pause: vi.fn(),
}));

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      organizationResponsibility: {
        pauseAssignment: { mutate: api.pause },
      },
    },
  },
}));

describe('Organization Responsibility mutation service', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    [
      ApiErrorCode.ValidationFailed,
      OrganizationResponsibilityMutationErrorKind.Validation,
    ],
    [
      ApiErrorCode.OrganizationResponsibilityAssignmentNotFound,
      OrganizationResponsibilityMutationErrorKind.NotFound,
    ],
    [
      ApiErrorCode.EmploymentNotFound,
      OrganizationResponsibilityMutationErrorKind.NotFound,
    ],
    [
      ApiErrorCode.OrganizationNotFound,
      OrganizationResponsibilityMutationErrorKind.NotFound,
    ],
    [
      ApiErrorCode.OrganizationResponsibilityHolderEmploymentUnavailable,
      OrganizationResponsibilityMutationErrorKind.HolderUnavailable,
    ],
    [
      ApiErrorCode.OrganizationResponsibilityTargetOrganizationUnavailable,
      OrganizationResponsibilityMutationErrorKind.TargetUnavailable,
    ],
    [
      ApiErrorCode.OrganizationResponsibilityAssignmentNotOpen,
      OrganizationResponsibilityMutationErrorKind.NotOpen,
    ],
    [
      ApiErrorCode.OrganizationResponsibilityAssignmentDuplicateOpen,
      OrganizationResponsibilityMutationErrorKind.Duplicate,
    ],
    [
      ApiErrorCode.OrganizationResponsibilityAssignmentCardinalityConflict,
      OrganizationResponsibilityMutationErrorKind.Cardinality,
    ],
    [
      ApiErrorCode.Forbidden,
      OrganizationResponsibilityMutationErrorKind.Forbidden,
    ],
    [
      ApiErrorCode.InternalError,
      OrganizationResponsibilityMutationErrorKind.Internal,
    ],
  ])(
    'normalizes %s without exposing its transport message',
    async (serviceCode, kind) => {
      api.pause.mockRejectedValueOnce({
        message: 'raw transport message must stay hidden',
        data: { serviceCode },
      });

      const error = await pauseOrganizationResponsibilityAssignment({
        id: 31,
      }).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(OrganizationResponsibilityMutationError);
      expect(error).toMatchObject({ kind });
      expect((error as Error).message).not.toContain('raw transport');
      expect(api.pause).toHaveBeenCalledTimes(1);
    },
  );

  it('classifies a transport failure as network and never replays the mutation', async () => {
    api.pause.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await pauseOrganizationResponsibilityAssignment({
      id: 31,
    }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      kind: OrganizationResponsibilityMutationErrorKind.Network,
    });
    expect(api.pause).toHaveBeenCalledTimes(1);
  });
});
