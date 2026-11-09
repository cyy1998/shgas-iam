// Start with pnpm --filter @iam/admin dev:e2e, then run
// pnpm --filter @iam/admin exec tsx scripts/capture-hr-manual.ts
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, type Locator, type Page } from "@playwright/test";
import { manualExample, mockHrManualApi } from "./hr-manual-fixture";

const origin = "http://127.0.0.1:8001";
const output = resolve("public/help/hr");
const viewport = { width: 1440, height: 1000 };
const screenshots = new Map<string, Buffer>();
type Mark = { target: Locator; label: string };

async function capture(page: Page, file: string, frame: Locator, marks: Mark[], maxHeight = viewport.height) {
  await frame.scrollIntoViewIfNeeded();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const fullFrame = maxHeight === viewport.height;
  const options = { animations: "disabled", caret: "hide" } as const;
  // Locator screenshots wait for the modal animation to settle before measuring its clip.
  const frameScreenshot = fullFrame ? await frame.screenshot(options) : undefined;
  const bounds = await frame.boundingBox();
  if (!bounds) throw new Error(`No screenshot bounds for ${file}`);

  const clip = {
    x: Math.floor(bounds.x),
    y: Math.floor(bounds.y),
    width: frameScreenshot?.readUInt32BE(16) ?? Math.floor(Math.min(bounds.width, viewport.width - bounds.x)),
    height:
      frameScreenshot?.readUInt32BE(20) ?? Math.floor(Math.min(bounds.height, viewport.height - bounds.y, maxHeight)),
  };
  const annotations = [];
  for (const { target, label } of marks) {
    const box = await target.boundingBox();
    if (!box) throw new Error(`No marker bounds for ${label}`);
    const x = Math.round(((box.x + box.width - clip.x) / clip.width) * 1000) / 10;
    const y = Math.round(((box.y - clip.y) / clip.height) * 1000) / 10;
    if (x < 0 || x > 100 || y < 0 || y > 100) throw new Error(`Marker ${label} is outside ${file}`);
    annotations.push({ x, y, label });
  }

  const screenshot = frameScreenshot ?? (await page.screenshot({ clip, ...options }));
  screenshots.set(file, screenshot);
  console.log(JSON.stringify({ file, width: clip.width, height: clip.height, marks: annotations }));
}

async function captureUserScreens(page: Page) {
  await page.goto(`${origin}/iam-admin/users`);
  const row = page.getByRole("row").filter({ hasText: manualExample.employee.name });
  const view = row.getByRole("button", { name: "查看", exact: true });
  await view.waitFor();
  await capture(
    page,
    "users-list.png",
    page.locator("main"),
    [
      { target: page.getByRole("searchbox", { name: "搜索用户" }), label: "按姓名或账号搜索" },
      { target: view, label: "打开用户详情" },
    ],
    270,
  );
  await view.click();
  const drawer = page.getByRole("dialog").filter({ hasText: manualExample.employee.name });
  const edit = drawer.getByRole("button", { name: /编\s*辑/ });
  const resetPassword = drawer.getByRole("button", { name: /重\s*置\s*密\s*码/ });
  const resign = drawer.getByRole("button", { name: /离\s*职/ });
  await edit.waitFor();
  await capture(
    page,
    "user-detail.png",
    drawer,
    [
      { target: edit, label: "编辑用户资料" },
      { target: resetPassword, label: "重置密码" },
      { target: drawer.getByRole("button", { name: /新增雇佣/ }), label: "从用户详情新增任职" },
    ],
    665,
  );
  await resign.click();
  const confirmation = page.getByRole("dialog").filter({ hasText: "办理用户 张三 离职？" });
  await capture(page, "user-resignation.png", confirmation, [
    { target: confirmation.getByRole("button", { name: /确\s*定/ }), label: "核对影响后确认离职" },
  ]);
}

async function captureOrganizationScreens(page: Page) {
  await page.goto(`${origin}/iam-admin/organizations`);
  const organization = page.getByText(`${manualExample.rootA.orgName}(${manualExample.rootA.orgCode})`, {
    exact: true,
  });
  await organization.click();
  const edit = page.getByRole("button", { name: /编\s*辑/ });
  await edit.waitFor();
  await capture(
    page,
    "organizations.png",
    page.locator("main"),
    [
      { target: organization.first(), label: "从组织树选中组织" },
      { target: page.getByRole("button", { name: "+ 下级组织" }), label: "新建下级组织" },
      { target: edit, label: "编辑当前组织" },
    ],
    510,
  );
  await edit.click();
  const form = page.getByRole("dialog", { name: "编辑组织" });
  await capture(page, "organization-edit.png", form, [
    { target: form.getByRole("textbox", { name: "组织名称" }), label: "编辑组织名称" },
    { target: form.getByRole("button", { name: /确\s*定/ }), label: "保存组织资料" },
  ]);
}

