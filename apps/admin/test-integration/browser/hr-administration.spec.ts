// Browser Integration uses a mocked backend; this is not a full-system journey.
import {
  ApiErrorCode,
  EmploymentStatus,
  OrganizationLevel,
  OrganizationStatus,
  OrganizationType,
  UserStatus,
} from '@iam/contracts';
import { expect, test, type Page } from '@playwright/test';
import {
  adminCapabilitySummary,
  adminEmploymentSearchResult,
  adminPositionSearchResult,
  adminUserDetail,
  currentAdminUser,
  createHrEmploymentAllowedActions,
  currentHrAdminUser,
  hrAdminCapabilitySummary,
  hrAdminEmploymentDetail,
  hrAdminUserDetail,
} from '../../test/mocks/fixtures';
import {
  fulfillJson,
  fulfillTrpc,
  mockAdminApi,
  parseTrpcBatchInput,
} from './fixtures';

const deniedReason = '当前管理员角色未授予此操作';

function collectMutationRequests(page: Page) {
  const requests: string[] = [];
  const mutationOperation =
    /admin\.[^.]+\.(?:create|update|delete|reset|generate|resign|transfer|pause|resume|end|set|clear|revoke|release|assign|remove|configure|enable|disable|rotate|change)/;

  page.on('request', (request) => {
    const url = decodeURIComponent(request.url());
    if (mutationOperation.test(url)) requests.push(url);
  });
  return requests;
}

