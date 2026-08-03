import type {
  LoginRestrictionListItem,
  LoginRestrictionListInput,
  LoginRestrictionReleaseInput,
  SessionListInput,
  SessionListItem,
  SessionRevokeInput,
} from '@admin/services/session-management';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import {
  mockAdminApi,
  mockLoginRestrictionListRoute,
  mockLoginRestrictionReleaseRoute,
  mockSessionListRoute,
  mockSessionRevokeRoute,
} from './fixtures';

const firstPageSessions = [
  {
    principalSessionId: 'ps-current',
    user: {
      id: 42,
      subjectId: '00000000-0000-4000-8000-000000000042',
      username: 'zhangsan',
      name: '张三',
      accountStatus: 'normal',
    },
    authMethods: ['password', 'mobile'],
    authTime: Date.parse('2026-07-28T08:00:00.000Z'),
    expiresAt: Date.parse('2026-07-29T08:00:00.000Z'),
    origin: {
      ip: '203.0.113.42',
      deviceType: 'mobile',
      operatingSystem: 'ios',
      browser: 'wechat',
    },
    isCurrentSession: true,
    isCurrentUser: true,
  },
  {
    principalSessionId: 'ps-deleted',
    user: {
      id: 43,
      subjectId: '00000000-0000-4000-8000-000000000043',
      username: 'deleted-user',
      name: '已删除用户',
      accountStatus: 'deleted',
    },
    authMethods: ['unknown'],
    authTime: Date.parse('2026-07-27T08:00:00.000Z'),
    expiresAt: Date.parse('2026-07-29T07:00:00.000Z'),
    origin: null,
    isCurrentSession: false,
    isCurrentUser: false,
  },
] satisfies SessionListItem[];

const secondPageSession = {
  principalSessionId: 'ps-page-two',
  user: {
    id: null,
    subjectId: '00000000-0000-4000-8000-999999999999',
    username: null,
    name: null,
    accountStatus: 'unknown',
  },
  authMethods: ['oa'],
  authTime: Date.parse('2026-07-26T08:00:00.000Z'),
  expiresAt: Date.parse('2026-07-29T06:00:00.000Z'),
  origin: {
    ip: null,
    deviceType: 'unknown',
    operatingSystem: 'unknown',
    browser: 'other',
  },
  isCurrentSession: false,
  isCurrentUser: false,
} satisfies SessionListItem;

const firstPageLoginRestrictions = [
  {
    user: {
      id: 42,
      username: 'zhangsan',
      name: '张三',
      accountStatus: 'normal',
    },
    cause: 'too_many_login_failures',
    triggerMethod: 'password',
    restrictedUntil: Date.parse('2030-07-28T08:30:00.000Z'),
    remainingSeconds: 120,
  },
  {
    user: {
      id: 43,
      username: 'deleted-user',
      name: '已删除用户',
      accountStatus: 'deleted',
    },
    cause: 'too_many_login_failures',
    triggerMethod: 'unknown',
    restrictedUntil: Date.parse('2030-07-28T08:20:00.000Z'),
    remainingSeconds: 60,
  },
] satisfies LoginRestrictionListItem[];

type SessionRevokeResponder = Parameters<typeof mockSessionRevokeRoute>[1];
type LoginRestrictionReleaseResponder = Parameters<
  typeof mockLoginRestrictionReleaseRoute
>[1];

async function setupLoginRestrictionRelease(
  page: Page,
  respond: LoginRestrictionReleaseResponder,
  options: { removeTargetAfterReload?: boolean } = {},
) {
  await mockAdminApi(page);
  await mockSessionListRoute(page, (input) => ({
    type: 'success',
    data: {
      result: [],
      total: 0,
      pageNum: input.pageNum ?? 1,
      pageSize: input.pageSize ?? 20,
      pages: 0,
    },
  }));
  const listInputs = await mockLoginRestrictionListRoute(
    page,
    (input, requestNumber) => {
      const targetWasRemoved =
        options.removeTargetAfterReload === true && requestNumber > 1;
      const result = targetWasRemoved
        ? [firstPageLoginRestrictions[0]]
        : firstPageLoginRestrictions;
      return {
        type: 'success',
        data: {
          result,
          total: result.length,
          pageNum: input.pageNum ?? 1,
          pageSize: input.pageSize ?? 20,
          pages: 1,
        },
      };
    },
  );
  const releaseInputs = await mockLoginRestrictionReleaseRoute(page, respond);
  await page.goto('/iam-admin/sessions');
  const restrictionTab = page.getByRole('tab', { name: '临时登录限制' });
  await expect(restrictionTab).toBeVisible({ timeout: 20_000 });
  await restrictionTab.click();
  await expect(page.getByText('已删除用户')).toBeVisible();
  return { listInputs, releaseInputs };
}

