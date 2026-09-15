import { beforeEach, expect, it, vi } from 'vitest';
import {
  getAdminAuthorizationReasonText,
  getAdminCapabilitySummary,
} from './authorization';

const { capabilitySummaryQuery } = vi.hoisted(() => ({
  capabilitySummaryQuery: vi.fn(),
}));

vi.mock('@admin/lib/api-client', () => ({
  apiClient: {
    admin: {
      authorization: {
        capabilitySummary: { query: capabilitySummaryQuery },
      },
    },
  },
}));

beforeEach(() => {
  capabilitySummaryQuery.mockReset();
});

it('hides the capability procedure path behind the authorization service', async () => {
  const summary = { collectionActions: {}, visibleModules: [] };
  capabilitySummaryQuery.mockResolvedValue(summary);

  const result = await getAdminCapabilitySummary();

  expect(capabilitySummaryQuery).toHaveBeenCalledWith({});
  expect(result).toBe(summary);
});

it('returns no explanation when no authorization reason is supplied', () => {
  expect(getAdminAuthorizationReasonText(null)).toBeNull();
});