async function mockHrAdmin(page: Page) {
  await mockAdminApi(page, {
    capabilitySummary: hrAdminCapabilitySummary,
    currentUser: currentHrAdminUser,
    userDetail: hrAdminUserDetail,
  });
  await page.route(
    '**/rpc/admin.organizationResponsibility.searchAssignments**',
    (route) => fulfillTrpc(route, { items: [], total: 0, nextCursor: null }),
  );
  const userUpdates: unknown[] = [];
  const passwordResets: unknown[] = [];
  await page.route('**/rpc/admin.user.update**', (route) => {
    userUpdates.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, { changed: true, result: null });
  });
  await page.route('**/rpc/admin.user.resetPassword**', (route) => {
    passwordResets.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, { changed: true, result: 'Rand1234' });
  });
  const roots = [
    {
      id: 10,
      orgCode: 'ROOT-A',
      orgName: '授权根 A',
      orgType: OrganizationType.Company,
      status: OrganizationStatus.Enable,
      level: OrganizationLevel.One,
      parentId: -1,
      orderNum: 1,
      isLeaf: true,
    },
    {
      id: 20,
      orgCode: 'ROOT-B',
      orgName: '授权根 B',
      orgType: OrganizationType.Company,
      status: OrganizationStatus.Enable,
      level: OrganizationLevel.One,
      parentId: -1,
      orderNum: 2,
      isLeaf: true,
    },
  ];
  const selectorNodes = roots.map((root) => ({
    ...root,
    fullPath: [
      {
        id: root.id,
        orgCode: root.orgCode,
        orgName: root.orgName,
        orgType: root.orgType,
        status: root.status,
        level: root.level,
        parentId: root.parentId,
        pathIndex: 0,
      },
    ],
    pathText: root.orgName,
    selectable: true,
  }));
  await page.route('**/rpc/admin.organization.children**', (route) => {
    const input = parseTrpcBatchInput<{ parentOrgCode?: string | null }>(route);
    return fulfillTrpc(route, {
      result: input.parentOrgCode ? [] : roots,
      total: input.parentOrgCode ? 0 : roots.length,
      pageNum: 1,
      pageSize: 50,
      pages: input.parentOrgCode ? 0 : 1,
    });
  });
  await page.route('**/rpc/admin.organization.search**', (route) =>
    fulfillTrpc(route, {
      result: [],
      total: 0,
      pageNum: 1,
      pageSize: 20,
      pages: 0,
    }),
  );
  await page.route('**/rpc/admin.organization.selector**', (route) =>
    fulfillTrpc(route, selectorNodes),
  );
  await page.route('**/rpc/admin.organization.detail**', (route) => {
    const { orgCode } = parseTrpcBatchInput<{ orgCode: string }>(route);
    const root = roots.find((item) => item.orgCode === orgCode) ?? roots[0];
    return fulfillTrpc(route, {
      ...root,
      businessParentId: -1,
      path: `/${root.id}`,
      isVirtual: false,
      isEntity: true,
      isDelete: false,
      parentCode: null,
      parentName: null,
      statusText: '正常',
      childrenCount: 0,
      employmentCount: 1,
      createTime: '2026-08-20T00:00:00.000Z',
      updateTime: '2026-08-20T00:00:00.000Z',
      allowedActions: {
        createChild: { allowed: true, reason: null },
        edit: { allowed: true, reason: null },
        changeStatus: {
          allowed: false,
          reason: 'INTEGRITY_GUARD_BLOCKED',
        },
        delete: { allowed: false, reason: 'INTEGRITY_GUARD_BLOCKED' },
      },
    });
  });
  const employmentSearchInputs: unknown[] = [];
  const employmentUpdates: unknown[] = [];
  const employmentLifecycleMutations: string[] = [];
  const employmentPrimaryMutations: string[] = [];
  const employmentTransfers: unknown[] = [];
  type MockEmploymentDetail = Omit<
    typeof hrAdminEmploymentDetail,
    'allowedActions' | 'description' | 'endTime' | 'status'
  > & {
    allowedActions: ReturnType<typeof createHrEmploymentAllowedActions>;
    description: string | null;
    endTime: string | null;
    status: EmploymentStatus;
  };
  let employmentDetail: MockEmploymentDetail = {
    ...hrAdminEmploymentDetail,
    description: hrAdminEmploymentDetail.description as string | null,
  };
  const setEmploymentStatus = (status: EmploymentStatus) => {
    employmentDetail = {
      ...employmentDetail,
      status,
      endTime:
        status === EmploymentStatus.Disable
          ? '2026-08-24T00:00:00.000Z'
          : null,
      allowedActions: createHrEmploymentAllowedActions(
        status,
        employmentDetail.isPrimary,
      ),
    };
  };
  const setEmploymentPrimary = (isPrimary: boolean) => {
    employmentDetail = {
      ...employmentDetail,
      isPrimary,
      allowedActions: createHrEmploymentAllowedActions(
        employmentDetail.status,
        isPrimary,
      ),
    };
  };
  await page.route('**/rpc/admin.employment.search**', (route) => {
    employmentSearchInputs.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, adminEmploymentSearchResult);
  });
  await page.route('**/rpc/admin.employment.detail**', (route) =>
    fulfillTrpc(route, employmentDetail),
  );
  await page.route('**/rpc/admin.employment.update**', (route) => {
    const input = parseTrpcBatchInput<{ data?: { description?: string } }>(
      route,
    );
    employmentUpdates.push(input);
    employmentDetail = {
      ...employmentDetail,
      description: input.data?.description ?? null,
    };
    return fulfillTrpc(route, true);
  });
  for (const [operation, status] of [
    ['pause', EmploymentStatus.Pause],
    ['resume', EmploymentStatus.Enable],
    ['end', EmploymentStatus.Disable],
  ] as const) {
    await page.route(`**/rpc/admin.employment.${operation}**`, (route) => {
      employmentLifecycleMutations.push(operation);
      setEmploymentStatus(status);
      return fulfillTrpc(route, true);
    });
  }
  for (const [operation, isPrimary] of [
    ['setPrimary', true],
    ['clearPrimary', false],
  ] as const) {
    await page.route(`**/rpc/admin.employment.${operation}**`, (route) => {
      employmentPrimaryMutations.push(operation);
      setEmploymentPrimary(isPrimary);
      return fulfillTrpc(route, { changed: true, result: null });
    });
  }
  await page.route('**/rpc/admin.employment.transfer**', (route) => {
    employmentTransfers.push(parseTrpcBatchInput(route));
    setEmploymentStatus(EmploymentStatus.Disable);
    return fulfillTrpc(route, { changed: true, result: { id: 100 } });
  });
  await page.route(
    '**/rpc/admin.position.search,admin.organization.selector**',
    (route) =>
      fulfillJson(route, [
        { result: { data: adminPositionSearchResult } },
        { result: { data: selectorNodes } },
      ]),
  );
  await page.route(
    '**/rpc/admin.organization.selector,admin.employment.detail**',
    (route) =>
      fulfillJson(route, [
        { result: { data: selectorNodes } },
        { result: { data: employmentDetail } },
      ]),
  );
  return {
    employmentLifecycleMutations,
    employmentPrimaryMutations,
    employmentSearchInputs,
    employmentTransfers,
    employmentUpdates,
    passwordResets,
    userUpdates,
  };
}

