import {
  EmploymentStatus,
  PositionStatus,
  RoleAssignmentTargetType,
} from '@iam/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeAssignmentCreateInput,
  requestClientOptions,
  requestEmploymentOptions,
  requestPositionOptions,
} from '../role-selectors';

const searchClients = vi.hoisted(() => vi.fn());
const searchPositions = vi.hoisted(() => vi.fn());
const searchEmployments = vi.hoisted(() => vi.fn());

vi.mock('@admin/services/client', () => ({ searchClients }));
vi.mock('@admin/services/position', () => ({ searchPositions }));
vi.mock('@admin/services/employment', () => ({ searchEmployments }));

describe('role selector helpers', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('maps client search results to clientCode select values', async () => {
    searchClients.mockResolvedValue({
      result: [
        {
          clientCode: 'iam-admin',
          clientName: 'IAM 管理后台',
        },
      ],
      total: 1,
    });

    await expect(requestClientOptions({ keyWords: 'iam' })).resolves.toEqual([
      { label: 'IAM 管理后台（iam-admin）', value: 'iam-admin' },
    ]);
    expect(searchClients).toHaveBeenCalledWith({
      pageNum: 1,
      pageSize: 20,
      conditions: {
        fuzzyConditions: { text: 'iam' },
        exactConditions: {},
      },
    });
  });

  it('does not render undefined for client options missing a display name', async () => {
    searchClients.mockResolvedValue({
      result: [
        {
          clientCode: 'legacy-app',
        },
      ],
      total: 1,
    });

    await expect(requestClientOptions({})).resolves.toEqual([
      { label: 'legacy-app', value: 'legacy-app' },
    ]);
  });

  it('searches only enabled positions and submits posCode values', async () => {
    searchPositions.mockResolvedValue({
      result: [{ posCode: 'FIN-001', posName: '财务经理' }],
      total: 1,
    });

    await expect(requestPositionOptions({ keyWords: '财务' })).resolves.toEqual(
      [{ label: '财务经理（FIN-001）', value: 'FIN-001' }],
    );
    expect(searchPositions).toHaveBeenCalledWith({
      pageNum: 1,
      pageSize: 50,
      conditions: {
        fuzzyConditions: { text: '财务' },
        exactConditions: { statuses: [PositionStatus.Enable] },
      },
    });
  });

  it('requires a keyword for employment search and submits employment id values', async () => {
    await expect(requestEmploymentOptions({})).resolves.toEqual([]);
    expect(searchEmployments).not.toHaveBeenCalled();

    searchEmployments.mockResolvedValue({
      result: [
        {
          id: 42,
          user: { username: 'zhangsan', name: '张三' },
          organization: {
            assignedOrg: { orgName: '财务部' },
            fullOrgPath: [{ orgName: '集团' }, { orgName: '财务部' }],
          },
          position: { posCode: 'FIN-001', posName: '财务经理' },
        },
      ],
      total: 1,
    });

    await expect(requestEmploymentOptions({ keyWords: '42' })).resolves.toEqual(
      [
        {
          label: '张三（zhangsan） / 集团 / 财务部 / 财务经理（FIN-001） / #42',
          value: 42,
        },
      ],
    );
    expect(searchEmployments).toHaveBeenCalledWith({
      pageNum: 1,
      pageSize: 20,
      conditions: {
        fuzzyConditions: { text: '42' },
        exactConditions: { statuses: [EmploymentStatus.Enable] },
      },
    });
  });

  it('removes hidden organization fields from position and employment payloads', () => {
    expect(
      normalizeAssignmentCreateInput({
        targetType: RoleAssignmentTargetType.Position,
        orgCode: 'ORG',
        posCode: 'FIN-001',
        includeDescendants: true,
      }),
    ).toEqual({
      targetType: RoleAssignmentTargetType.Position,
      posCode: 'FIN-001',
    });

    expect(
      normalizeAssignmentCreateInput({
        targetType: RoleAssignmentTargetType.Employment,
        orgCode: 'ORG',
        employmentId: 42,
        includeDescendants: true,
      }),
    ).toEqual({
      targetType: RoleAssignmentTargetType.Employment,
      employmentId: 42,
    });
  });
});