async function openTargetLoginRestrictionReleaseDialog(page: Page) {
  await page
    .getByRole('row')
    .filter({ hasText: '已删除用户' })
    .getByRole('button', { name: '解除限制' })
    .click();
  return page.getByRole('dialog');
}

async function confirmLoginRestrictionRelease(dialog: Locator) {
  await dialog.getByRole('button', { name: '确认解除' }).click();
}

async function expectSingleLoginRestrictionReleaseAndReload(
  releaseInputs: LoginRestrictionReleaseInput[],
  listInputs: LoginRestrictionListInput[],
  listRequestCount: number,
) {
  await expect.poll(() => releaseInputs).toEqual([{ userId: 43 }]);
  await expect.poll(() => listInputs.length).toBe(listRequestCount + 1);
}

async function setupSessionRevoke(
  page: Page,
  respond: SessionRevokeResponder,
  options: { removeTargetAfterReload?: boolean } = {},
) {
  await mockAdminApi(page);
  const listInputs = await mockSessionListRoute(
    page,
    (input, requestNumber) => {
      const targetWasRemoved =
        options.removeTargetAfterReload === true && requestNumber > 1;
      const result = targetWasRemoved
        ? [firstPageSessions[0]]
        : firstPageSessions;
      return {
        type: 'success',
        data: {
          result,
          total: result.length,
          pageNum: input.pageNum ?? 1,
          pageSize: input.pageSize ?? 20,
          pages: 1,
        },
      };
    },
  );
  const revokeInputs = await mockSessionRevokeRoute(page, respond);
  await page.goto('/iam-admin/sessions');
  return { listInputs, revokeInputs };
}

async function openTargetSessionRevokeDialog(page: Page) {
  await page
    .getByRole('row')
    .filter({ hasText: '已删除用户' })
    .getByRole('button', { name: '强制下线本次' })
    .click();
  return page.getByRole('dialog');
}

async function confirmSessionRevoke(dialog: Locator) {
  await dialog.getByRole('button', { name: '确认下线' }).click();
}

async function expectSingleTargetRevokeAndReload(
  revokeInputs: SessionRevokeInput[],
  listInputs: SessionListInput[],
  listRequestCount: number,
) {
  await expect
    .poll(() => revokeInputs)
    .toEqual([
      {
        target: {
          type: 'session',
          principalSessionId: 'ps-deleted',
        },
      },
    ]);
  await expect.poll(() => listInputs.length).toBe(listRequestCount + 1);
}

async function revokeUserAndExpectReload(
  page: Page,
  revokeInputs: SessionRevokeInput[],
  listInputs: SessionListInput[],
  options: {
    rowText: string;
    userId: number;
    expectDialog?: (dialog: Locator) => Promise<void>;
  },
) {
  await page
    .getByRole('row')
    .filter({ hasText: options.rowText })
    .getByRole('button', { name: '下线该用户全部' })
    .click();

  const dialog = page.getByRole('dialog');
  await options.expectDialog?.(dialog);
  const listRequestCount = listInputs.length;
  await confirmSessionRevoke(dialog);

  await expect.poll(() => revokeInputs).toEqual([
    {
      target: {
        type: 'user',
        userId: options.userId,
      },
    },
  ]);
  await expect.poll(() => listInputs.length).toBe(listRequestCount + 1);
}