test('HR admin reads scoped directories and manages an authorized User from detail', async ({
  page,
}) => {
  const mutationRequests = collectMutationRequests(page);
  const { passwordResets, userUpdates } = await mockHrAdmin(page);

  await page.goto('/iam-admin/');

  await expect(page).toHaveURL(/\/iam-admin\/users$/);
  await expect(page.getByText('人事管理员(hradmin)')).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /用户管理/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /职位管理/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /组织管理/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /组织责任/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /雇佣关系/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /应用管理/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /角色管理/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /会话管理/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /审计日志/ })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /系统日志/ })).toHaveCount(0);

  await expect(page.getByRole('cell', { name: '张三' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '李四' })).toBeVisible();
  await expect(page.getByRole('cell', { name: '王五' })).toBeVisible();
  const viewActions = page.locator('td a').filter({ hasText: '查看' });
  await expect(viewActions).toHaveCount(3);
  await expect(page.getByRole('button', { name: /新建用户/ })).toHaveCount(0);

  await viewActions.first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer).toBeVisible();
  const changeStatus = drawer.getByRole('button', { name: /状\s*态/ });
  await expect(changeStatus).toBeDisabled();
  await expect(changeStatus).toHaveAttribute(
    'title',
    '该用户仍有范围外的开放任职',
  );
  const deleteUser = drawer.getByRole('button', { name: /删\s*除/ });
  await expect(deleteUser).toBeDisabled();
  await expect(deleteUser).toHaveAttribute('title', deniedReason);
  const resignUser = drawer.getByRole('button', { name: /离\s*职/ });
  await expect(resignUser).toBeDisabled();
  await expect(resignUser).toHaveAttribute(
    'title',
    '该用户仍有范围外的开放任职',
  );
  const editProfile = drawer.getByRole('button', { name: /编\s*辑/ });
  const resetPassword = drawer.getByRole('button', {
    name: /重\s*置\s*密\s*码/,
  });
  await expect(editProfile).toBeEnabled();
  await expect(resetPassword).toBeEnabled();

  await editProfile.click();
  const editUserDialog = page.getByRole('dialog', { name: '编辑用户' });
  await editUserDialog.getByRole('textbox', { name: '姓名' }).fill('张三（更新）');
  await editUserDialog.getByRole('textbox', { name: '手机号' }).fill('13900000000');
  await editUserDialog.getByRole('textbox', { name: '微信 ID' }).fill('zhangsan-wx');
  await editUserDialog.getByRole('button', { name: /确\s*定/ }).click();
  await expect.poll(() => userUpdates.length).toBe(1);
  expect(userUpdates[0]).toEqual({
    username: 'zhangsan',
    data: {
      name: '张三（更新）',
      mobile: '13900000000',
      wxId: 'zhangsan-wx',
    },
  });

  await viewActions.first().click();
  const refreshedDrawer = page.getByRole('dialog');
  await refreshedDrawer
    .getByRole('button', { name: /重\s*置\s*密\s*码/ })
    .click();
  const resetConfirmation = page
    .getByRole('dialog')
    .filter({ hasText: '重置 张三 的密码？' });
  await resetConfirmation.getByRole('button', { name: /重\s*置/ }).click();
  await expect.poll(() => passwordResets.length).toBe(1);
  expect(passwordResets[0]).toEqual({ username: 'zhangsan' });
  const generatedPasswordDialog = page.getByRole('dialog', {
    name: '新密码已生成',
  });
  await expect(generatedPasswordDialog.getByText('Rand1234')).toBeVisible();
  await generatedPasswordDialog
    .getByRole('button', { name: '我已复制' })
    .click();
  await expect(page.getByText('Rand1234')).toHaveCount(0);
  await refreshedDrawer.getByRole('button', { name: '关闭' }).click();

  await viewActions.first().click();
  const informativeDrawer = page.getByRole('dialog');

  await informativeDrawer.getByRole('tab', { name: /雇佣/ }).click();
  const employmentPanel = informativeDrawer.getByRole('tabpanel', {
    name: /雇佣/,
  });
  await expect(employmentPanel.getByText('财务部')).toBeVisible();
  await expect(
    employmentPanel.getByRole('columnheader', { name: '角色' }),
  ).toHaveCount(0);
  await expect(
    employmentPanel.getByRole('columnheader', { name: '权限' }),
  ).toHaveCount(0);
  await expect(employmentPanel.getByText('iam:hr-admin')).toHaveCount(0);
  await expect(employmentPanel.getByText('people:read')).toHaveCount(0);
  const employmentRow = employmentPanel
    .getByRole('row')
    .filter({ hasText: '财务部' });
  const viewEmploymentFontWeight = await employmentRow
    .getByRole('link', { name: '查看任职' })
    .evaluate((element) => getComputedStyle(element).fontWeight);
  for (const action of [
    /转\s*岗/,
    '取消主岗',
    /暂\s*停/,
    /结\s*束/,
  ]) {
    const actionButton = employmentRow.getByRole('button', { name: action });
    await expect(actionButton).toBeEnabled();
    await expect(actionButton).toHaveClass(/ant-btn-link/);
    await expect(actionButton).toHaveCSS('padding-left', '0px');
    await expect(actionButton).toHaveCSS('padding-right', '0px');
    expect(
      await actionButton.evaluate(
        (element) => getComputedStyle(element).fontWeight,
      ),
    ).toBe(viewEmploymentFontWeight);
  }
  await expect(
    employmentPanel.getByRole('button', { name: /新增雇佣/ }),
  ).toBeVisible();
  await expect(
    employmentPanel.locator('a').filter({ hasText: '转岗' }),
  ).toHaveCount(0);
  await expect(
    informativeDrawer.getByRole('tab', { name: '操作日志' }),
  ).toHaveCount(0);
  await employmentPanel.getByRole('link', { name: '查看任职' }).click();
  await expect(page).toHaveURL(/\/iam-admin\/employments\?employmentId=42$/);
  await expect(
    page.getByRole('dialog').filter({ hasText: '张三' }),
  ).toBeVisible();

  await page.goto('/iam-admin/positions');
  await expect(page.getByRole('cell', { name: '财务经理' })).toBeVisible();
  await expect(
    page.getByRole('cell', { name: '2', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /新建岗位/ })).toHaveCount(0);
  await expect(page.locator('td a')).toHaveCount(0);

  await page.goto('/iam-admin/organizations');
  await expect(page.getByRole('button', { name: /新建根组织/ })).toHaveCount(0);
  await expect(page.getByText('授权根 A')).toBeVisible();
  await expect(page.getByText('授权根 B')).toBeVisible();
  await expect(page.getByText('范围外根')).toHaveCount(0);
  await page.getByText('授权根 A').click();
  await expect(page.getByRole('button', { name: '+ 下级组织' })).toBeEnabled();
  const editOrganization = page.getByRole('button', { name: /编\s*辑/ });
  await expect(editOrganization).toBeEnabled();
  await expect(page.getByRole('button', { name: /状\s*态/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: /删\s*除/ })).toBeDisabled();
  await expect(page.getByRole('tab', { name: '责任任命' })).toBeVisible();
  await editOrganization.click();
  const editOrganizationDialog = page.getByRole('dialog', { name: '编辑组织' });
  await expect(
    editOrganizationDialog.getByRole('combobox', { name: '状态' }),
  ).toBeDisabled();
  await editOrganizationDialog.getByRole('button', { name: /取\s*消/ }).click();
  expect(mutationRequests).toHaveLength(2);

  let logoutUrl: URL | undefined;
  await page.route('**/sso/logout**', async (route) => {
    logoutUrl = new URL(route.request().url());
    await route.fulfill({ body: 'logged out', status: 200 });
  });
  await page.getByText('人事管理员(hradmin)').click();
  await Promise.all([
    page.waitForURL(/\/sso\/logout\?/),
    page.getByText('退出登录', { exact: true }).click(),
  ]);
  expect(logoutUrl?.pathname).toBe('/sso/logout');
  expect(logoutUrl?.searchParams.get('redirectUrl')).toBe(
    'http://127.0.0.1:8001/iam-admin',
  );
});

