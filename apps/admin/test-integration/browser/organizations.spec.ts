// Browser Integration uses a mocked backend; this is not a full-system journey.
import {
  ApiErrorCode,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationResponsibilityAssignmentStatus,
  OrganizationResponsibilityTypeCode,
  OrganizationStatus,
  OrganizationType,
} from '@iam/contracts';
import { expect, test } from '@playwright/test';
import { adminEmploymentAllowedActions } from '../../test/mocks/fixtures';
import {
  fulfillJson,
  fulfillTrpc,
  mockAdminApi,
  parseTrpcBatchInput,
} from './fixtures';

const detail = {
  id: 4,
  orgCode: 'FIN',
  orgName: '财务部',
  parentId: -1,
  businessParentId: -1,
  orgType: OrganizationType.Department,
  level: OrganizationLevel.One,
  path: '/4',
  orderNum: 0,
  isVirtual: false,
  isEntity: true,
  isDelete: false,
  isLeaf: true,
  parentCode: null,
  parentName: null,
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
};

const assignmentBase = {
  status: OrganizationResponsibilityAssignmentStatus.Enable,
  startTime: '2026-08-20T00:00:00.000Z',
  endTime: null,
  allowedActions: {
    pause: { allowed: true, reason: null },
    resume: { allowed: false, reason: 'RESOURCE_STATE_NOT_ACTIONABLE' },
    end: { allowed: true, reason: null },
  },
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
      id: 8,
      orgCode: 'OPS',
      orgName: '运营部',
      fullPath: [
        { id: 1, orgCode: 'ROOT', orgName: '集团' },
        { id: 8, orgCode: 'OPS', orgName: '运营部' },
      ],
    },
    position: { id: 9, posCode: 'OPS-LEAD', posName: '运营负责人' },
  },
};

test('manages both Organization Responsibility types inside Organization detail', async ({
  page,
}) => {
  await mockAdminApi(page);
  await page.route('**/rpc/admin.audit.search**', (route) =>
    fulfillTrpc(route, { result: [], total: 0 }),
  );
  const createInputs: unknown[] = [];
  const pauseInputs: unknown[] = [];
  const assignments = [
    {
      ...assignmentBase,
      id: 101,
      typeCode: OrganizationResponsibilityTypeCode.Head,
    },
    {
      ...assignmentBase,
      id: 100,
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
    },
  ];

  await page.route('**/rpc/admin.organization.*', (route) => {
    const url = new URL(route.request().url());
    const procedures = url.pathname.split('/').at(-1)!.split(',');
    const inputs: Record<string, { parentOrgCode?: string | null }> =
      JSON.parse(url.searchParams.get('input') ?? '{}');
    return fulfillJson(
      route,
      procedures.map((procedure, index) => {
        if (procedure === 'admin.organization.detail')
          return { result: { data: detail } };
        if (procedure === 'admin.organization.selector')
          return {
            result: {
              data: [
                {
                  ...detail,
                  fullPath: [{ ...detail, pathIndex: 0 }],
                  pathText: detail.orgName,
                  selectable: true,
                },
              ],
            },
          };
        expect(procedure).toBe('admin.organization.children');
        const isChild = inputs[String(index)]?.parentOrgCode;
        return {
          result: {
            data: {
              result: isChild ? [] : [detail],
              pageNum: 1,
              pageSize: 50,
              total: isChild ? 0 : 1,
            },
          },
        };
      }),
    );
  });
  await page.route(
    '**/rpc/admin.organizationResponsibility.searchAssignments**',
    (route) =>
      fulfillTrpc(route, {
        items: assignments,
        total: assignments.length,
        nextCursor: null,
      }),
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.detailAssignment**',
    (route) => {
      const input = parseTrpcBatchInput<{ id: number }>(route);
      return fulfillTrpc(
        route,
        assignments.find((item) => item.id === input.id),
      );
    },
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.pauseAssignment**',
    (route) => {
      pauseInputs.push(parseTrpcBatchInput(route));
      return fulfillTrpc(route, { changed: true, result: null });
    },
  );
  await page.route('**/rpc/admin.employment.search**', (route) =>
    fulfillTrpc(route, {
      result: [
        {
          id: 42,
          status: EmploymentStatus.Enable,
          user: assignmentBase.holder.user,
          organization: {
            assignedOrg: assignmentBase.holder.organization,
            fullOrgPath: assignmentBase.holder.organization.fullPath,
          },
          position: assignmentBase.holder.position,
        },
      ],
      total: 1,
    }),
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.createAssignment**',
    (route) => {
      createInputs.push(parseTrpcBatchInput(route));
      return fulfillTrpc(route, { changed: true, result: { id: 102 } });
    },
  );
  await page.route('**/rpc/admin.organization.updateStatus**', (route) =>
    fulfillJson(route, [
      {
        error: {
          message: '该组织层级内存在开放责任任命，无法暂停、停用或删除',
          code: -32603,
          data: {
            code: 'CONFLICT',
            httpStatus: 409,
            path: 'admin.organization.updateStatus',
            serviceCode:
              ApiErrorCode.OrganizationHasOpenResponsibilityAssignment,
            serviceMessage:
              '该组织层级内存在开放责任任命，无法暂停、停用或删除',
          },
        },
      },
    ]),
  );

  await page.goto('/iam-admin/organizations');
  await expect(page.getByRole('button', { name: /新建根组织/ })).toBeVisible();
  await page.getByText('财务部').first().click();
  await expect(page.getByRole('button', { name: /状\s*态/u })).toBeEnabled();
  await page.getByRole('button', { name: /状\s*态/u }).click();
  await page.getByText(/切为.*暂停/u).click();
  const statusConfirmation = page.getByRole('dialog');
  await expect(statusConfirmation).toContainText(
    '服务端将检查该组织及全部下级组织；任一组织仍是开放责任任命目标时，本次变更会被阻止。',
  );
  await statusConfirmation.getByRole('button', { name: '确认变更' }).click();
  await expect(
    page.getByText('该组织层级内存在开放责任任命，无法暂停、停用或删除').last(),
  ).toBeVisible();
  await expect(page.getByText('状态已更新')).toHaveCount(0);
  await expect(page.getByText('财务部').first()).toBeVisible();
  await page.getByRole('tab', { name: '责任任命' }).click();

  await expect(page.getByRole('button', { name: '详情' })).toHaveCount(2);
  await expect(page.getByText('负责人（head）')).toBeVisible();
  await expect(page.getByText('分管领导（supervising）')).toBeVisible();
  await expect(page.getByText('集团 / 运营部').first()).toBeVisible();
  await expect(page.getByText('集团 / 财务部').first()).toBeVisible();

  await page.getByRole('button', { name: '详情' }).first().click();
  await expect(page.getByRole('dialog').getByText('任命 #101')).toBeVisible();
  await expect(
    page.getByRole('dialog').getByText('集团 / 财务部'),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '暂停任命' })
    .click();
  await expect.poll(() => pauseInputs).toEqual([{ id: 101 }]);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: '新建责任任命' }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('目标组织：FIN')).toBeVisible();
  await expect(modal.getByLabel('状态')).toHaveCount(0);
  await expect(modal.getByLabel('生效时间')).toHaveCount(0);
  await modal.getByLabel('责任类型').click();
  await page.getByTitle('分管领导').click();
  await modal.getByRole('combobox', { name: '任职' }).fill('张三');
  await page
    .getByTitle(/张三.*集团 \/ 运营部.*运营负责人（OPS-LEAD）/u)
    .click();
  await modal.getByRole('button', { name: /确 定|提交/u }).click();

  await expect
    .poll(() => createInputs.at(-1))
    .toEqual({
      orgCode: 'FIN',
      typeCode: OrganizationResponsibilityTypeCode.Supervising,
      employmentId: 42,
    });
});