test('valid sessions support navigation, exact user filtering, pagination, and manual refresh', async ({
  page,
}) => {
  await mockAdminApi(page);
  const inputs = await mockSessionListRoute(page, (input) => {
    if (input.conditions?.userId === 42) {
      return {
        type: 'success',
        data: {
          result: [firstPageSessions[0]],
          total: 1,
          pageNum: input.pageNum ?? 1,
          pageSize: input.pageSize ?? 20,
          pages: 1,
        },
      };
    }
    if (input.pageNum === 2) {
      return {
        type: 'success',
        data: {
          result: [secondPageSession],
          total: 21,
          pageNum: 2,
          pageSize: 20,
          pages: 2,
        },
      };
    }
    return {
      type: 'success',
      data: {
        result: firstPageSessions,
        total: 21,
        pageNum: 1,
        pageSize: 20,
        pages: 2,
      },
    };
  });

  await page.goto('/iam-admin/sessions');

  await expect(page.getByRole('menuitem', { name: /会话管理/ })).toBeVisible();
  await expect(page.getByText('会话管理').first()).toBeVisible();
  await expect(page.getByRole('tab', { name: '有效会话' })).toBeVisible();
  await expect(
    page.getByRole('tab', { name: '临时登录限制' }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '登录时间' }),
  ).toBeVisible();
  await expect(
    page.getByRole('columnheader', { name: '过期时间' }),
  ).toBeVisible();
  await expect(page.getByText('张三', { exact: true })).toBeVisible();
  await expect(page.getByText('zhangsan · ID 42')).toBeVisible();
  await expect(page.getByText('已删除').first()).toBeVisible();
  await expect(page.getByText('密码、手机验证码')).toBeVisible();
  await expect(page.getByText('203.0.113.42')).toBeVisible();
  await expect(page.getByText('手机 / iOS / 微信')).toBeVisible();
  await expect(page.getByText('当前会话')).toBeVisible();
  await expect(page.getByText('登录来源仅供调查参考')).toBeVisible();

  await page.locator('.ant-pagination-next').click();
  await expect(
    page.getByText(
      '无用户名 · ID 00000000-0000-4000-8000-999999999999',
    ),
  ).toBeVisible();
  await expect(page.getByText('未知').first()).toBeVisible();
  await expect.poll(() => inputs.at(-1)?.pageNum).toBe(2);

  const userSelect = page.getByRole('combobox', { name: '用户' });
  await userSelect.fill('张');
  await page.getByText('张三（zhangsan）').click();
  await page.getByRole('button', { name: /查\s*询/ }).click();
  await expect.poll(() => inputs.at(-1)?.conditions?.userId).toBe(42);
  await expect(page.getByText('张三', { exact: true })).toBeVisible();

  const requestCount = inputs.length;
  await page.getByRole('button', { name: '手动刷新' }).click();
  await expect.poll(() => inputs.length).toBeGreaterThan(requestCount);
});

test('temporary login restrictions show canonical facts, exact user filtering, and a local countdown without polling', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const restrictionExpect = expect.configure({ timeout: 10_000 });
  await mockAdminApi(page);
  await mockSessionListRoute(page, (input) => ({
    type: 'success',
    data: {
      result: [],
      total: 0,
      pageNum: input.pageNum ?? 1,
      pageSize: input.pageSize ?? 20,
      pages: 0,
    },
  }));
  const inputs = await mockLoginRestrictionListRoute(page, (input) => {
    const result =
      input.conditions?.userId === 42
        ? [firstPageLoginRestrictions[0]]
        : firstPageLoginRestrictions;
    return {
      type: 'success',
      data: {
        result,
        total: result.length,
        pageNum: input.pageNum ?? 1,
        pageSize: input.pageSize ?? 20,
        pages: 1,
      },
    };
  });

  await page.goto('/iam-admin/sessions');
  const restrictionTab = page.getByRole('tab', { name: '临时登录限制' });
  await restrictionExpect(restrictionTab).toBeVisible({ timeout: 20_000 });
  await restrictionTab.click();

  const panel = page.getByRole('tabpanel', { name: '临时登录限制' });
  await restrictionExpect(
    panel.getByRole('columnheader', { name: '限制原因' }),
  ).toBeVisible();
  await restrictionExpect(
    panel.getByRole('columnheader', { name: '最后触发方式' }),
  ).toBeVisible();
  await restrictionExpect(
    panel.getByText('登录失败次数过多').first(),
  ).toBeVisible();
  await restrictionExpect(
    panel.getByText('密码', { exact: true }),
  ).toBeVisible();
  await restrictionExpect(
    panel.getByText('未知', { exact: true }).first(),
  ).toBeVisible();
  await restrictionExpect(panel.getByText('已删除').first()).toBeVisible();

  const countdown = panel.getByText(/^剩余 \d+ 分 \d+ 秒$/).first();
  await restrictionExpect(countdown).toBeVisible();
  const initialCountdown = await countdown.textContent();
  const initialMatch = initialCountdown?.match(/剩余 (\d+) 分 (\d+) 秒/);
  const initialSeconds = Number(initialMatch?.[1]) * 60 + Number(initialMatch?.[2]);
  const requestCount = inputs.length;
  await restrictionExpect
    .poll(async () => {
      const text = await countdown.textContent();
      const match = text?.match(/剩余 (\d+) 分 (\d+) 秒/);
      return Number(match?.[1]) * 60 + Number(match?.[2]);
    })
    .toBeLessThan(initialSeconds);
  restrictionExpect(inputs).toHaveLength(requestCount);

  const userSelect = panel
    .locator('.ant-form-item')
    .filter({ hasText: '用户' })
    .getByRole('combobox');
  await userSelect.fill('张');
  await page.getByText('张三（zhangsan）').click();
  await panel.getByRole('button', { name: /查\s*询/ }).click();
  await restrictionExpect
    .poll(() => inputs.at(-1)?.conditions?.userId)
    .toBe(42);
  await restrictionExpect(panel.getByText('已删除用户')).toHaveCount(0);
});