test('HR admin sees the server reason when an HR-managed User is not enabled for password reset', async ({
  page,
}) => {
  const mutationRequests = collectMutationRequests(page);
  await mockAdminApi(page, {
    capabilitySummary: hrAdminCapabilitySummary,
    currentUser: currentHrAdminUser,
    userDetail: {
      ...hrAdminUserDetail,
      status: UserStatus.Pause,
      allowedActions: {
        ...hrAdminUserDetail.allowedActions,
        resetPassword: { allowed: false, reason: 'USER_NOT_ENABLED' },
      },
    },
  });

  await page.goto('/iam-admin/users');
  await page.locator('td a').filter({ hasText: '查看' }).first().click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('button', { name: /编\s*辑/ })).toBeEnabled();
  const resetPassword = drawer.getByRole('button', {
    name: /重\s*置\s*密\s*码/,
  });
  await expect(resetPassword).toBeDisabled();
  await expect(resetPassword).toHaveAttribute(
    'title',
    '该用户当前不是启用状态',
  );
  expect(mutationRequests).toEqual([]);
});

test('HR admin sees only executable User status actions and submits the selected transition', async ({
  page,
}) => {
  const statusMutations: unknown[] = [];
  await mockAdminApi(page, {
    capabilitySummary: hrAdminCapabilitySummary,
    currentUser: currentHrAdminUser,
    userDetail: {
      ...hrAdminUserDetail,
      allowedActions: {
        ...hrAdminUserDetail.allowedActions,
        changeStatus: { allowed: true, reason: null },
      },
    },
  });
  await page.route('**/rpc/admin.user.updateStatus**', (route) => {
    statusMutations.push(parseTrpcBatchInput(route));
    return fulfillTrpc(route, { changed: true, result: null });
  });

  await page.goto('/iam-admin/users');
  await page.locator('td a').filter({ hasText: '查看' }).first().click();
  const drawer = page.getByRole('dialog');
  const changeStatus = drawer.getByRole('button', { name: /状\s*态/ });

  await expect(changeStatus).toBeEnabled();
  await changeStatus.click();
  await expect(page.getByText('切为「暂停」', { exact: true })).toBeVisible();
  await expect(page.getByText('切为「结束」', { exact: true })).toBeVisible();
  await expect(page.getByText('切为「启用」', { exact: true })).toHaveCount(0);
  await page.getByText('切为「暂停」', { exact: true }).click();

  await expect.poll(() => statusMutations).toEqual([{
    username: 'zhangsan',
    status: UserStatus.Pause,
  }]);
  await expect(page.getByText('状态已更新', { exact: true })).toBeVisible();
});

