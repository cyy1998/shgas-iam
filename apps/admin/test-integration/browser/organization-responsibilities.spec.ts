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
import { expect, test, type Page } from '@playwright/test';
import {
  fulfillJson,
  fulfillTrpc,
  mockAdminApi,
  parseTrpcBatchInput,
} from './fixtures';

function allowedActionsForStatus(
  status: OrganizationResponsibilityAssignmentStatus,
) {
  const allowed = { allowed: true, reason: null } as const;
  const unavailable = {
    allowed: false,
    reason: 'RESOURCE_STATE_NOT_ACTIONABLE',
  } as const;
  return {
    pause:
      status === OrganizationResponsibilityAssignmentStatus.Enable
        ? allowed
        : unavailable,
    resume:
      status === OrganizationResponsibilityAssignmentStatus.Pause
        ? allowed
        : unavailable,
    end:
      status === OrganizationResponsibilityAssignmentStatus.Disable
        ? unavailable
        : allowed,
  };
}

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
  allowedActions: allowedActionsForStatus(
    OrganizationResponsibilityAssignmentStatus.Enable,
  ),
};

const targetOrganization = {
  id: 4,
  orgCode: 'FIN',
  orgName: '财务部',
  orgType: OrganizationType.Department,
  status: OrganizationStatus.Enable,
  level: OrganizationLevel.Two,
  parentId: 1,
  isLeaf: true,
  fullPath: [
    { id: 1, orgCode: 'ROOT', orgName: '集团' },
    { id: 4, orgCode: 'FIN', orgName: '财务部' },
  ],
  pathText: '集团 / 财务部',
  selectable: true,
};

