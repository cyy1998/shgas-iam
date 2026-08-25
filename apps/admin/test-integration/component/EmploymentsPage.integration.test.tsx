import EmploymentsPage from '@admin/pages/employments';
import { EmploymentStatus } from '@iam/contracts';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '~admin/test/render';

const state = vi.hoisted(() => ({
  drawerProps: null as null | { employmentId: number | null; open: boolean },
  locationSearch: '',
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

vi.mock('@umijs/max', () => ({
  useAccess: () => ({
    canAccessEmployment: true,
    canCreateEmployment: true,
  }),
  useLocation: () => ({ search: state.locationSearch }),
}));
vi.mock('@admin/components/OrganizationTreeSelector', () => ({
  default: () => null,
}));
vi.mock('@admin/components/StatusTag', () => ({
  default: ({ status }: { status: number }) => <span>{status}</span>,
}));
vi.mock('@admin/pages/employments/components/EmploymentDetailDrawer', () => ({
  default: (props: { employmentId: number | null; open: boolean }) => {
    state.drawerProps = props;
    return props.open ? <div>employment-{props.employmentId}</div> : null;
  },
}));
vi.mock('@admin/pages/employments/components/EmploymentFormModal', () => ({
  default: () => null,
}));
vi.mock('@admin/services/employment', () => ({ searchEmployments: vi.fn() }));

vi.mock('@ant-design/pro-components', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@ant-design/pro-components')>();
  const PageContainer = ({ children }: { children: ReactNode }) => (
    <>{children}</>
  );
  const ProTable = ({ columns }: { columns: any[] }) => {
    const actionColumn = columns.find((column) => column.title === '操作');
    return (
      <>
        <div data-testid="enabled-actions">
          {actionColumn.render(undefined, enabledEmployment)}
        </div>
        <div data-testid="ended-actions">
          {actionColumn.render(undefined, {
            ...enabledEmployment,
            id: 6,
            status: EmploymentStatus.Disable,
          })}
        </div>
      </>
    );
  };
  return {
    ...actual,
    default: { ...actual, PageContainer, ProTable },
    PageContainer,
    ProTable,
  };
});

describe('EmploymentsPage scoped administration', () => {
  it('keeps row operations read-only and opens management in the detail drawer', async () => {
    state.locationSearch = '';
    const { user } = render(<EmploymentsPage />);
    const enabled = within(screen.getByTestId('enabled-actions'));
    const ended = within(screen.getByTestId('ended-actions'));

    expect(enabled.getByText('查看')).toBeInTheDocument();
    expect(ended.getByText('查看')).toBeInTheDocument();
    expect(screen.queryByText('转岗')).not.toBeInTheDocument();
    expect(screen.queryByText('暂停')).not.toBeInTheDocument();

    await user.click(enabled.getByText('查看'));
    expect(await screen.findByText('employment-4')).toBeVisible();
  });

  it('opens an in-scope Employment detail from a User-detail deep link', async () => {
    state.locationSearch = '?employmentId=42';
    render(<EmploymentsPage />);

    expect(await screen.findByText('employment-42')).toBeVisible();
    expect(state.drawerProps).toMatchObject({ employmentId: 42, open: true });
  });
});