test('HR admin completes resignation and can retry the server-confirmed completed shape', async ({
  page,
}) => {
  const resignations: unknown[] = [];
  const eligibleDetail = {
    ...hrAdminUserDetail,
    allowedActions: {
      ...hrAdminUserDetail.allowedActions,
      resign: { allowed: true, reason: null },
    },
  };
  const completedDetail = {
    ...eligibleDetail,
    status: UserStatus.Disable,
    employments: eligibleDetail.employments.map((employment) => ({
      ...employment,
      status: EmploymentStatus.Disable,
      endTime: '2026-08-24T00:00:00.000Z',
      isPrimary: false,
      managementPath: null,
    })),
  };
  let currentDetail: typeof eligibleDetail | typeof completedDetail =
    eligibleDetail;
  await mockAdminApi(page, {
    capabilitySummary: hrAdminCapabilitySummary,
    currentUser: currentHrAdminUser,
    userDetail: eligibleDetail,
  });
  await page.route('**/rpc/admin.user.detail**', (route) =>
    fulfillTrpc(route, currentDetail),
  );
  await page.route('**/rpc/admin.employment.resignUser**', (route) => {
    resignations.push(parseTrpcBatchInput(route));
    currentDetail = completedDetail;
    return fulfillTrpc(route, { changed: resignations.length === 1, result: null });
  });

  await page.goto('/iam-admin/users');
  await page.locator('td a').filter({ hasText: '查看' }).first().click();
  const drawer = page.getByRole('dialog');

  for (const expectedCount of [1, 2]) {
    await drawer.getByRole('button', { name: /离\s*职/ }).click();
    const confirmation = page
      .getByRole('dialog')
      .filter({ hasText: '办理用户 张三 离职？' });
    await confirmation.getByRole('button', { name: /确\s*定/ }).click();
    await expect.poll(() => resignations.length).toBe(expectedCount);
    await expect(
      page.getByText(expectedCount === 1 ? '离职已完成' : '已处于离职状态，无需修改').last(),
    ).toBeVisible();
    await expect(drawer.getByRole('button', { name: /离\s*职/ })).toBeEnabled();
  }

  expect(resignations).toEqual([
    { username: 'zhangsan' },
    { username: 'zhangsan' },
  ]);
});