async function captureEmploymentScreens(page: Page) {
  await page.goto(`${origin}/iam-admin/employments`);
  const row = page.getByRole("row").filter({ hasText: manualExample.employee.name });
  const view = row.getByText("查看", { exact: true });
  const create = page.getByRole("button", { name: /新增雇佣/ });
  await view.waitFor();
  await capture(
    page,
    "employments.png",
    page.locator("main"),
    [
      { target: page.getByRole("combobox", { name: "雇佣状态" }), label: "按状态查看在职或历史任职" },
      { target: create, label: "新增雇佣" },
      { target: view, label: "查看任职详情" },
    ],
    325,
  );
  await create.click();
  const form = page.getByRole("dialog").filter({ hasText: "新增雇佣" });
  const user = form.getByRole("combobox", { name: "用户" });
  const organization = form.getByRole("combobox").nth(1);
  const position = form.getByRole("combobox", { name: "岗位" });
  await user.fill(manualExample.newHire.name);
  await page.getByText(`${manualExample.newHire.name} (${manualExample.newHire.username})`, { exact: true }).click();
  await organization.click();
  await page.getByText(`${manualExample.rootB.orgName} (${manualExample.rootB.orgCode})`, { exact: true }).click();
  await position.click();
  await page
    .getByText(`${manualExample.operationsPosition.posName} (${manualExample.operationsPosition.posCode})`, {
      exact: true,
    })
    .last()
    .click();
  await capture(page, "employment-create.png", form, [
    {
      target: form.locator(".ant-form-item").filter({ hasText: "任职组织" }).getByRole("combobox"),
      label: "选择任职组织",
    },
    { target: form.getByRole("switch"), label: "按实际情况选择是否设主岗" },
    { target: form.getByRole("button", { name: /确\s*定/ }), label: "提交新增任职" },
  ]);
  await form.getByRole("button", { name: /取\s*消/ }).click();
  await view.click();
  const drawer = page.getByRole("dialog").filter({ hasText: manualExample.employee.name });
  await drawer.getByRole("button", { name: /转\s*岗/ }).click();
  const transfer = page.getByRole("dialog").filter({ hasText: "转岗 — 张三 (zhangsan)" });
  await transfer.getByRole("combobox").first().click();
  await page.getByText(`${manualExample.rootB.orgName} (${manualExample.rootB.orgCode})`, { exact: true }).click();
  await transfer.getByRole("combobox").nth(1).click();
  await page
    .getByText(`${manualExample.operationsPosition.posName} (${manualExample.operationsPosition.posCode})`, {
      exact: true,
    })
    .last()
    .click();
  await transfer.getByRole("radio", { name: "主任职", exact: true }).check();
  await capture(page, "employment-transfer.png", transfer, [
    { target: transfer.getByRole("radio", { name: "主任职", exact: true }), label: "选择新任职是否为主岗" },
    { target: transfer.getByRole("button", { name: /确\s*定/ }), label: "核对原任职与新任职后提交" },
  ]);
  await transfer.getByRole("button", { name: /取\s*消/ }).click();
  await drawer.getByRole("button", { name: "设主岗", exact: true }).click();
  const confirmation = page.getByRole("dialog").filter({ hasText: "将 张三 的主岗设为 财务经理？" });
  await capture(page, "employment-primary.png", confirmation, [
    { target: confirmation.getByRole("button", { name: "设为主岗" }), label: "确认设为主岗" },
  ]);
}

async function captureResponsibilityScreens(page: Page) {
  await page.goto(`${origin}/iam-admin/organization-responsibilities/assignments`);
  const create = page.getByRole("button", { name: "新建责任任命" });
  await create.click();
  const form = page.getByRole("dialog");
  const field = (label: string) => form.locator(".ant-form-item").filter({ hasText: label }).getByRole("combobox");
  const target = field("目标组织");
  const type = field("责任类型");
  const holder = field("任职");
  await target.click();
  await page.getByText(`${manualExample.rootB.orgName} (${manualExample.rootB.orgCode})`, { exact: true }).click();
  await holder.fill(manualExample.employee.name);
  await page.getByTitle(/张三.*示例公司 A \/ 财务部.*财务经理/u).click();
  const submit = form.getByRole("button", { name: /确\s*定|提\s*交/ });
  await capture(page, "responsibility-create.png", form, [
    { target: target.locator(".."), label: "选择目标组织" },
    { target: type.locator(".."), label: "选择责任类型" },
    { target: holder.locator(".."), label: "选择持有人的任职" },
    { target: submit, label: "提交责任任命" },
  ]);
  await submit.click();
  const row = page.getByRole("row").filter({ hasText: manualExample.employee.name });
  const details = row.getByRole("button", { name: "详情" });
  await details.waitFor();
  await capture(
    page,
    "responsibility-result.png",
    page.locator("main"),
    [
      { target: create, label: "打开新建责任任命表单" },
      { target: details, label: "查看任命详情和后续操作" },
    ],
    330,
  );
}

async function main() {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({
      viewport,
      locale: "zh-CN",
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce",
      serviceWorkers: "block",
    });
    await mockHrManualApi(context, origin);
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    await captureUserScreens(page);
    await captureOrganizationScreens(page);
    await captureEmploymentScreens(page);
    await captureResponsibilityScreens(page);
  } finally {
    await browser.close();
  }
  // Write only after capturing all screens, because Umi restarts when public assets change.
  await mkdir(output, { recursive: true });
  await Promise.all([...screenshots].map(([file, screenshot]) => writeFile(resolve(output, file), screenshot)));
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