test('shows the Employment Pause cascade before executing the parent lifecycle command', async ({
  page,
}) => {
  await mockAdminApi(page);
  const pauseInputs: unknown[] = [];
  const employment = {
    id: 42,
    status: EmploymentStatus.Enable,
    isPrimary: true,
    startTime: '2026-08-20T00:00:00.000Z',
    endTime: null,
    description: null,
    user: { id: 7, name: '张三', username: 'zhangsan' },
    organization: {
      assignedOrg: {
        id: 8,
        orgCode: 'OPS',
        orgName: '运营部',
        orgType: OrganizationType.Department,
      },
      fullOrgPath: [
        { id: 1, orgCode: 'ROOT', orgName: '集团' },
        { id: 8, orgCode: 'OPS', orgName: '运营部' },
      ],
      companyNodes: [{ id: 1, orgCode: 'ROOT', orgName: '集团' }],
    },
    position: { id: 9, posCode: 'OPS-LEAD', posName: '运营负责人' },
  };
  await page.route('**/rpc/admin.employment.search**', (route) =>
    fulfillTrpc(route, {
      result: [employment],
      total: 1,
    }),
  );
  await page.route('**/rpc/admin.employment.detail**', (route) =>
    fulfillTrpc(route, {
      ...employment,
      allowedActions: adminEmploymentAllowedActions,
      createTime: '2026-08-20T00:00:00.000Z',
      updateTime: '2026-08-20T00:00:00.000Z',
      roles: [],
      privileges: [],
    }),
  );
  await page.route('**/rpc/admin.organization.selector**', (route) =>
    fulfillTrpc(route, []),
  );
  await page.route('**/rpc/admin.employment.pause**', (route) => {
    pauseInputs.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, { changed: true, result: null });
  });

  await page.goto('/iam-admin/employments');
  const row = page.getByRole('row', { name: /张三.*运营部.*运营负责人/u });
  await row.getByText('查看').click();
  const drawer = page.getByRole('dialog').filter({ hasText: '张三' });
  await drawer.getByRole('button', { name: /暂\s*停/u }).click();
  const confirmation = page
    .getByRole('dialog')
    .filter({ hasText: '确认暂停该任职' });
  await expect(confirmation).toContainText(
    '该任职下所有启用中的责任任命也会一并暂停；恢复任职后，责任任命仍需逐条恢复。',
  );
  await confirmation.getByRole('button', { name: '暂停任职' }).click();

  await expect.poll(() => pauseInputs).toEqual([{ id: 42 }]);
});
