import OrganizationResponsibilityAssignmentModule from '@admin/components/organization-responsibility/OrganizationResponsibilityAssignmentModule';
import OrganizationResponsibilityAssignmentsPage from '@admin/pages/organization-responsibilities/OrganizationResponsibilityAssignmentsPage';
import {
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
} from '@iam/contracts';
import { message, Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __setAccess } from '~admin/test/mocks/umijs-max';
import { render, screen, waitFor, within } from '~admin/test/render';

const responsibilityService = vi.hoisted(() => ({
  createAssignment: vi.fn(),
  detailAssignment: vi.fn(),
  endAssignment: vi.fn(),
  pauseAssignment: vi.fn(),
  resumeAssignment: vi.fn(),
  searchAssignments: vi.fn(),
}));
const employmentService = vi.hoisted(() => ({
  searchEmployments: vi.fn(),
}));

vi.mock('@admin/services/organization-responsibility', () => ({
  ORGANIZATION_RESPONSIBILITY_ASSIGNMENT_LIFECYCLES: ['open', 'ended', 'all'],
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
    responsibilityService.searchAssignments,
}));
vi.mock('@admin/services/employment', () => ({
  searchEmployments: employmentService.searchEmployments,
}));
vi.mock('@admin/components/OrganizationTreeSelector', () => ({
  default: ({
    value,
    onChange,
    visibleStatuses,
    selectableStatuses,
  }: {
    value?: string;
    onChange?: (value?: string) => void;
    visibleStatuses?: OrganizationStatus[];
    selectableStatuses?: OrganizationStatus[];
  }) => (
    <div>
      <input
        aria-label="目标组织"
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value || undefined)}
      />
      <output data-testid="target-organization-statuses">
        {JSON.stringify({ visibleStatuses, selectableStatuses })}
      </output>
    </div>
  ),
}));
vi.mock('@admin/components/audit/AuditLogTable', () => ({
  default: ({ fixedConditions }: { fixedConditions: unknown }) => (
    <div data-testid="assignment-audit">{JSON.stringify(fixedConditions)}</div>
  ),
}));

const enabledAllowedActions = {
  pause: { allowed: true, reason: null },
  resume: { allowed: false, reason: 'RESOURCE_STATE_NOT_ACTIONABLE' },
  end: { allowed: true, reason: null },
} as const;
const pausedAllowedActions = {
  pause: { allowed: false, reason: 'RESOURCE_STATE_NOT_ACTIONABLE' },
  resume: { allowed: true, reason: null },
  end: { allowed: true, reason: null },
} as const;
const endedAllowedActions = {
  pause: { allowed: false, reason: 'RESOURCE_STATE_NOT_ACTIONABLE' },
  resume: { allowed: false, reason: 'RESOURCE_STATE_NOT_ACTIONABLE' },
  end: { allowed: false, reason: 'RESOURCE_STATE_NOT_ACTIONABLE' },
} as const;

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
        { id: 3, orgCode: 'OPS', orgName: '运营部' },
      ],
    },
    position: { id: 8, posCode: 'OPS-LEAD', posName: '运营负责人' },
  },
  status: OrganizationResponsibilityAssignmentStatus.Enable,
  startTime: '2026-08-20T00:00:00.000Z',
  endTime: null,
  allowedActions: enabledAllowedActions,
};