test('restriction release confirms exact effects, succeeds once, and refreshes once', async ({
  page,
}) => {
  const { listInputs, releaseInputs } = await setupLoginRestrictionRelease(
    page,
    () => ({
      type: 'success',
      data: {
        changed: true,
        failureStateCleared: true,
      },
    }),
    { removeTargetAfterReload: true },
  );
  const dialog = await openTargetLoginRestrictionReleaseDialog(page);

  await expect(dialog).toContainText('确认解除临时登录限制？');
  await expect(dialog).toContainText('同时清除临时登录限制和当前失败历史');
  await expect(dialog).toContainText('不会创建白名单或宽限期');
  await expect(dialog).toContainText('新失败会立即重新计数');
  await expect(dialog).toContainText('不会撤销、创建、续期或恢复任何已有');
  await expect(dialog).toContainText('Principal Session');
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  expect(releaseInputs).toHaveLength(0);

  const listRequestCount = listInputs.length;
  await confirmLoginRestrictionRelease(dialog);

  await expect(
    page.getByText('临时登录限制已解除，当前失败历史已清理'),
  ).toBeVisible();
  await expectSingleLoginRestrictionReleaseAndReload(
    releaseInputs,
    listInputs,
    listRequestCount,
  );
  await expect(page.getByText('已删除用户')).toHaveCount(0);
});

test('restriction release no-op reports natural expiry and refreshes once', async ({
  page,
}) => {
  const { listInputs, releaseInputs } = await setupLoginRestrictionRelease(
    page,
    () => ({
      type: 'success',
      data: {
        changed: false,
        failureStateCleared: true,
      },
    }),
  );
  const dialog = await openTargetLoginRestrictionReleaseDialog(page);
  const listRequestCount = listInputs.length;
  await confirmLoginRestrictionRelease(dialog);

  await expect(page.getByText('限制已自然过期或已被处理')).toBeVisible();
  await expectSingleLoginRestrictionReleaseAndReload(
    releaseInputs,
    listInputs,
    listRequestCount,
  );
});

test('restriction inventory clears stale rows when login state becomes unavailable', async ({
  page,
}) => {
  await mockAdminApi(page);
  await mockSessionListRoute(page, (input) => ({
    type: 'success',
    data: {
      result: [],
      total: 0,
      pageNum: input.pageNum ?? 1,
      pageSize: input.pageSize ?? 20,
      pages: 0,
    },
  }));
  await mockLoginRestrictionListRoute(page, (input, requestNumber) =>
    requestNumber === 1
      ? {
          type: 'success',
          data: {
            result: firstPageLoginRestrictions,
            total: firstPageLoginRestrictions.length,
            pageNum: input.pageNum ?? 1,
            pageSize: input.pageSize ?? 20,
            pages: 1,
          },
        }
      : { type: 'login-state-unavailable' },
  );

  await page.goto('/iam-admin/sessions');
  const restrictionTab = page.getByRole('tab', {
    name: '临时登录限制',
  });
  await expect(restrictionTab).toBeVisible({ timeout: 20_000 });
  await restrictionTab.click();
  const panel = page.getByRole('tabpanel', { name: '临时登录限制' });
  await expect(panel.getByText('已删除用户')).toBeVisible();

  await panel.getByRole('button', { name: '手动刷新' }).click();

  await expect(panel.getByText('登录状态服务暂时不可用')).toBeVisible();
  await expect(panel.getByText('已删除用户')).toHaveCount(0);
  await expect(panel.getByText('加载失败')).toBeVisible();
  await expect(panel.getByText('暂无数据')).toHaveCount(0);
});