for (const role of ['Full Admin', 'HR'] as const) {
  test(`${role} refreshes committed resignation and retains its repair warning without replay`, async ({
    page,
  }) => {
    const isHr = role === 'HR';
    const sourceDetail = isHr ? hrAdminUserDetail : adminUserDetail;
    let currentDetail = {
      ...sourceDetail,
      allowedActions: {
        ...sourceDetail.allowedActions,
        resign: { allowed: true, reason: null },
      },
    };
    let mutations = 0;
    let reads = 0;
    await mockAdminApi(page, {
      capabilitySummary: isHr
        ? hrAdminCapabilitySummary
        : adminCapabilitySummary,
      currentUser: isHr ? currentHrAdminUser : currentAdminUser,
      userDetail: currentDetail,
    });
    await page.route('**/rpc/admin.user.detail**', (route) => {
      reads += 1;
      return fulfillTrpc(route, currentDetail);
    });
    await page.route('**/rpc/admin.employment.resignUser**', (route) => {
      mutations += 1;
      currentDetail = {
        ...currentDetail,
        name: '已刷新离职用户',
        status: UserStatus.Disable,
      };
      return fulfillJson(route, [
        {
          error: {
            message: 'required cleanup failed',
            code: -32603,
            data: {
              code: 'INTERNAL_SERVER_ERROR',
              httpStatus: 500,
              serviceCode: ApiErrorCode.AdminMutationCommitted,
            },
          },
        },
      ]);
    });
    await page.goto('/iam-admin/users');
    await page.locator('td a').filter({ hasText: '查看' }).first().click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /离\s*职/ })
      .click();
    const confirmation = page
      .getByRole('dialog')
      .filter({ hasText: /办理用户 .* 离职？/ });
    await confirmation.getByRole('button', { name: /确\s*定/ }).click();
    await expect(
      page
        .getByRole('tabpanel', { name: '基本信息' })
        .getByText('已刷新离职用户', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: '操作已生效，但后续处理失败' }),
    ).toContainText('联系管理员修复');
    await expect(page.getByText('离职已完成', { exact: true })).toHaveCount(0);
    expect(mutations).toBe(1);
    expect(reads).toBe(2);
  });
}

test('HR admin does not report resignation success when the mutation is rejected', async ({
  page,
}) => {
  const mutationRequests = collectMutationRequests(page);
  await mockAdminApi(page, {
    capabilitySummary: hrAdminCapabilitySummary,
    currentUser: currentHrAdminUser,
    userDetail: {
      ...hrAdminUserDetail,
      allowedActions: {
        ...hrAdminUserDetail.allowedActions,
        resign: { allowed: true, reason: null },
      },
    },
  });
  await page.route('**/rpc/admin.employment.resignUser**', (route) =>
    fulfillJson(route, [{
      error: {
        message: '离职资格已变化，请刷新后重试',
        code: -32603,
        data: {
          code: 'FORBIDDEN',
          httpStatus: 403,
          path: 'admin.employment.resignUser',
          serviceCode: 'AUTHZ.FORBIDDEN',
          serviceMessage: '离职资格已变化，请刷新后重试',
        },
      },
    }]),
  );

  await page.goto('/iam-admin/users');
  await page.locator('td a').filter({ hasText: '查看' }).first().click();
  const drawer = page.getByRole('dialog');
  await drawer.getByRole('button', { name: /离\s*职/ }).click();
  const confirmation = page
    .getByRole('dialog')
    .filter({ hasText: '办理用户 张三 离职？' });
  await confirmation.getByRole('button', { name: /确\s*定/ }).click();

  await expect(page.getByText('离职资格已变化，请刷新后重试')).toBeVisible();
  await expect(page.getByText('离职已完成')).toHaveCount(0);
  expect(
    mutationRequests.filter((url) => url.includes('admin.employment.resignUser')),
  ).toHaveLength(1);
});

test('HR admin sees the server reason when a User is not HR-managed for status changes', async ({
  page,
}) => {
  const mutationRequests = collectMutationRequests(page);
  await mockAdminApi(page, {
    capabilitySummary: hrAdminCapabilitySummary,
    currentUser: currentHrAdminUser,
    userDetail: {
      ...hrAdminUserDetail,
      allowedActions: {
        ...hrAdminUserDetail.allowedActions,
        changeStatus: { allowed: false, reason: 'USER_NOT_HR_MANAGED' },
      },
    },
  });

  await page.goto('/iam-admin/users');
  await page.locator('td a').filter({ hasText: '查看' }).first().click();
  const changeStatus = page
    .getByRole('dialog')
    .getByRole('button', { name: /状\s*态/ });

  await expect(changeStatus).toBeDisabled();
  await expect(changeStatus).toHaveAttribute(
    'title',
    '该用户当前不属于可管理人员',
  );
  expect(mutationRequests).toEqual([]);
});

