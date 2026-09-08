import {
  createOrganizationResponsibilityAssignment,
  endOrganizationResponsibilityAssignment,
  OrganizationResponsibilityMutationError,
  OrganizationResponsibilityMutationErrorKind,
  pauseOrganizationResponsibilityAssignment,
  resumeOrganizationResponsibilityAssignment,
} from '@admin/services/organization-responsibility';
import {
  ApiErrorCode,
  OrganizationResponsibilityTypeCode,
} from '@iam/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  create: vi.fn(),
  end: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
}));

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      organizationResponsibility: {
        createAssignment: { mutate: api.create },
        endAssignment: { mutate: api.end },
        pauseAssignment: { mutate: api.pause },
        resumeAssignment: { mutate: api.resume },
      },
    },
  },
}));

describe('Organization Responsibility mutation service', () => {
  beforeEach(() => vi.clearAllMocks());

  it('preserves the created resource inside the unified result', async () => {
    const outcome = { changed: true, result: { id: 31 } };
    api.create.mockResolvedValueOnce(outcome);

    const result = await createOrganizationResponsibilityAssignment({
      orgCode: 'FIN',
      typeCode: OrganizationResponsibilityTypeCode.Head,
      employmentId: 42,
    });

    expect(result).toEqual(outcome);
  });

  it.each([
    [pauseOrganizationResponsibilityAssignment, api.pause],
    [resumeOrganizationResponsibilityAssignment, api.resume],
    [endOrganizationResponsibilityAssignment, api.end],
  ])(
    'preserves changed and no-op lifecycle results without replay',
    async (mutate, mock) => {
      for (const changed of [true, false]) {
        mock.mockResolvedValueOnce({ changed, result: null });
        const outcome = await mutate({ id: 31 });
        expect(outcome).toEqual({ changed, result: null });
      }
      expect(mock).toHaveBeenCalledTimes(2);
    },
  );

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
      ApiErrorCode.OrganizationResponsibilityAssignmentUnmanageableConflict,
      OrganizationResponsibilityMutationErrorKind.Unmanageable,
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