test('restriction release 503 keeps the current inventory without false success or retry', async ({
  page,
}) => {
  const { listInputs, releaseInputs } = await setupLoginRestrictionRelease(
    page,
    () => ({ type: 'login-state-unavailable' }),
  );
  const dialog = await openTargetLoginRestrictionReleaseDialog(page);
  const listRequestCount = listInputs.length;
  await confirmLoginRestrictionRelease(dialog);

  await expect(page.getByText('登录状态服务暂时不可用')).toBeVisible();
  await expect.poll(() => releaseInputs).toEqual([{ userId: 43 }]);
  await page.waitForTimeout(500);
  expect(releaseInputs).toHaveLength(1);
  expect(listInputs).toHaveLength(listRequestCount);
  await expect(page.getByText('已删除用户')).toBeVisible();
  await expect(
    page.getByText('临时登录限制已解除，当前失败历史已清理'),
  ).toHaveCount(0);
});

test('restriction audit-after-effect refreshes once without retrying release', async ({
  page,
}) => {
  const { listInputs, releaseInputs } = await setupLoginRestrictionRelease(
    page,
    () => ({ type: 'audit-failed-after-effect' }),
    { removeTargetAfterReload: true },
  );
  const dialog = await openTargetLoginRestrictionReleaseDialog(page);
  const listRequestCount = listInputs.length;
  await confirmLoginRestrictionRelease(dialog);

  await expect(
    page.getByText('操作可能已生效，但审计记录失败，请刷新确认且不要自动重试'),
  ).toBeVisible();
  await expectSingleLoginRestrictionReleaseAndReload(
    releaseInputs,
    listInputs,
    listRequestCount,
  );
  await expect(page.getByText('已删除用户')).toHaveCount(0);
});

test('valid sessions show the empty state', async ({ page }) => {
  await mockAdminApi(page);
  await mockSessionListRoute(page, (input) => ({
    type: 'success',
    data: {
      result: [],
      total: 0,
      pageNum: input.pageNum ?? 1,
      pageSize: input.pageSize ?? 20,
      pages: 0,
    },
  }));

  await page.goto('/iam-admin/sessions');

  await expect(page.locator('.ant-empty-description')).toHaveText('暂无数据');
});

test('valid sessions surface unavailable login state instead of presenting it as an empty result', async ({
  page,
}) => {
  await mockAdminApi(page);
  await mockSessionListRoute(page, () => ({
    type: 'login-state-unavailable',
  }));

  await page.goto('/iam-admin/sessions');

  await expect(page.getByText('登录状态服务暂时不可用')).toBeVisible();
  await expect(page.getByText('请稍后手动刷新')).toBeVisible();
  await expect(page.getByText('暂无数据')).toHaveCount(0);
});

test('refresh clears stale sessions when login state becomes unavailable', async ({
  page,
}) => {
  await mockAdminApi(page);
  await mockSessionListRoute(page, (_input, requestNumber) => {
    if (requestNumber === 1) {
      return {
        type: 'success',
        data: {
          result: firstPageSessions,
          total: 2,
          pageNum: 1,
          pageSize: 20,
          pages: 1,
        },
      };
    }
    return { type: 'login-state-unavailable' };
  });

  await page.goto('/iam-admin/sessions');
  await expect(page.getByText('张三', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: '手动刷新' }).click();

  await expect(page.getByText('登录状态服务暂时不可用')).toBeVisible();
  await expect(page.getByText('张三', { exact: true })).toHaveCount(0);
  await expect(page.getByText('加载失败')).toBeVisible();
});

