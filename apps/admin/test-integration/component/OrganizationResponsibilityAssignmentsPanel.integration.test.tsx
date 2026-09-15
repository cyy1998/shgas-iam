import OrganizationResponsibilityAssignmentsPanel from '@admin/pages/organizations/components/OrganizationResponsibilityAssignmentsPanel';
import OrgDetailPanel from '@admin/pages/organizations/components/OrgDetailPanel';
import {
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
} from '@iam/contracts';
import { ConfigProvider, message, Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '~admin/test/render';

const responsibilityService = vi.hoisted(() => ({
  createAssignment: vi.fn(),
  detailAssignment: vi.fn(),
  endAssignment: vi.fn(),
  listAssignments: vi.fn(),
  pauseAssignment: vi.fn(),
  resumeAssignment: vi.fn(),
}));
const searchEmployments = vi.hoisted(() => vi.fn());

vi.mock('@admin/services/organization-responsibility', () => ({
  createOrganizationResponsibilityAssignment:
    responsibilityService.createAssignment,
  getOrganizationResponsibilityAssignment:
    responsibilityService.detailAssignment,
  endOrganizationResponsibilityAssignment: responsibilityService.endAssignment,
  pauseOrganizationResponsibilityAssignment:
    responsibilityService.pauseAssignment,
  resumeOrganizationResponsibilityAssignment:
    responsibilityService.resumeAssignment,
  searchOrganizationResponsibilityAssignments:
    responsibilityService.listAssignments,
}));
vi.mock('@admin/services/employment', () => ({ searchEmployments }));
vi.mock('@admin/components/audit/AuditLogTable', () => ({
  default: () => null,
}));

const assignment = {
  id: 101,
  typeCode: OrganizationResponsibilityTypeCode.Head,
  targetOrganization: {
    id: 4,
    orgCode: 'FIN',
    orgName: '财务部',
    fullPath: [
      { id: 1, orgCode: 'ROOT', orgName: '集团' },
      { id: 4, orgCode: 'FIN', orgName: '财务部' },
    ],
  },
  holder: {
    employmentId: 42,
    user: { id: 7, name: '张三', username: 'zhangsan' },
    organization: {
      id: 3,
      orgCode: 'OPS',
      orgName: '运营部',
      fullPath: [
        { id: 1, orgCode: 'ROOT', orgName: '集团' },
        { id: 2, orgCode: 'OPS-CENTER', orgName: '运营中心' },
        { id: 3, orgCode: 'OPS', orgName: '运营部' },
      ],
    },
    position: { id: 8, posCode: 'OPS-LEAD', posName: '运营负责人' },
  },
  status: OrganizationResponsibilityAssignmentStatus.Enable,
  startTime: '2026-08-20T00:00:00.000Z',
  endTime: null,
  allowedActions: {
    pause: { allowed: true, reason: null },
    resume: { allowed: false, reason: 'RESOURCE_STATE_NOT_ACTIONABLE' },
    end: { allowed: true, reason: null },
  },
};

describe('OrganizationResponsibilityAssignmentsPanel', () => {
  beforeEach(() => {
    ConfigProvider.config({
      holderRender: (children) => (
        <ConfigProvider theme={{ token: { motion: false } }}>
          {children}
        </ConfigProvider>
      ),
    });
    vi.clearAllMocks();
    responsibilityService.listAssignments.mockResolvedValue({
      items: [assignment],
      total: 1,
      nextCursor: '100',
    });
    responsibilityService.endAssignment.mockResolvedValue({
      changed: true,
      result: null,
    });
    responsibilityService.pauseAssignment.mockResolvedValue({
      changed: true,
      result: null,
    });
    responsibilityService.resumeAssignment.mockResolvedValue({
      changed: true,
      result: null,
    });
  });

  afterEach(() => {
    Modal.destroyAll();
    message.destroy();
    ConfigProvider.config({ holderRender: undefined });
  });

  it('loads the default Open page and opens detail by stable numeric id', async () => {
    responsibilityService.detailAssignment.mockResolvedValue(assignment);

    const { user } = render(
      <OrganizationResponsibilityAssignmentsPanel orgCode="FIN" />,
    );

    expect(
      await screen.findByText('集团 / 运营中心 / 运营部'),
    ).toBeInTheDocument();
    expect(responsibilityService.listAssignments).toHaveBeenCalledWith({
      targetOrganizationCode: 'FIN',
      lifecycle: 'open',
      pageNum: 1,
      pageSize: 20,
    });
    expect(screen.getByText('张三（zhangsan）')).toBeInTheDocument();
    expect(screen.getByText('运营负责人（OPS-LEAD）')).toBeInTheDocument();
    expect(screen.getByText('集团 / 财务部')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '详情' }));

    expect(responsibilityService.detailAssignment).toHaveBeenCalledWith({
      orgCode: 'FIN',
      id: 101,
    });
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('任命 #101')).toBeInTheDocument();
    expect(within(dialog).getByText('财务部（FIN）')).toBeInTheDocument();
    expect(within(dialog).getByText('集团 / 财务部')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: '暂停任命' }));
    await waitFor(() => {
      expect(responsibilityService.pauseAssignment).toHaveBeenCalledOnce();
      expect(responsibilityService.pauseAssignment).toHaveBeenCalledWith({
        id: 101,
      });
      expect(responsibilityService.listAssignments).toHaveBeenCalledTimes(2);
      expect(responsibilityService.detailAssignment).toHaveBeenCalledTimes(2);
    });
  });

  it('creates an assignment with only the fixed organization, type and holder employment', async () => {
    responsibilityService.createAssignment.mockResolvedValue({
      changed: true,
      result: { id: 102 },
    });
    searchEmployments.mockResolvedValue({
      result: [
        {
          id: 42,
          user: { username: 'zhangsan', name: '张三' },
          organization: {
            assignedOrg: { orgName: '运营部' },
            fullOrgPath: [
              { orgName: '集团' },
              { orgName: '运营中心' },
              { orgName: '运营部' },
            ],
          },
          position: { posCode: 'OPS-LEAD', posName: '运营负责人' },
        },
      ],
      total: 1,
    });

    const { user } = render(
      <OrganizationResponsibilityAssignmentsPanel orgCode="FIN" />,
    );
    await screen.findByText('集团 / 运营中心 / 运营部');
    await user.click(screen.getByRole('button', { name: /新建责任任命/ }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('目标组织：FIN')).toBeInTheDocument();
    expect(within(dialog).queryByLabelText('目标组织')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('状态')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('生效时间')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('结束时间')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('来源')).not.toBeInTheDocument();

    await user.click(
      within(dialog).getByRole('combobox', { name: '责任类型' }),
    );
    await user.click(await screen.findByTitle('分管领导'));
    await user.type(
      within(dialog).getByRole('combobox', { name: '任职' }),
      '张三',
    );
    await user.click(
      await screen.findByTitle(
        '张三（zhangsan） / 集团 / 运营中心 / 运营部 / 运营负责人（OPS-LEAD）',
      ),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /确 定|提交/ }),
    );

    await waitFor(() => {
      expect(responsibilityService.createAssignment).toHaveBeenCalledWith({
        orgCode: 'FIN',
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        employmentId: 42,
      });
    });
    expect(responsibilityService.createAssignment.mock.calls[0][0]).toEqual({
      orgCode: 'FIN',
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      employmentId: 42,
    });
  });

  it('refreshes the current authority scope after an uncertain Create failure without replaying it', async () => {
    responsibilityService.createAssignment.mockRejectedValueOnce(
      new Error('网络异常，未自动重试；当前状态已刷新，请确认后再操作'),
    );
    searchEmployments.mockResolvedValue({
      result: [
        {
          id: 42,
          user: { username: 'zhangsan', name: '张三' },
          organization: {
            assignedOrg: { orgName: '运营部' },
            fullOrgPath: [{ orgName: '集团' }, { orgName: '运营部' }],
          },
          position: { posCode: 'OPS-LEAD', posName: '运营负责人' },
        },
      ],
      total: 1,
    });

    const { user } = render(
      <OrganizationResponsibilityAssignmentsPanel orgCode="FIN" />,
    );
    await screen.findByRole('button', { name: '详情' });
    await user.click(screen.getByRole('button', { name: /新建责任任命/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByRole('combobox', { name: '任职' }),
      '张三',
    );
    await user.click(
      await screen.findByTitle(
        '张三（zhangsan） / 集团 / 运营部 / 运营负责人（OPS-LEAD）',
      ),
    );
    await user.click(
      within(dialog).getByRole('button', { name: /确 定|提交/ }),
    );

    await waitFor(() => {
      expect(responsibilityService.createAssignment).toHaveBeenCalledTimes(1);
      expect(responsibilityService.listAssignments).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('replaces rows when switching pages and can return to the first page', async () => {
    responsibilityService.listAssignments
      .mockReset()
      .mockResolvedValueOnce({
        items: [assignment],
        total: 21,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [
          {
            ...assignment,
            id: 100,
            typeCode: OrganizationResponsibilityTypeCode.Supervising,
          },
        ],
        total: 21,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [assignment],
        total: 21,
        nextCursor: null,
      });

    const { user } = render(
      <OrganizationResponsibilityAssignmentsPanel orgCode="FIN" />,
    );
    await screen.findByRole('button', { name: '详情' });
    await user.click(screen.getByTitle('2'));

    expect(await screen.findAllByRole('button', { name: '详情' })).toHaveLength(
      1,
    );
    expect(responsibilityService.listAssignments).toHaveBeenNthCalledWith(2, {
      targetOrganizationCode: 'FIN',
      lifecycle: 'open',
      pageNum: 2,
      pageSize: 20,
    });
    await screen.findByText('分管领导（supervising）');
    await user.click(screen.getByTitle('1'));
    await waitFor(() =>
      expect(responsibilityService.listAssignments).toHaveBeenLastCalledWith({
        targetOrganizationCode: 'FIN',
        lifecycle: 'open',
        pageNum: 1,
        pageSize: 20,
      }),
    );
    expect(await screen.findAllByRole('button', { name: '详情' })).toHaveLength(
      1,
    );
  });

  it('returns to the last available page after ending its only assignment', async () => {
    responsibilityService.listAssignments
      .mockReset()
      .mockResolvedValueOnce({
        items: [assignment],
        total: 21,
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        items: [{ ...assignment, id: 100 }],
        total: 21,
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [], total: 20, nextCursor: null })
      .mockResolvedValueOnce({
        items: [assignment],
        total: 20,
        nextCursor: null,
      });
    responsibilityService.detailAssignment.mockResolvedValue({
      ...assignment,
      id: 100,
    });
    const { user } = render(
      <OrganizationResponsibilityAssignmentsPanel orgCode="FIN" />,
    );
    await screen.findByRole('button', { name: '详情' });
    await user.click(screen.getByTitle('2'));
    await waitFor(() =>
      expect(responsibilityService.listAssignments).toHaveBeenCalledTimes(2),
    );
    await user.click(screen.getByRole('button', { name: '详情' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: '结束任命' }));
    await user.click(await screen.findByRole('button', { name: '确认结束' }));
    await waitFor(() =>
      expect(responsibilityService.listAssignments).toHaveBeenCalledTimes(4),
    );
    expect(responsibilityService.listAssignments).toHaveBeenNthCalledWith(3, {
      targetOrganizationCode: 'FIN',
      lifecycle: 'open',
      pageNum: 2,
      pageSize: 20,
    });
    expect(responsibilityService.listAssignments).toHaveBeenLastCalledWith({
      targetOrganizationCode: 'FIN',
      lifecycle: 'open',
      pageNum: 1,
      pageSize: 20,
    });
  });

  it('resets the page when changing page size or resetting filters', async () => {
    responsibilityService.listAssignments.mockResolvedValue({
      items: [assignment],
      total: 51,
      nextCursor: null,
    });
    const { user } = render(
      <OrganizationResponsibilityAssignmentsPanel orgCode="FIN" />,
    );
    await screen.findByRole('button', { name: '详情' });
    await user.click(screen.getByTitle('2'));
    await waitFor(() =>
      expect(responsibilityService.listAssignments).toHaveBeenLastCalledWith({
        targetOrganizationCode: 'FIN',
        lifecycle: 'open',
        pageNum: 2,
        pageSize: 20,
      }),
    );
    await user.click(screen.getByRole('combobox', { name: '页码' }));
    await user.click(await screen.findByTitle('50 条/页'));
    await waitFor(() =>
      expect(responsibilityService.listAssignments).toHaveBeenLastCalledWith({
        targetOrganizationCode: 'FIN',
        lifecycle: 'open',
        pageNum: 1,
        pageSize: 50,
      }),
    );
    await user.click(screen.getByTitle('2'));
    await user.click(screen.getByRole('button', { name: '重 置' }));
    await waitFor(() =>
      expect(responsibilityService.listAssignments).toHaveBeenLastCalledWith({
        targetOrganizationCode: 'FIN',
        lifecycle: 'open',
        pageNum: 1,
        pageSize: 20,
      }),
    );
  });

  it('discards an in-flight detail when the host Organization changes', async () => {
    let resolveDetail!: (value: typeof assignment) => void;
    responsibilityService.listAssignments
      .mockReset()
      .mockResolvedValueOnce({
        items: [assignment],
        total: 1,
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [], total: 1, nextCursor: null });
    responsibilityService.detailAssignment.mockReturnValue(
      new Promise((resolve) => {
        resolveDetail = resolve;
      }),
    );

    const { rerender, user } = render(
      <OrganizationResponsibilityAssignmentsPanel orgCode="FIN" />,
    );
    await user.click(await screen.findByRole('button', { name: '详情' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    rerender(<OrganizationResponsibilityAssignmentsPanel orgCode="OPS" />);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    resolveDetail(assignment);
    await waitFor(() => {
      expect(screen.queryByText('任命 #101')).not.toBeInTheDocument();
    });
    expect(responsibilityService.listAssignments).toHaveBeenLastCalledWith({
      targetOrganizationCode: 'OPS',
      lifecycle: 'open',
      pageNum: 1,
      pageSize: 20,
    });
  });

  it('hosts responsibility assignments in the selected Organization detail', async () => {
    const { user } = render(
      <OrgDetailPanel
        loading={false}
        detail={{
          id: 2,
          orgCode: 'FIN',
          orgName: '财务部',
          parentId: 1,
          businessParentId: 1,
          orgType: OrganizationType.Department,
          level: OrganizationLevel.Two,
          path: '集团 / 财务部',
          orderNum: 0,
          isVirtual: false,
          isEntity: true,
          isDelete: false,
          isLeaf: true,
          parentCode: 'ROOT',
          parentName: '集团',
          status: OrganizationStatus.Enable,
          statusText: '正常',
          childrenCount: 0,
          employmentCount: 0,
          allowedActions: {
            createChild: { allowed: true, reason: null },
            edit: { allowed: true, reason: null },
            changeStatus: { allowed: true, reason: null },
            delete: { allowed: true, reason: null },
          },
          createTime: '2026-08-20T00:00:00.000Z',
          updateTime: '2026-08-20T00:00:00.000Z',
        }}
        childrenPage={null}
        childrenLoading={false}
        onChildrenPageChange={vi.fn()}
        onEdit={vi.fn()}
        onCreateChild={vi.fn()}
        onSelectChild={vi.fn()}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByRole('tab', { name: '组织详情' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('tab', { name: '责任任命' }));

    expect(
      await screen.findByRole('button', { name: /新建责任任命/ }),
    ).toBeInTheDocument();
    expect(responsibilityService.listAssignments).toHaveBeenCalledWith({
      targetOrganizationCode: 'FIN',
      lifecycle: 'open',
      pageNum: 1,
      pageSize: 20,
    });
  });
});