test('creates a responsibility assignment from the global toolbar without exposing internal ids', async ({
  page,
}) => {
  await mockAdminApi(page);
  const createInputs: unknown[] = [];

  await page.route(
    '**/rpc/admin.organization.selector,admin.organization.selector,admin.organizationResponsibility.searchAssignments**',
    (route) =>
      fulfillJson(route, [
        { result: { data: [targetOrganization] } },
        { result: { data: [targetOrganization] } },
        { result: { data: { items: [], total: 21, nextCursor: null } } },
      ]),
  );
  await page.route('**/rpc/admin.organization.selector**', (route) =>
    fulfillTrpc(route, [targetOrganization]),
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.searchAssignments**',
    (route) => fulfillTrpc(route, { items: [], total: 21, nextCursor: null }),
  );
  await page.route('**/rpc/admin.employment.search**', (route) =>
    fulfillTrpc(route, {
      result: [
        {
          id: 42,
          status: EmploymentStatus.Enable,
          isPrimary: true,
          startTime: '2026-08-20T00:00:00.000Z',
          endTime: null,
          description: null,
          user: { id: 7, name: '张三', username: 'zhangsan' },
          organization: {
            assignedOrg: {
              id: 3,
              orgCode: 'OPS',
              orgName: '运营部',
              orgType: OrganizationType.Department,
            },
            fullOrgPath: [
              { id: 1, orgCode: 'ROOT', orgName: '集团' },
              { id: 3, orgCode: 'OPS', orgName: '运营部' },
            ],
            companyNodes: [{ id: 1, orgCode: 'ROOT', orgName: '集团' }],
          },
          position: {
            id: 8,
            posCode: 'OPS-LEAD',
            posName: '运营负责人',
          },
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

  await page.goto('/iam-admin/organization-responsibilities/assignments');
  await page.getByRole('button', { name: /新建责任任命/ }).click();
  const dialog = page.getByRole('dialog');
  const formItem = (label: string) =>
    dialog.locator('.ant-form-item').filter({ hasText: label });
  await formItem('目标组织').getByRole('combobox').click();
  await page.getByText('财务部 (FIN)', { exact: true }).last().click();
  await formItem('责任类型').getByRole('combobox').click();
  await page.getByTitle('分管领导').click();
  const employment = formItem('任职').getByRole('combobox');
  await employment.fill('张三');
  const employmentOption = page.getByTitle(
    '张三（zhangsan） / 集团 / 运营部 / 运营负责人（OPS-LEAD）',
  );
  await expect(employmentOption).toBeVisible();
  await expect(dialog.getByText(/任职 ID/)).toHaveCount(0);
  await expect(dialog.getByText('#42')).toHaveCount(0);
  await employmentOption.click();
  await dialog.getByRole('button', { name: /确 定|提交/ }).click();

  await expect
    .poll(() => createInputs)
    .toEqual([
      {
        orgCode: 'FIN',
        typeCode: OrganizationResponsibilityTypeCode.Supervising,
        employmentId: 42,
      },
    ]);
  await expect(dialog).toBeHidden();
});

async function manageLifecycle(page: Page, changed: boolean) {
  await mockAdminApi(page);
  const searchInputs: unknown[] = [];
  const pauseInputs: unknown[] = [];
  const resumeInputs: unknown[] = [];
  const endInputs: unknown[] = [];
  let auditSearchCount = 0;
  let currentStatus: OrganizationResponsibilityAssignmentStatus =
    OrganizationResponsibilityAssignmentStatus.Enable;
  let currentEndTime: string | null = null;

  await page.route('**/rpc/admin.organization.selector**', (route) =>
    fulfillTrpc(route, []),
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.searchAssignments**',
    (route) => {
      const input = parseTrpcBatchInput<{ pageNum?: number }>(route);
      searchInputs.push(input);
      return fulfillTrpc(
        route,
        input.pageNum === 2
          ? {
              items: [
                {
                  ...assignment,
                  id: 100,
                  status: currentStatus,
                  endTime: currentEndTime,
                  allowedActions: allowedActionsForStatus(currentStatus),
                },
              ],
              total: 21,
              nextCursor: null,
            }
          : {
              items: [
                {
                  ...assignment,
                  status: currentStatus,
                  endTime: currentEndTime,
                  allowedActions: allowedActionsForStatus(currentStatus),
                },
              ],
              total: 21,
              nextCursor: '100',
            },
      );
    },
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.detailAssignment**',
    (route) =>
      fulfillTrpc(route, {
        ...assignment,
        status: currentStatus,
        endTime: currentEndTime,
        allowedActions: allowedActionsForStatus(currentStatus),
      }),
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.pauseAssignment**',
    (route) => {
      pauseInputs.push(parseTrpcBatchInput(route));
      currentStatus = OrganizationResponsibilityAssignmentStatus.Pause;
      return fulfillTrpc(route, { changed, result: null });
    },
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.resumeAssignment**',
    (route) => {
      resumeInputs.push(parseTrpcBatchInput(route));
      currentStatus = OrganizationResponsibilityAssignmentStatus.Enable;
      return fulfillTrpc(route, { changed, result: null });
    },
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.endAssignment**',
    (route) => {
      endInputs.push(parseTrpcBatchInput(route));
      currentStatus = OrganizationResponsibilityAssignmentStatus.Disable;
      currentEndTime = '2026-08-20T01:00:00.000Z';
      return fulfillTrpc(route, { changed, result: null });
    },
  );
  await page.route('**/rpc/admin.audit.search**', (route) => {
    auditSearchCount += 1;
    return fulfillTrpc(route, { result: [], total: 0 });
  });
  await page.route(
    '**/rpc/admin.organization.selector,admin.organization.selector,admin.organizationResponsibility.searchAssignments**',
    async (route) => {
      const encodedInput = new URL(route.request().url()).searchParams.get(
        'input',
      );
      const inputs = JSON.parse(encodedInput ?? '{}') as Record<
        string,
        unknown
      >;
      searchInputs.push(inputs['2']);
      await fulfillJson(route, [
        { result: { data: [] } },
        { result: { data: [] } },
        {
          result: {
            data: { items: [assignment], total: 21, nextCursor: '100' },
          },
        },
      ]);
    },
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.searchAssignments,admin.organizationResponsibility.detailAssignment**',
    async (route) => {
      const requestUrl = new URL(route.request().url());
      const inputs = JSON.parse(
        requestUrl.searchParams.get('input') ?? '{}',
      ) as Record<string, unknown>;
      searchInputs.push(inputs['0']);
      const responses: unknown[] = [
        {
          result: {
            data: {
              items: [
                {
                  ...assignment,
                  status: currentStatus,
                  endTime: currentEndTime,
                  allowedActions: allowedActionsForStatus(currentStatus),
                },
              ],
              total: 21,
              nextCursor: '100',
            },
          },
        },
        {
          result: {
            data: {
              ...assignment,
              status: currentStatus,
              endTime: currentEndTime,
              allowedActions: allowedActionsForStatus(currentStatus),
            },
          },
        },
      ];
      if (requestUrl.pathname.includes(',admin.audit.search')) {
        auditSearchCount += 1;
        responses.push({ result: { data: { result: [], total: 0 } } });
      }
      await fulfillJson(route, responses);
    },
  );
  await page.goto(
    '/iam-admin/organization-responsibilities/assignments?target=FIN&employment=42&type=head&lifecycle=all&assignment=101',
  );

  await expect(page.getByRole('button', { name: '详情' })).toBeVisible();
  await expect(page.getByText('已按指定任职筛选')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('任命 #101')).toBeVisible();
  await expect
    .poll(() => searchInputs[0])
    .toEqual({
      targetOrganizationCode: 'FIN',
      employmentId: 42,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      lifecycle: 'all',
      pageNum: 1,
      pageSize: 20,
    });

  await page
    .getByRole('dialog')
    .getByRole('button', { name: '暂停任命' })
    .click();
  await expect.poll(() => pauseInputs).toEqual([{ id: 101 }]);
  await expect(
    page.getByText(changed ? '责任任命已暂停' : '无需修改').last(),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '恢复任命' }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '恢复任命' })
    .click();
  await expect.poll(() => resumeInputs).toEqual([{ id: 101 }]);
  await expect(
    page.getByText(changed ? '责任任命已恢复' : '无需修改').last(),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '暂停任命' }),
  ).toBeVisible();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: '结束任命' })
    .click();
  await expect(
    page.getByText('结束后不可恢复；如需重新任命，必须创建新的责任任命。'),
  ).toBeVisible();
  await page.getByRole('button', { name: '确认结束' }).click();
  await expect.poll(() => endInputs).toEqual([{ id: 101 }]);
  await expect(
    page.getByText(changed ? '责任任命已结束' : '无需修改').last(),
  ).toBeVisible();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '暂停任命' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '恢复任命' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: '结束任命' }),
  ).toHaveCount(0);
  await expect.poll(() => auditSearchCount).toBeGreaterThan(1);

  await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  await page.getByTitle('2', { exact: true }).click();
  await expect(page.getByRole('button', { name: '详情' })).toHaveCount(1);
  await expect
    .poll(() => searchInputs.at(-1))
    .toEqual({
      targetOrganizationCode: 'FIN',
      employmentId: 42,
      typeCode: OrganizationResponsibilityTypeCode.Head,
      lifecycle: 'all',
      pageNum: 2,
      pageSize: 20,
    });
}