test('single-session action protects the current session and confirms the third-party boundary', async ({
  page,
}) => {
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'success',
      data: {
        changed: true,
        scope: 'session',
        revoked: {
          principalSessions: 1,
          bindings: 1,
          credentials: 1,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 1,
          succeeded: 1,
          failed: 0,
        },
      },
    }),
  );

  const currentRow = page.getByRole('row').filter({ hasText: '张三' });
  await expect(
    currentRow.getByRole('button', { name: '强制下线本次' }),
  ).toBeDisabled();

  const confirm = await openTargetSessionRevokeDialog(page);
  await expect(confirm).toContainText('确认强制下线本次会话？');
  await expect(confirm).toContainText('不能保证第三方自行建立的本地会话退出');
  await expect(confirm).toContainText('强制下线不会阻止未来重新登录');
  await expect(confirm).toContainText('密码重置、账号暂停或结束');
  await expect(confirm).not.toContainText('关联应用');
  await expect(confirm.getByRole('textbox')).toHaveCount(0);
  expect(revokeInputs).toHaveLength(0);

  const listRequestCount = listInputs.length;
  await confirmSessionRevoke(confirm);

  await expect(page.getByText('会话已下线', { exact: true })).toBeVisible();
  await expectSingleTargetRevokeAndReload(
    revokeInputs,
    listInputs,
    listRequestCount,
  );
});

test('another user can be revoked from any row with point-in-time and follow-up guidance', async ({
  page,
}) => {
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'success',
      data: {
        changed: true,
        scope: 'user',
        revoked: {
          principalSessions: 2,
          bindings: 2,
          credentials: 2,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 1,
          succeeded: 1,
          failed: 0,
        },
      },
    }),
  );
  await revokeUserAndExpectReload(page, revokeInputs, listInputs, {
    rowText: '已删除用户',
    userId: 43,
    expectDialog: async (dialog) => {
      await expect(dialog).toContainText('确认下线该用户全部会话？');
      await expect(dialog).toContainText('操作开始时已索引');
      await expect(dialog).toContainText(
        '操作期间或之后建立的新会话仍可能存在',
      );
      await expect(dialog).toContainText(
        '不能保证第三方自行建立的本地会话退出',
      );
      await expect(dialog).toContainText('不会阻止未来重新登录');
      await expect(dialog).toContainText('密码重置、账号暂停或结束');
      await expect(dialog.getByRole('textbox')).toHaveCount(0);
    },
  });

  await expect(page.getByText('会话已下线', { exact: true })).toBeVisible();
});

test('self user revoke keeps the unified action label and explains the current-root exception', async ({
  page,
}) => {
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'success',
      data: {
        changed: true,
        scope: 'user',
        revoked: {
          principalSessions: 1,
          bindings: 2,
          credentials: 2,
          artifacts: 1,
        },
        currentPrincipalSessionExcluded: true,
        cleanup: {
          attempted: 1,
          succeeded: 1,
          failed: 0,
        },
      },
    }),
  );
  const currentUserRow = page.getByRole('row').filter({ hasText: '张三' });

  await expect(
    currentUserRow.getByRole('button', { name: '下线该用户全部' }),
  ).toBeEnabled();
  await currentUserRow
    .getByRole('button', { name: '下线该用户全部' })
    .click();

  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText('确认下线该用户全部会话？');
  await expect(confirm).toContainText('保留当前管理端根会话');
  await expect(confirm).toContainText('该根会话关联的 IAM 凭证');
  await expect(confirm).toContainText('本人的其他根 Principal Session');
  await expect(confirm).toContainText('开始时已索引');
  await expect(confirm).toContainText('不能保证第三方自行建立的本地会话退出');
  await expect(confirm).toContainText('不会阻止未来重新登录');
  await expect(confirm).toContainText('密码重置、账号暂停或结束');
  const listRequestCount = listInputs.length;

  await confirmSessionRevoke(confirm);

  await expect(page.getByText('会话已下线', { exact: true })).toBeVisible();
  await expect.poll(() => revokeInputs).toEqual([
    {
      target: {
        type: 'user',
        userId: 42,
      },
    },
  ]);
  await expect.poll(() => listInputs.length).toBe(listRequestCount + 1);
});