describe('OrganizationResponsibilityAssignmentModule', () => {
  beforeEach(() => {
    Object.values(responsibilityService).forEach((mock) => mock.mockReset());
    window.history.replaceState(
      {},
      '',
      '/iam-admin/organization-responsibilities/assignments',
    );
    responsibilityService.searchAssignments.mockResolvedValue({
      items: [assignment],
      nextCursor: null,
    });
    responsibilityService.detailAssignment.mockResolvedValue(assignment);
    responsibilityService.createAssignment.mockResolvedValue({
      changed: true,
      result: { id: 102 },
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
    employmentService.searchEmployments.mockResolvedValue({
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
  });

  afterEach(() => {
    Modal.destroyAll();
    message.destroy();
  });

  it('hydrates global filters and stable detail through the shared Module interface', async () => {
    render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: {
            targetOrganizationCode: 'FIN',
            employmentId: 42,
            typeCode: OrganizationResponsibilityTypeCode.Head,
            lifecycle: 'all',
            assignmentId: 101,
          },
          onStateChange: vi.fn(),
        }}
      />,
    );

    const detailButton = await screen.findByRole('button', { name: '详情' });
    expect(detailButton).toBeVisible();
    expect(screen.getByText('已按指定任职筛选')).toBeVisible();
    const row = detailButton.closest('tr');
    if (!(row instanceof HTMLElement))
      throw new Error('Assignment table row is missing');
    expect(within(row).queryByText('#101')).not.toBeInTheDocument();
    expect(within(row).queryByText('#42')).not.toBeInTheDocument();
    expect(within(row).getByText('启用')).toHaveClass('ant-tag');
    expect(within(row).queryByRole('button', { name: '编辑' })).toBeNull();
    expect(
      screen.queryByRole('columnheader', { name: '任命 ID' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('columnheader', { name: '任职 ID' }),
    ).not.toBeInTheDocument();
    expect(responsibilityService.searchAssignments).toHaveBeenCalledWith({
      targetOrganizationCode: 'FIN',
      employmentId: 42,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      lifecycle: 'all',
      limit: 20,
    });
    expect(responsibilityService.detailAssignment).toHaveBeenCalledWith({
      id: 101,
    });
    expect(
      screen.getByTestId('target-organization-statuses'),
    ).toHaveTextContent(
      JSON.stringify({
        visibleStatuses: [
          OrganizationStatus.Enable,
          OrganizationStatus.Pause,
          OrganizationStatus.Disable,
        ],
        selectableStatuses: [
          OrganizationStatus.Enable,
          OrganizationStatus.Pause,
          OrganizationStatus.Disable,
        ],
      }),
    );

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('任命 #101')).toBeInTheDocument();
    expect(within(dialog).getByText('#42')).toBeInTheDocument();
    expect(within(dialog).queryByText('任命 ID：#101')).toBeNull();
    await within(dialog).findByRole('tab', { name: '操作日志' });
    await screen.findByText(
      '{"targetType":"organization_responsibility_assignment","targetId":101}',
    );
  });

  it('offers scoped HR Create and server-owned lifecycle actions while keeping Audit hidden', async () => {
    __setAccess({
      canAccessOrganizationResponsibility: true,
      canCreateOrganizationResponsibility: true,
      canAccessAudit: false,
    });
    render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'open', assignmentId: 101 },
          onStateChange: vi.fn(),
        }}
      />,
    );

    const dialog = await screen.findByRole('dialog');
    expect(screen.getByRole('button', { name: /新建责任任命/ })).toBeVisible();
    expect(
      within(dialog).queryByRole('tab', { name: '操作日志' }),
    ).not.toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: '暂停任命' }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: '结束任命' }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: '恢复任命' }),
    ).toBeNull();
    expect(screen.queryByTestId('assignment-audit')).not.toBeInTheDocument();
  });

  it('rejects an Assignment ID outside the restored global scope', async () => {
    responsibilityService.detailAssignment.mockResolvedValue({
      ...assignment,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
    });

    render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: {
            targetOrganizationCode: 'FIN',
            employmentId: 42,
            typeCode: OrganizationResponsibilityTypeCode.Head,
            lifecycle: 'open',
            assignmentId: 101,
          },
          onStateChange: vi.fn(),
        }}
      />,
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('任命不属于当前链接筛选范围'),
    ).toBeVisible();
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByTestId('assignment-audit')).not.toBeInTheDocument();
  });

  it('creates a global assignment from the table toolbar without exposing Employment IDs', async () => {
    const { user } = render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'open', assignmentId: null },
          onStateChange: vi.fn(),
        }}
      />,
    );
    await screen.findByRole('button', { name: '详情' });

    await user.click(screen.getByRole('button', { name: /新建责任任命/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('目标组织'), 'FIN');
    await user.click(
      within(dialog).getByRole('combobox', { name: '责任类型' }),
    );
    await user.click(await screen.findByTitle('分管领导'));
    const employment = within(dialog).getByRole('combobox', { name: '任职' });
    expect(
      within(dialog).getByText('搜索用户、账号、组织或岗位'),
    ).toBeInTheDocument();
    await user.type(employment, '张三');
    await user.click(
      await screen.findByTitle(
        '张三（zhangsan） / 集团 / 运营部 / 运营负责人（OPS-LEAD）',
      ),
    );
    expect(within(dialog).queryByText(/任职 ID/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText('#42')).not.toBeInTheDocument();
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
  });

  it('publishes edited global scope without silently retaining detail or cursor state', async () => {
    const onStateChange = vi.fn();
    const { user } = render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'open', assignmentId: null },
          onStateChange,
        }}
      />,
    );
    await screen.findByRole('button', { name: '详情' });

    await user.type(screen.getByLabelText('目标组织'), 'FIN');
    expect(
      screen.queryByRole('spinbutton', { name: '任职 ID' }),
    ).not.toBeInTheDocument();
    const employment = screen.getByRole('combobox', { name: '任职' });
    await user.type(employment, '张三');
    await user.click(
      await screen.findByTitle(
        '张三（zhangsan） / 集团 / 运营部 / 运营负责人（OPS-LEAD）',
      ),
    );
    const queryButton = screen.getByRole('button', { name: /查\s*询/ });
    await waitFor(() => expect(queryButton).toBeEnabled());
    await user.click(queryButton);

    expect(onStateChange).toHaveBeenCalledWith({
      targetOrganizationCode: 'FIN',
      employmentId: 42,
      lifecycle: 'open',
      assignmentId: null,
    });
  });

  it('shows an explicit URL error instead of querying a different scope', async () => {
    window.history.replaceState(
      {},
      '',
      '/iam-admin/organization-responsibilities/assignments?employment=oops&assignment=0',
    );

    render(<OrganizationResponsibilityAssignmentsPage />);

    expect(await screen.findByText('责任任命链接参数无效')).toBeInTheDocument();
    await waitFor(() => {
      expect(responsibilityService.searchAssignments).not.toHaveBeenCalled();
      expect(responsibilityService.detailAssignment).not.toHaveBeenCalled();
    });
  });

  it('offers the shared Pause action and refreshes list and detail exactly once', async () => {
    const { user } = render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'open', assignmentId: 101 },
          onStateChange: vi.fn(),
        }}
      />,
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('button', { name: '暂停任命' }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: '恢复任命' }),
    ).toBeNull();

    await user.click(within(dialog).getByRole('button', { name: '暂停任命' }));

    await waitFor(() => {
      expect(responsibilityService.pauseAssignment).toHaveBeenCalledTimes(1);
      expect(responsibilityService.pauseAssignment).toHaveBeenCalledWith({
        id: 101,
      });
      expect(responsibilityService.searchAssignments).toHaveBeenCalledTimes(2);
      expect(responsibilityService.detailAssignment).toHaveBeenCalledTimes(2);
    });
  });

  describe.each(['global', 'organization'] as const)(
    '%s lifecycle results',
    (kind) => {
      for (const changed of [true, false]) {
        it.each([
          [
            'pauseAssignment',
            '暂停任命',
            '责任任命已暂停',
            enabledAllowedActions,
          ],
          [
            'resumeAssignment',
            '恢复任命',
            '责任任命已恢复',
            pausedAllowedActions,
          ],
        ] as const)(
          `shows changed=${changed} for %s and refreshes HR actions`,
          async (method, label, successMessage, allowedActions) => {
            __setAccess({
              canAccessOrganizationResponsibility: true,
              canCreateOrganizationResponsibility: true,
              canAccessAudit: false,
            });
            responsibilityService.detailAssignment.mockResolvedValue({
              ...assignment,
              allowedActions,
            });
            responsibilityService[method].mockResolvedValueOnce({
              changed,
              result: null,
            });
            const { user } = render(
              <OrganizationResponsibilityAssignmentModule
                host={
                  kind === 'organization'
                    ? { kind, targetOrganizationCode: 'FIN' }
                    : {
                        kind,
                        state: { lifecycle: 'all', assignmentId: 101 },
                        onStateChange: vi.fn(),
                      }
                }
              />,
            );
            if (kind === 'organization')
              await user.click(
                await screen.findByRole('button', { name: '详情' }),
              );
            await user.click(
              await screen.findByRole('button', { name: label }),
            );
            expect(
              (
                await screen.findAllByText(
                  changed ? successMessage : '无需修改',
                )
              ).at(-1),
            ).toBeInTheDocument();
            await waitFor(() => {
              expect(responsibilityService[method]).toHaveBeenCalledTimes(1);
              expect(
                responsibilityService.detailAssignment,
              ).toHaveBeenCalledTimes(2);
              expect(
                responsibilityService.searchAssignments,
              ).toHaveBeenCalledTimes(2);
            });
            expect(
              screen.queryByTestId('assignment-audit'),
            ).not.toBeInTheDocument();
          },
        );
      }
    },
  );
  it('renders only server-owned lifecycle decisions instead of inferring from status', async () => {
    responsibilityService.detailAssignment.mockResolvedValueOnce({
      ...assignment,
      allowedActions: {
        pause: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
        resume: { allowed: true, reason: null },
        end: { allowed: false, reason: 'ACTION_NOT_GRANTED' },
      },
    });

    render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'open', assignmentId: 101 },
          onStateChange: vi.fn(),
        }}
      />,
    );

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByRole('button', { name: '恢复任命' }),
    ).toBeVisible();
    expect(
      within(dialog).queryByRole('button', { name: '暂停任命' }),
    ).toBeNull();
    expect(
      within(dialog).queryByRole('button', { name: '结束任命' }),
    ).toBeNull();
  });

  it('offers Resume for Pause and keeps Ended detail read-only', async () => {
    responsibilityService.searchAssignments.mockResolvedValueOnce({
      items: [
        {
          ...assignment,
          status: OrganizationResponsibilityAssignmentStatus.Pause,
          allowedActions: pausedAllowedActions,
        },
      ],
      nextCursor: null,
    });
    responsibilityService.detailAssignment.mockResolvedValueOnce({
      ...assignment,
      status: OrganizationResponsibilityAssignmentStatus.Pause,
      allowedActions: pausedAllowedActions,
    });
    const paused = render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'open', assignmentId: 101 },
          onStateChange: vi.fn(),
        }}
      />,
    );
    const pausedDialog = await screen.findByRole('dialog');
    expect(
      within(pausedDialog).getByRole('button', { name: '恢复任命' }),
    ).toBeVisible();
    expect(
      within(pausedDialog).queryByRole('button', { name: '暂停任命' }),
    ).toBeNull();
    paused.unmount();

    responsibilityService.searchAssignments.mockResolvedValueOnce({
      items: [
        {
          ...assignment,
          status: OrganizationResponsibilityAssignmentStatus.Disable,
          allowedActions: endedAllowedActions,
        },
      ],
      nextCursor: null,
    });
    responsibilityService.detailAssignment.mockResolvedValueOnce({
      ...assignment,
      status: OrganizationResponsibilityAssignmentStatus.Disable,
      endTime: '2026-08-20T08:00:00.000Z',
      allowedActions: endedAllowedActions,
    });
    render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'all', assignmentId: 101 },
          onStateChange: vi.fn(),
        }}
      />,
    );
    const endedDialog = await screen.findByRole('dialog');
    expect(
      within(endedDialog).queryByRole('button', { name: '暂停任命' }),
    ).toBeNull();
    expect(
      within(endedDialog).queryByRole('button', { name: '恢复任命' }),
    ).toBeNull();
    expect(
      within(endedDialog).queryByRole('button', { name: '结束任命' }),
    ).toBeNull();
  });

  it('requires irreversible End confirmation before issuing one mutation', async () => {
    const { user } = render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'open', assignmentId: 101 },
          onStateChange: vi.fn(),
        }}
      />,
    );
    const detailDialog = await screen.findByRole('dialog');

    await user.click(
      within(detailDialog).getByRole('button', { name: '结束任命' }),
    );
    expect(responsibilityService.endAssignment).not.toHaveBeenCalled();
    const confirmButton = await screen.findByRole('button', {
      name: '确认结束',
    });
    const confirmation = confirmButton.closest('[role="dialog"]');
    if (!(confirmation instanceof HTMLElement))
      throw new Error('End confirmation dialog is missing');
    expect(
      within(confirmation).getByText(/结束后不可恢复/),
    ).toBeInTheDocument();

    await user.click(confirmButton);
    await waitFor(() => {
      expect(responsibilityService.endAssignment).toHaveBeenCalledTimes(1);
    });
  });

  it('preserves Drawer context and refreshes authority without replay after failure', async () => {
    responsibilityService.pauseAssignment.mockRejectedValueOnce(
      new Error('网络连接失败，已刷新权威状态'),
    );
    const { user } = render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'open', assignmentId: 101 },
          onStateChange: vi.fn(),
        }}
      />,
    );
    const pauseButton = await screen.findByRole('button', { name: '暂停任命' });
    const dialog = pauseButton.closest('[role="dialog"]');
    if (!(dialog instanceof HTMLElement))
      throw new Error('Assignment detail Drawer is missing');

    await user.click(pauseButton);

    expect(
      await screen.findByText('网络连接失败，已刷新权威状态'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('张三（zhangsan）')).toBeVisible();
    await waitFor(() => {
      expect(responsibilityService.pauseAssignment).toHaveBeenCalledTimes(1);
      expect(responsibilityService.searchAssignments).toHaveBeenCalledTimes(2);
      expect(responsibilityService.detailAssignment).toHaveBeenCalledTimes(2);
    });
  });

  it('removes stale detail and actions when HR scope is lost before a lifecycle retry', async () => {
    __setAccess({
      canAccessOrganizationResponsibility: true,
      canCreateOrganizationResponsibility: true,
      canAccessAudit: false,
    });
    const { user } = render(
      <OrganizationResponsibilityAssignmentModule
        host={{
          kind: 'global',
          state: { lifecycle: 'all', assignmentId: 101 },
          onStateChange: vi.fn(),
        }}
      />,
    );
    const pause = await screen.findByRole('button', { name: '暂停任命' });
    const dialog = pause.closest('[role="dialog"]');
    if (!(dialog instanceof HTMLElement))
      throw new Error('Assignment detail Drawer is missing');
    responsibilityService.pauseAssignment.mockRejectedValueOnce(
      new Error('责任任命或关联对象不存在'),
    );
    responsibilityService.detailAssignment.mockRejectedValueOnce(
      new Error('责任任命不存在'),
    );
    responsibilityService.searchAssignments.mockResolvedValueOnce({
      items: [],
      nextCursor: null,
    });

    await user.click(pause);

    expect(await within(dialog).findByText('责任任命不存在')).toBeVisible();
    expect(
      within(dialog).queryByText('张三（zhangsan）'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '暂停任命' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId('assignment-audit')).not.toBeInTheDocument();
    expect(responsibilityService.pauseAssignment).toHaveBeenCalledTimes(1);
  });
});