for (const changed of [true, false]) {
  test(`hydrates global filters and manages the complete lifecycle with changed=${changed} and audit refresh`, async ({
    page,
  }) => {
    await manageLifecycle(page, changed);
  });
}

test('preserves authority context after internal and forbidden lifecycle failures without replay', async ({
  page,
}) => {
  await mockAdminApi(page);
  let searchCount = 0;
  let detailCount = 0;
  let mutationCount = 0;

  await page.route('**/rpc/admin.organization.selector**', (route) =>
    fulfillTrpc(route, []),
  );
  await page.route('**/rpc/admin.audit.search**', (route) =>
    fulfillTrpc(route, { result: [], total: 0 }),
  );
  await page.route(
    '**/rpc/admin.organizationResponsibility.**',
    async (route) => {
      const operationPath = new URL(route.request().url()).pathname
        .split('/rpc/')[1]!
        .split(',');
      const responses = operationPath.map((operation) => {
        if (
          operation === 'admin.organizationResponsibility.searchAssignments'
        ) {
          searchCount += 1;
          return {
            result: {
              data: { items: [assignment], total: 21, nextCursor: null },
            },
          };
        }
        if (operation === 'admin.organizationResponsibility.detailAssignment') {
          detailCount += 1;
          return { result: { data: assignment } };
        }
        if (operation === 'admin.organizationResponsibility.pauseAssignment') {
          mutationCount += 1;
          const forbidden = mutationCount > 1;
          return {
            error: {
              message: 'sensitive transport detail',
              code: -32603,
              data: {
                code: forbidden ? 'FORBIDDEN' : 'INTERNAL_SERVER_ERROR',
                httpStatus: forbidden ? 403 : 500,
                path: operation,
                serviceCode: forbidden
                  ? ApiErrorCode.Forbidden
                  : ApiErrorCode.InternalError,
                serviceMessage: 'sensitive transport detail',
              },
            },
          };
        }
        if (operation === 'admin.audit.search')
          return { result: { data: { result: [], total: 0 } } };
        throw new Error(`Unexpected responsibility operation: ${operation}`);
      });
      await fulfillJson(route, responses);
    },
  );

  await page.goto(
    '/iam-admin/organization-responsibilities/assignments?lifecycle=all&assignment=101',
  );
  const drawer = page.getByRole('dialog');
  const pauseButton = drawer.getByRole('button', { name: '暂停任命' });
  await expect(drawer.getByText('张三（zhangsan）')).toBeVisible();

  await pauseButton.click();
  await expect(
    page.getByText('责任任命服务异常，已刷新权威状态'),
  ).toBeVisible();
  await expect(pauseButton).toBeEnabled();
  await expect.poll(() => mutationCount).toBe(1);
  await expect.poll(() => searchCount).toBe(1);
  await expect.poll(() => detailCount).toBe(2);
  await expect(drawer.getByText('张三（zhangsan）')).toBeVisible();
  await expect(page.getByText('sensitive transport detail')).toHaveCount(0);

  await pauseButton.click();
  await expect(page.getByText('无权管理组织责任任命')).toBeVisible();
  await expect.poll(() => mutationCount).toBe(2);
});

test('rejects invalid responsibility deep-link parameters without widening scope', async ({
  page,
}) => {
  await mockAdminApi(page);
  let searchCount = 0;
  await page.route(
    '**/rpc/admin.organizationResponsibility.searchAssignments**',
    (route) => {
      searchCount += 1;
      return fulfillTrpc(route, { items: [], total: 21, nextCursor: null });
    },
  );

  await page.goto(
    '/iam-admin/organization-responsibilities/assignments?employment=oops&assignment=0',
  );

  await expect(page.getByText('责任任命链接参数无效')).toBeVisible();
  await expect.poll(() => searchCount).toBe(0);
});