test('HR admin manages the granted Employment description and current lifecycle actions', async ({
  page,
}) => {
  const {
    employmentLifecycleMutations,
    employmentSearchInputs,
    employmentUpdates,
  } = await mockHrAdmin(page);

  await page.goto('/iam-admin/employments');
  await expect(page.getByRole('cell', { name: /张三/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /新增雇佣/ })).toBeVisible();
  await expect.poll(() => employmentSearchInputs.length).toBeGreaterThan(0);
  expect(employmentSearchInputs[0]).toMatchObject({
    conditions: {
      exactConditions: {
        statuses: [EmploymentStatus.Enable, EmploymentStatus.Pause],
      },
    },
  });

  await page.getByText('展开', { exact: true }).click();
  await page.getByRole('combobox', { name: '状态 :' }).click();
  await page.getByText('结束', { exact: true }).last().click();
  await page.getByRole('button', { name: /查\s*询/ }).click();
  await expect.poll(() => employmentSearchInputs.length).toBeGreaterThan(1);
  expect(employmentSearchInputs.at(-1)).toMatchObject({
    conditions: { exactConditions: { statuses: [EmploymentStatus.Disable] } },
  });

  const row = page.getByRole('row').filter({ hasText: '张三' });
  await expect(row.getByText('查看')).toBeVisible();
  await expect(row.getByText('转岗')).toHaveCount(0);
  await row.getByText('查看').click();

  const drawer = page.getByRole('dialog').filter({ hasText: '张三' });
  await expect(drawer.getByRole('button', { name: '编辑备注' })).toBeEnabled();
  for (const action of [/转\s*岗/, '取消主岗']) {
    const button = drawer.getByRole('button', { name: action });
    await expect(button).toBeEnabled();
  }
  await drawer.getByRole('button', { name: '编辑备注' }).click();
  const editDialog = page
    .getByRole('dialog')
    .filter({ hasText: '编辑任职备注' });
  await editDialog.getByRole('textbox', { name: '备注' }).fill('HR 核验备注');
  await editDialog.getByRole('button', { name: /保\s*存/ }).click();
  await expect.poll(() => employmentUpdates.length).toBe(1);
  expect(employmentUpdates[0]).toMatchObject({
    id: 42,
    data: { description: 'HR 核验备注' },
  });

  await expect(
    drawer.getByRole('button', { name: /暂\s*停/ }),
  ).toBeEnabled();
  await expect(
    drawer.getByRole('button', { name: /结\s*束/ }),
  ).toBeEnabled();
  await expect(drawer.getByRole('button', { name: /恢\s*复/ })).toHaveCount(0);

  await drawer.getByRole('button', { name: /暂\s*停/ }).click();
  await page.getByRole('button', { name: '暂停任职' }).click();
  await expect.poll(() => employmentLifecycleMutations).toEqual(['pause']);
  await expect(
    drawer.getByRole('button', { name: /恢\s*复/ }),
  ).toBeEnabled();
  await expect(
    drawer.getByRole('button', { name: /结\s*束/ }),
  ).toBeEnabled();
  await expect(drawer.getByRole('button', { name: /暂\s*停/ })).toHaveCount(0);

  await drawer.getByRole('button', { name: /恢\s*复/ }).click();
  await expect.poll(() => employmentLifecycleMutations).toEqual([
    'pause',
    'resume',
  ]);
  await expect(
    drawer.getByRole('button', { name: /暂\s*停/ }),
  ).toBeEnabled();

  await drawer.getByRole('button', { name: /结\s*束/ }).click();
  await page.getByRole('button', { name: '结束任职' }).click();
  await expect.poll(() => employmentLifecycleMutations).toEqual([
    'pause',
    'resume',
    'end',
  ]);
  for (const action of [/暂\s*停/, /恢\s*复/, /结\s*束/]) {
    await expect(drawer.getByRole('button', { name: action })).toHaveCount(0);
  }

  await drawer.getByRole('button', { name: '关闭' }).click();
  await page.getByRole('button', { name: /新增雇佣/ }).click();
  const createDialog = page.getByRole('dialog').filter({ hasText: '新增雇佣' });
  const userSelector = createDialog.getByRole('combobox', { name: '用户' });
  await userSelector.fill('李');
  const pausedUser = page.getByText(/李四.*lisi/);
  await expect(pausedUser).toBeVisible();
  await pausedUser.click();
  await createDialog.getByRole('combobox').nth(1).click();
  const scopedOrganization = page.getByText('授权根 A (ROOT-A)');
  await expect(scopedOrganization).toBeVisible();
  await expect(page.getByText('范围外根')).toHaveCount(0);
  await scopedOrganization.click();
  await createDialog.getByRole('combobox', { name: /岗位/ }).click();
  await expect(page.getByText('财务经理 (FIN-001)').last()).toBeVisible();
});

