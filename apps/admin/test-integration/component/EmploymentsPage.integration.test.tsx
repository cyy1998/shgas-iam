import EmploymentsPage from '@admin/pages/employments';
import { EmploymentStatus } from '@iam/contracts';
import { type ReactNode, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '~admin/test/render';

const lifecycle = vi.hoisted(() => ({
  clearPrimaryEmployment: vi.fn(),
  endEmployment: vi.fn(),
  pauseEmployment: vi.fn(),
  primaries: { 4: true, 5: false, 6: false } as Record<number, boolean>,
  reload: vi.fn(),
  resumeEmployment: vi.fn(),
  setPrimaryEmployment: vi.fn(),
  statuses: { 4: 1, 5: 2, 6: 3 } as Record<number, EmploymentStatus>,
}));

const enabledEmployment = {
  id: 4,
  status: EmploymentStatus.Enable,
  isPrimary: true,
  user: { name: '张三', username: 'zhangsan' },
  position: { posName: 'Developer', posCode: 'DEV' },
  organization: {
    assignedOrg: { orgCode: 'ORG', orgName: 'Organization' },
    fullOrgPath: [],
    companyNodes: [{ orgCode: 'COMPANY', orgName: 'Company' }],
  },
};

const pausedEmployment = {
  ...enabledEmployment,
  id: 5,
  status: EmploymentStatus.Pause,
};

const endedEmployment = {
  ...enabledEmployment,
  id: 6,
  status: EmploymentStatus.Disable,
};

vi.mock('@umijs/max', () => ({
  useLocation: () => ({ search: '' }),
}));

vi.mock('@admin/components/OrganizationTreeSelector', () => ({
  default: () => null,
}));

vi.mock('@admin/components/StatusTag', () => ({
  default: ({ status }: { status: number }) => <span>{status}</span>,
}));

vi.mock('@admin/pages/employments/components/EmploymentDetailDrawer', () => ({
  default: () => null,
}));
vi.mock('@admin/pages/employments/components/EmploymentFormModal', () => ({
  default: () => null,
}));
vi.mock('@admin/pages/employments/components/ResignByUserModal', () => ({
  default: () => null,
}));
vi.mock('@admin/pages/employments/components/TransferModal', () => ({
  default: () => null,
}));

vi.mock('@admin/services/employment', () => ({
  clearPrimaryEmployment: lifecycle.clearPrimaryEmployment,
  endEmployment: lifecycle.endEmployment,
  pauseEmployment: lifecycle.pauseEmployment,
  resumeEmployment: lifecycle.resumeEmployment,
  searchEmployments: vi.fn(),
  setPrimaryEmployment: lifecycle.setPrimaryEmployment,
}));

vi.mock('@ant-design/pro-components', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ant-design/pro-components')>();
  const PageContainer = ({ children }: { children: ReactNode }) => (
    <>{children}</>
  );
  const ProTable = ({
    actionRef,
    columns,
  }: {
    actionRef: { current?: unknown };
    columns: any[];
  }) => {
    const [revision, setRevision] = useState(0);
    actionRef.current = {
      reload: () => {
        lifecycle.reload();
        setRevision((current) => current + 1);
      },
    };
    const actionColumn = columns.find((column) => column.title === '操作');
    return (
      <div data-revision={revision}>
        <div data-testid="enabled-actions">
          {actionColumn.render(undefined, {
            ...enabledEmployment,
            isPrimary: lifecycle.primaries[4],
            status: lifecycle.statuses[4],
          })}
        </div>
        <div data-testid="paused-actions">
          {actionColumn.render(undefined, {
            ...pausedEmployment,
            isPrimary: lifecycle.primaries[5],
            status: lifecycle.statuses[5],
          })}
        </div>
        <div data-testid="ended-actions">
          {actionColumn.render(undefined, {
            ...endedEmployment,
            isPrimary: lifecycle.primaries[6],
            status: lifecycle.statuses[6],
          })}
        </div>
      </div>
    );
  };
  return {
    ...actual,
    default: { ...actual, PageContainer, ProTable },
    PageContainer,
    ProTable,
  };
});