test('user revoke no-op reports an already inactive target and refreshes once', async ({
  page,
}) => {
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'success',
      data: {
        changed: false,
        scope: 'user',
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
        },
      },
    }),
  );
  await revokeUserAndExpectReload(page, revokeInputs, listInputs, {
    rowText: '已删除用户',
    userId: 43,
  });

  await expect(page.getByText('目标已失效或已被处理')).toBeVisible();
});

test('user revoke cleanup failure remains successful with only a safe failed count', async ({
  page,
}) => {
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'success',
      data: {
        changed: true,
        scope: 'user',
        revoked: {
          principalSessions: 2,
          bindings: 2,
          credentials: 2,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 3,
          succeeded: 1,
          failed: 2,
        },
      },
    }),
  );
  await revokeUserAndExpectReload(page, revokeInputs, listInputs, {
    rowText: '已删除用户',
    userId: 43,
  });

  await expect(
    page.getByText('会话已下线，部分关联清理失败（2 项）', { exact: true }),
  ).toBeVisible();
  await expect(page.getByText('cleanup-ref-secret')).toHaveCount(0);
  await expect(page.getByText('remote cleanup error')).toHaveCount(0);
});

test('single-session no-op shows an already inactive warning and refreshes the current page', async ({
  page,
}) => {
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'success',
      data: {
        changed: false,
        scope: 'session',
        revoked: {
          principalSessions: 0,
          bindings: 0,
          credentials: 0,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 0,
          succeeded: 0,
          failed: 0,
        },
      },
    }),
  );
  const confirm = await openTargetSessionRevokeDialog(page);
  const listRequestCount = listInputs.length;
  await confirmSessionRevoke(confirm);

  await expect(page.getByText('目标已失效或已被处理')).toBeVisible();
  await expectSingleTargetRevokeAndReload(
    revokeInputs,
    listInputs,
    listRequestCount,
  );
});

test('single-session cleanup failure remains successful with a safe warning', async ({
  page,
}) => {
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'success',
      data: {
        changed: true,
        scope: 'session',
        revoked: {
          principalSessions: 1,
          bindings: 1,
          credentials: 1,
          artifacts: 0,
        },
        currentPrincipalSessionExcluded: false,
        cleanup: {
          attempted: 2,
          succeeded: 1,
          failed: 1,
        },
      },
    }),
  );
  const confirm = await openTargetSessionRevokeDialog(page);
  const listRequestCount = listInputs.length;
  await confirmSessionRevoke(confirm);

  await expect(
    page.getByText('会话已下线，部分关联清理失败（1 项）', { exact: true }),
  ).toBeVisible();
  await expectSingleTargetRevokeAndReload(
    revokeInputs,
    listInputs,
    listRequestCount,
  );
  await expect(page.getByText('cleanup-ref-secret')).toHaveCount(0);
  await expect(page.getByText('remote cleanup error')).toHaveCount(0);
});

test('user audit-after-effect error refreshes once without retrying the mutation', async ({
  page,
}) => {
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'audit-failed-after-effect',
    }),
    { removeTargetAfterReload: true },
  );
  await revokeUserAndExpectReload(page, revokeInputs, listInputs, {
    rowText: '已删除用户',
    userId: 43,
  });
  await expect(
    page.getByText('操作可能已生效，但审计记录失败，请刷新确认且不要自动重试'),
  ).toBeVisible();
  await expect(page.getByText('已删除用户')).toHaveCount(0);
});

test('audit-after-effect error refreshes state without retrying the revoke mutation', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const { listInputs, revokeInputs } = await setupSessionRevoke(
    page,
    () => ({
      type: 'audit-failed-after-effect',
    }),
    { removeTargetAfterReload: true },
  );
  const confirm = await openTargetSessionRevokeDialog(page);
  const listRequestCount = listInputs.length;
  await confirmSessionRevoke(confirm);

  await expectSingleTargetRevokeAndReload(
    revokeInputs,
    listInputs,
    listRequestCount,
  );
  await expect(
    page.getByText('操作可能已生效，但审计记录失败，请刷新确认且不要自动重试'),
  ).toBeVisible();
  await expect(page.getByText('已删除用户')).toHaveCount(0);
});