test('HR admin manages Primary and transfers between scoped roots with the global Position catalog', async ({
  page,
}) => {
  const { employmentPrimaryMutations, employmentTransfers } =
    await mockHrAdmin(page);

  await page.goto('/iam-admin/employments');
  const row = page.getByRole('row').filter({ hasText: '张三' });
  await row.getByText('查看').click();
  const drawer = page.getByRole('dialog').filter({ hasText: '张三' });

  await drawer.getByRole('button', { name: '取消主岗' }).click();
  const clearPrimaryDialog = page
    .getByRole('dialog')
    .filter({ hasText: '取消 张三 的主任职' });
  await clearPrimaryDialog
    .getByRole('button', { name: '取消主岗' })
    .click();
  await expect.poll(() => employmentPrimaryMutations).toEqual([
    'clearPrimary',
  ]);
  await expect(drawer.getByRole('button', { name: '设主岗' })).toBeEnabled();

  await drawer.getByRole('button', { name: '设主岗' }).click();
  const setPrimaryDialog = page
    .getByRole('dialog')
    .filter({ hasText: '将 张三 的主岗设为 财务经理' });
  await setPrimaryDialog.getByRole('button', { name: '设为主岗' }).click();
  await expect.poll(() => employmentPrimaryMutations).toEqual([
    'clearPrimary',
    'setPrimary',
  ]);
  await expect(
    drawer.getByRole('button', { name: '取消主岗' }),
  ).toBeEnabled();

  await drawer.getByRole('button', { name: /转\s*岗/ }).click();
  const transferDialog = page
    .getByRole('dialog')
    .filter({ hasText: '转岗 — 张三 (zhangsan)' });
  await transferDialog.getByRole('combobox').first().click();
  await expect(page.getByText('授权根 A (ROOT-A)')).toBeVisible();
  await expect(page.getByText('授权根 B (ROOT-B)')).toBeVisible();
  await expect(page.getByText('范围外根')).toHaveCount(0);
  await page.getByText('授权根 B (ROOT-B)').click();
  await transferDialog.getByRole('combobox').nth(1).click();
  await expect(page.getByText('财务经理 (FIN-001)').last()).toBeVisible();
  await page.getByText('财务经理 (FIN-001)').last().click();
  await transferDialog
    .getByRole('radio', { name: '主任职', exact: true })
    .check();
  await transferDialog.getByRole('button', { name: /确\s*定/ }).click();

  await expect.poll(() => employmentTransfers.length).toBe(1);
  expect(employmentTransfers[0]).toMatchObject({
    id: 42,
    data: {
      newOrgCode: 'ROOT-B',
      newPosCode: 'FIN-001',
      isPrimary: true,
    },
  });
  const endedTransfer = drawer.getByRole('button', { name: /转\s*岗/ });
  await expect(endedTransfer).toBeDisabled();
  await expect(endedTransfer).toHaveAttribute(
    'title',
    '目标资源当前状态不支持此操作',
  );
});

test('HR admin can browse responsibility pages while other management namespaces stay hidden', async ({
  page,
}) => {
  const mutationRequests = collectMutationRequests(page);
  const hiddenManagementRequests: string[] = [];
  await mockHrAdmin(page);
  page.on('request', (request) => {
    const url = decodeURIComponent(request.url());
    if (
      /\/rpc\/admin\.(?:client|role|sessionManagement|audit|systemLog)\./.test(
        url,
      )
    ) {
      hiddenManagementRequests.push(url);
    }
  });

  await page.goto('/iam-admin/organization-responsibilities/types');
  await expect(page.getByText('责任类型目录').first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'head' })).toBeVisible();

  await page.goto('/iam-admin/organization-responsibilities/assignments');
  await expect(page.getByText('责任任命列表')).toBeVisible();
  await expect(page.getByRole('button', { name: /新建责任任命/ })).toHaveCount(
    0,
  );

  const hiddenRoutes = [
    'clients',
    'roles',
    'sessions',
    'audit-logs',
    'system-logs',
  ];
  for (const route of hiddenRoutes) {
    await page.goto(`/iam-admin/${route}`);
    await expect(page).toHaveURL(new RegExp(`/iam-admin/${route}$`));
    await expect(page.getByText('抱歉，你无权访问该页面')).toBeVisible();
  }

  expect(hiddenManagementRequests).toEqual([]);
  expect(mutationRequests).toEqual([]);
});