describe('EmploymentsPage lifecycle actions', () => {
  it('shows and executes the legal Pause, Resume, and End commands for each lifecycle state', async () => {
    lifecycle.statuses[4] = EmploymentStatus.Enable;
    lifecycle.statuses[5] = EmploymentStatus.Pause;
    lifecycle.statuses[6] = EmploymentStatus.Disable;
    lifecycle.pauseEmployment.mockImplementation(async (id: number) => {
      lifecycle.statuses[id] = EmploymentStatus.Pause;
      return true;
    });
    lifecycle.resumeEmployment.mockImplementation(async (id: number) => {
      lifecycle.statuses[id] = EmploymentStatus.Enable;
      return true;
    });
    lifecycle.endEmployment.mockImplementation(async (id: number) => {
      lifecycle.statuses[id] = EmploymentStatus.Disable;
      return true;
    });
    const { user } = render(<EmploymentsPage />);
    const enabledActions = within(screen.getByTestId('enabled-actions'));
    const pausedActions = within(screen.getByTestId('paused-actions'));
    const endedActions = within(screen.getByTestId('ended-actions'));

    expect(enabledActions.getByText('暂停')).toBeInTheDocument();
    expect(enabledActions.getByText('结束')).toBeInTheDocument();
    expect(enabledActions.queryByText('恢复')).not.toBeInTheDocument();
    expect(pausedActions.getByText('恢复')).toBeInTheDocument();
    expect(pausedActions.getByText('结束')).toBeInTheDocument();
    expect(pausedActions.getByText('转岗')).toBeInTheDocument();
    expect(pausedActions.queryByText('暂停')).not.toBeInTheDocument();
    expect(endedActions.getByText('查看')).toBeInTheDocument();
    expect(endedActions.queryByText('结束')).not.toBeInTheDocument();
    expect(endedActions.queryByText('转岗')).not.toBeInTheDocument();
    expect(screen.queryByText('状态')).not.toBeInTheDocument();
    expect(screen.queryByText('删除')).not.toBeInTheDocument();

    await user.click(enabledActions.getByText('暂停'));
    expect(
      await screen.findByText(
        '该任职下所有启用中的责任任命也会一并暂停；恢复任职后，责任任命仍需逐条恢复。',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '暂停任职' }));
    await waitFor(() => {
      expect(
        within(screen.getByTestId('enabled-actions')).getByText('恢复'),
      ).toBeInTheDocument();
    });
    await user.click(
      within(screen.getByTestId('paused-actions')).getByText('恢复'),
    );

    await waitFor(() => {
      expect(lifecycle.pauseEmployment).toHaveBeenCalledWith(4);
      expect(lifecycle.resumeEmployment).toHaveBeenCalledWith(5, 'COMPANY');
      expect(lifecycle.reload).toHaveBeenCalledTimes(2);
      expect(
        within(screen.getByTestId('paused-actions')).getByText('暂停'),
      ).toBeInTheDocument();
    });

    await user.click(
      within(screen.getByTestId('enabled-actions')).getByText('结束'),
    );
    expect(
      await screen.findByText(
        '结束后不可恢复；该任职下所有开放责任任命会一并结束，后续新任职不会继承这些责任。',
      ),
    ).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '结束任职' }));

    await waitFor(() => {
      expect(lifecycle.endEmployment).toHaveBeenCalledWith(4);
      expect(
        within(screen.getByTestId('enabled-actions')).getByText('查看'),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('enabled-actions')).queryByText('结束'),
      ).not.toBeInTheDocument();
      expect(lifecycle.reload).toHaveBeenCalledTimes(3);
    });
  });

  it('lets administrators explicitly set or clear Primary for Open Employments', async () => {
    lifecycle.statuses[4] = EmploymentStatus.Enable;
    lifecycle.statuses[5] = EmploymentStatus.Pause;
    lifecycle.statuses[6] = EmploymentStatus.Disable;
    lifecycle.primaries[4] = true;
    lifecycle.primaries[5] = false;
    lifecycle.primaries[6] = false;
    lifecycle.clearPrimaryEmployment.mockImplementation(async (id: number) => {
      lifecycle.primaries[id] = false;
      return true;
    });
    lifecycle.setPrimaryEmployment.mockImplementation(async (id: number) => {
      Object.keys(lifecycle.primaries).forEach((key) => {
        lifecycle.primaries[Number(key)] = false;
      });
      lifecycle.primaries[id] = true;
      return true;
    });
    const { user } = render(<EmploymentsPage />);

    await user.click(
      within(screen.getByTestId('enabled-actions')).getByText('取消主岗'),
    );
    await user.click(await screen.findByRole('button', { name: '取消主岗' }));

    await waitFor(() => {
      expect(lifecycle.clearPrimaryEmployment).toHaveBeenCalledWith(4);
      expect(
        within(screen.getByTestId('enabled-actions')).getByText('设主岗'),
      ).toBeInTheDocument();
    });

    await user.click(
      within(screen.getByTestId('paused-actions')).getByText('设主岗'),
    );
    await user.click(await screen.findByRole('button', { name: '设为主岗' }));

    await waitFor(() => {
      expect(lifecycle.setPrimaryEmployment).toHaveBeenCalledWith(5);
      expect(
        within(screen.getByTestId('paused-actions')).getByText('取消主岗'),
      ).toBeInTheDocument();
      expect(
        within(screen.getByTestId('ended-actions')).queryByText('设主岗'),
      ).not.toBeInTheDocument();
      expect(lifecycle.reload).toHaveBeenCalledTimes(2);
    });
  });
});
