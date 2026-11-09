// Start with pnpm --filter @iam/admin dev:e2e, then run
// pnpm --filter @iam/admin exec tsx scripts/capture-hr-manual.ts
// Pass --group=responsibilities to regenerate just the two responsibility workflows.
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG, OrganizationResponsibilityTypeCode } from "@iam/contracts";
import { chromium, type Locator, type Page } from "@playwright/test";
import { examplePassword, manualExample, mockHrManualApi } from "./hr-manual-fixture";

function getOrigin(option: string | undefined) {
  const value = new URL(option ?? "http://127.0.0.1:8001");
  if (
    value.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(value.hostname) ||
    value.username ||
    value.password ||
    value.pathname !== "/" ||
    value.search ||
    value.hash
  ) {
    throw new Error("The capture server must be a local HTTP origin.");
  }
  return value.origin;
}

const args = process.argv.slice(2);
const groupFlag = "--group=responsibilities";
const originArg = args.find((arg) => arg.startsWith("--origin="));
if (new Set(args).size !== args.length || args.some((arg) => arg !== groupFlag && arg !== originArg)) {
  throw new Error("Usage: capture-hr-manual.ts [--origin=http://localhost:8000] [--group=responsibilities]");
}
const origin = getOrigin(originArg?.slice("--origin=".length));
const responsibilitiesOnly = args.includes(groupFlag);
const output = resolve("public/help/hr");
const reportDir = resolve("../../test-results");
const viewport = { width: 1440, height: 1000 };
const screenshots = new Map<string, Buffer>();
const report: { file: string; width: number; height: number; marks: { x: number; y: number; label: string }[] }[] = [];
type Mark = { target: Locator; label: string };

async function capture(
  page: Page,
  file: string,
  frame: Locator,
  marks: Mark[],
  maxHeight = viewport.height,
  mask: Locator[] = [],
) {
  await frame.scrollIntoViewIfNeeded();
  // Keep transient notices from covering the status tag or confirmation text.
  await page.locator(".ant-message-notice").first().waitFor({ state: "hidden" });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const fullFrame = maxHeight === viewport.height;
  const options = { animations: "disabled", caret: "hide", mask, maskColor: "#596879" } as const;
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
  const entry = { file, width: clip.width, height: clip.height, marks: annotations };
  report.push(entry);
  console.log(JSON.stringify(entry));
}

const content = (page: Page) => page.locator("main .ant-pro-page-container-children-container");
const cancel = (dialog: Locator) => dialog.getByRole("button", { name: /^取\s*消$/ });
const confirm = (dialog: Locator) => dialog.getByRole("button", { name: /确\s*定/ });

async function captureConfirmation(page: Page, file: string, title: string, button: string | RegExp, label: string) {
  const dialog = page.getByRole("dialog").filter({ hasText: title });
  const action = dialog.getByRole("button", { name: button });
  await capture(page, file, dialog, [{ target: action, label }]);
  return { dialog, action };
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
  const status = drawer.getByRole("button", { name: /状\s*态/ });
  const resetPassword = drawer.getByRole("button", { name: /重\s*置\s*密\s*码/ });
  const resign = drawer.getByRole("button", { name: /离\s*职/ });
  const history = drawer.getByRole("checkbox", { name: "显示已结束任职" });
  await edit.waitFor();
  await capture(
    page,
    "user-detail.png",
    drawer,
    [
      { target: edit, label: "编辑用户资料" },
      { target: resetPassword, label: "重置密码" },
      { target: drawer.getByRole("button", { name: /新增雇佣/ }), label: "从用户详情新增任职" },
      { target: resign, label: "在危险操作区办理离职" },
      { target: status, label: "变更账号状态" },
      { target: history, label: "显示已结束任职" },
    ],
    665,
  );
  await edit.click();
  const basic = drawer.getByRole("region", { name: "基本信息" });
  await capture(page, "user-edit.png", basic, [
    { target: basic.getByRole("textbox", { name: "姓名" }), label: "编辑姓名及其他基本资料" },
    { target: basic.getByRole("button", { name: /保\s*存/ }), label: "保存资料" },
  ]);
  await cancel(basic).click();

  await resetPassword.click();
  const password = await captureConfirmation(
    page,
    "password-reset-confirm.png",
    "重置 张三 的密码？",
    /重\s*置/,
    "确认后生成新密码",
  );
  await password.action.click();
  const passwordResult = page.getByRole("dialog").filter({ hasText: "新密码已生成" });
  const masked = passwordResult.getByText(examplePassword, { exact: true });
  await masked.waitFor();
  await capture(
    page,
    "password-reset-result.png",
    passwordResult,
    [
      { target: passwordResult.getByRole("button", { name: "复制密码" }), label: "复制新密码并妥善转交" },
      { target: passwordResult.getByRole("button", { name: "我已复制" }), label: "复制后关闭弹窗" },
    ],
    viewport.height,
    [masked],
  );
  await passwordResult.getByRole("button", { name: "我已复制" }).click();

  await status.click();
  const pauseUser = page.getByRole("menuitem", { name: "切为「暂停」" });
  await pauseUser.waitFor();
  await capture(
    page,
    "user-status.png",
    drawer,
    [
      { target: status, label: "打开账号状态菜单" },
      { target: pauseUser, label: "按需要选择目标状态" },
    ],
    235,
  );
  await page.keyboard.press("Escape");

  await history.check();
  const past = drawer.getByRole("row").filter({ hasText: "运营专员" });
  await past.waitFor();
  const employmentInfo = drawer.getByRole("region", { name: "雇佣信息" });
  await capture(page, "user-employment-history.png", employmentInfo, [
    { target: history, label: "勾选后显示已结束任职" },
    { target: past.getByText("结束 2025/12/31"), label: "查看历史任职的结束时间" },
  ]);

  await resign.click();
  const resignation = await captureConfirmation(
    page,
    "user-resignation.png",
    "办理用户 张三 离职？",
    /确\s*定/,
    "核对影响后确认离职",
  );
  await resignation.action.click();
  await resignation.dialog.waitFor({ state: "hidden" });
  const stopped = drawer.getByText("停用", { exact: true });
  await stopped.waitFor();
  const ended = drawer.getByRole("row").filter({ hasText: "财务经理" });
  await ended.waitFor();
  await capture(
    page,
    "user-resignation-result.png",
    drawer,
    [
      { target: stopped, label: "账号已停用" },
      { target: ended.getByText("结束 2026/1/8"), label: "原任职已经结束" },
    ],
    780,
  );
}

async function captureOrganizationScreens(page: Page) {
  await page.goto(`${origin}/iam-admin/organizations`);
  const organization = page.getByText(`${manualExample.rootA.orgName}(${manualExample.rootA.orgCode})`, {
    exact: true,
  });
  await organization.click();
  const edit = page.getByRole("button", { name: /编\s*辑/ });
  const create = page.getByRole("button", { name: "+ 下级组织" });
  const status = page.getByRole("button", { name: /状\s*态/ });
  const remove = page.getByRole("button", { name: /删\s*除/ });
  await edit.waitFor();
  await capture(
    page,
    "organizations.png",
    page.locator("main"),
    [
      { target: organization.first(), label: "从组织树选中组织" },
      { target: create, label: "新建下级组织" },
      { target: edit, label: "编辑当前组织" },
      { target: status, label: "当前组织不允许变更状态" },
      { target: remove, label: "当前组织不允许删除" },
      { target: page.getByRole("tab", { name: "责任任命" }), label: "查看本组织的责任任命" },
      { target: page.getByText("DEMO-A（示例公司 A）", { exact: true }), label: "核对组织完整路径" },
    ],
    510,
  );
  await edit.click();
  const form = page.getByRole("dialog", { name: "编辑组织" });
  await capture(page, "organization-edit.png", form, [
    { target: form.getByRole("textbox", { name: "组织名称" }), label: "编辑组织名称" },
    { target: form.getByRole("button", { name: /确\s*定/ }), label: "保存组织资料" },
  ]);
  await cancel(form).click();
  await status.locator("..").hover();
  const tooltip = page.getByRole("tooltip").filter({ hasText: "当前数据完整性约束阻止此操作" });
  await tooltip.waitFor();
  await capture(
    page,
    "organization-blocked.png",
    page.locator("body"),
    [
      { target: status, label: "灰色按钮表示当前操作不可执行" },
      { target: tooltip, label: "悬停查看受限原因" },
    ],
    280,
  );

  await create.click();
  const createForm = page.getByRole("dialog", { name: "新建下级组织" });
  const code = createForm.getByRole("textbox", { name: "组织编码" });
  const name = createForm.getByRole("textbox", { name: "组织名称" });
  await code.fill("DEMO-SUPPORT");
  await name.fill("支持组");
  await capture(page, "organization-create.png", createForm, [
    { target: code, label: "填写组织编码和名称" },
    {
      target: createForm.locator(".ant-form-item").filter({ hasText: "上级组织" }).locator("input"),
      label: "核对上级组织",
    },
    { target: confirm(createForm), label: "提交新建下级组织" },
  ]);
  await cancel(createForm).click();

  await page.getByRole("button", { name: manualExample.emptyOrg.orgCode, exact: true }).click();
  await page.getByRole("heading", { name: /项目组/ }).waitFor();
  await status.click();
  const pause = page.getByRole("menuitem", { name: "切为「暂停」" });
  await pause.waitFor();
  await capture(
    page,
    "organization-status.png",
    content(page),
    [
      { target: status, label: "打开当前组织的状态菜单" },
      { target: pause, label: "选择目标状态" },
    ],
    240,
  );
  await pause.click();
  const state = await captureConfirmation(
    page,
    "organization-status-confirm.png",
    "确认变更组织状态？",
    "确认变更",
    "核对限制后确认变更",
  );
  await cancel(state.dialog).click();
  await remove.click();
  await captureConfirmation(page, "organization-delete.png", "删除组织 项目组？", /确\s*定/, "核对组织后确认删除");
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
    { target: user.locator(".."), label: "搜索并选择已有账号" },
    { target: position.locator(".."), label: "选择岗位" },
  ]);
  await confirm(form).click();
  const newRow = page.getByRole("row").filter({ hasText: manualExample.newHire.name });
  await newRow.waitFor();
  await capture(
    page,
    "employment-create-result.png",
    content(page),
    [
      { target: newRow.getByRole("cell").first(), label: "确认新增任职对应正确用户" },
      { target: newRow.getByText("查看", { exact: true }), label: "打开新任职详情核对" },
    ],
    270,
  );

  await view.click();
  const drawer = page.getByRole("dialog").filter({ hasText: manualExample.employee.name });
  const transferAction = drawer.getByRole("button", { name: /转\s*岗/ });
  const note = drawer.getByRole("button", { name: "编辑备注" });
  const setPrimary = drawer.getByRole("button", { name: "设主岗", exact: true });
  const pause = drawer.getByRole("button", { name: /暂\s*停/, exact: false });
  const resume = drawer.getByRole("button", { name: /恢\s*复/ });
  const end = drawer.getByRole("button", { name: /结\s*束/ });
  await transferAction.waitFor();
  await capture(
    page,
    "employment-detail.png",
    drawer,
    [
      { target: transferAction, label: "从原任职发起转岗" },
      { target: note, label: "在基本信息中编辑备注" },
      { target: pause, label: "暂停正常任职" },
      { target: end, label: "结束当前任职" },
      { target: setPrimary, label: "将该任职设为主岗" },
    ],
    540,
  );
  await note.click();
  const basic = drawer.getByRole("region", { name: "基本信息" });
  const noteField = basic.getByRole("textbox", { name: "备注" });
  await noteField.fill("负责示例公司月度报表复核");
  await capture(page, "employment-note.png", basic, [
    { target: noteField, label: "填写任职备注" },
    { target: basic.getByRole("button", { name: /保\s*存/ }), label: "保存备注" },
  ]);
  await cancel(basic).click();

  await setPrimary.click();
  const primary = await captureConfirmation(
    page,
    "employment-primary.png",
    "将 张三 的主岗设为 财务经理？",
    "设为主岗",
    "确认设为主岗",
  );
  await primary.action.click();
  await drawer.getByRole("button", { name: "取消主岗", exact: true }).click();
  const clearPrimary = await captureConfirmation(
    page,
    "employment-primary-clear.png",
    "取消 张三 的主任职？",
    "取消主岗",
    "确认取消主岗",
  );
  await cancel(clearPrimary.dialog).click();

  await pause.click();
  const pauseConfirm = await captureConfirmation(
    page,
    "employment-pause.png",
    "确认暂停该任职？",
    "暂停任职",
    "确认暂停任职及相关责任",
  );
  await pauseConfirm.action.click();
  await resume.waitFor();
  await capture(
    page,
    "employment-resume.png",
    drawer,
    [
      { target: drawer.getByText("暂停", { exact: true }), label: "核对当前任职为暂停状态" },
      { target: resume, label: "恢复暂停中的任职" },
    ],
    505,
  );
  await resume.click();
  await pause.waitFor();

  await end.click();
  const endConfirm = await captureConfirmation(
    page,
    "employment-end.png",
    "确认结束该任职？",
    "结束任职",
    "核对影响后确认结束",
  );
  await cancel(endConfirm.dialog).click();

  await transferAction.click();
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
  await confirm(transfer).click();
  const newEmployment = page.getByRole("row").filter({ hasText: /张三.*运营专员/ });
  const newView = newEmployment.getByText("查看", { exact: true });
  await newView.waitFor();
  await drawer.getByRole("button", { name: "关闭" }).click();
  await newView.click();
  await drawer.getByText("示例公司 B", { exact: true }).first().waitFor();
  await capture(
    page,
    "employment-transfer-result.png",
    drawer,
    [
      { target: drawer.getByText("主岗", { exact: true }).first(), label: "确认新任职已设为主岗" },
      { target: drawer.getByText("运营专员 (OPS-001)", { exact: true }), label: "核对新组织与岗位" },
    ],
    505,
  );
  await drawer.getByRole("button", { name: "关闭" }).click();
  const status = page.getByRole("combobox", { name: "雇佣状态" });
  await status.click();
  await page.getByText("结束", { exact: true }).last().click();
  const oldEmployment = page.getByRole("row").filter({ hasText: /张三.*财务经理/ });
  await oldEmployment.getByText("结束", { exact: true }).waitFor();
  await capture(
    page,
    "employment-history.png",
    content(page),
    [
      { target: status, label: "将雇佣状态切换为结束" },
      { target: oldEmployment.getByText(/2026\/1\/8/), label: "核对原任职的结束时间" },
      { target: oldEmployment.getByText("查看", { exact: true }), label: "打开已结束的原任职" },
    ],
    270,
  );
}

async function captureResponsibilityScreens(page: Page, typeCode: OrganizationResponsibilityTypeCode) {
  const entry = ORGANIZATION_RESPONSIBILITY_TYPE_CATALOG.find((type) => type.code === typeCode);
  if (!entry) throw new Error(`No catalog entry for ${typeCode}`);
  const filePrefix = typeCode === OrganizationResponsibilityTypeCode.Head ? "responsibility" : "supervisor";
  const file = (step: string) => `${filePrefix}-${step}.png`;
  await page.goto(`${origin}/iam-admin/organization-responsibilities/assignments`);
  const create = page.getByRole("button", { name: "新建责任任命" });
  await create.click();
  const form = page.getByRole("dialog");
  const field = (label: string) => form.locator(".ant-form-item").filter({ hasText: label }).getByRole("combobox");
  const target = field("目标组织");
  const type = field("责任类型");
  const holder = field("任职");
  await target.click();
  await target.fill(manualExample.finance.orgName);
  await page.getByText(`${manualExample.finance.orgName} (${manualExample.finance.orgCode})`, { exact: true }).click();
  if (typeCode === OrganizationResponsibilityTypeCode.Supervising) {
    await type.click();
    await page.getByTitle(entry.name, { exact: true }).click();
  }
  await holder.fill(manualExample.employee.name);
  await page.getByTitle(/张三.*示例公司 A \/ 财务部.*财务经理/u).click();
  const submit = form.getByRole("button", { name: /确\s*定|提\s*交/ });
  await capture(page, file("create"), form, [
    { target: target.locator(".."), label: "选择目标组织" },
    { target: type.locator(".."), label: "选择责任类型" },
    { target: holder.locator(".."), label: "选择持有人的任职" },
    { target: submit, label: "提交责任任命" },
  ]);
  await submit.click();
  await form.waitFor({ state: "hidden" });
  const row = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: `${entry.name}（${typeCode}）`, exact: true }),
  });
  const details = row.getByRole("button", { name: "详情" });
  await details.waitFor();
  await capture(
    page,
    file("result"),
    content(page),
    [
      { target: create, label: "打开新建责任任命表单" },
      { target: details, label: "查看任命详情和后续操作" },
    ],
    330,
  );
  await details.click();
  const detail = page.getByRole("dialog");
  const pause = detail.getByRole("button", { name: "暂停任命" });
  const resume = detail.getByRole("button", { name: "恢复任命" });
  const end = detail.getByRole("button", { name: "结束任命" });
  await pause.waitFor();
  await capture(
    page,
    file("detail"),
    detail,
    [
      {
        target: detail.getByRole("region", { name: "任命信息" }).getByText(entry.name, { exact: true }),
        label: "核对责任类型与目标组织",
      },
      { target: pause, label: "暂停当前启用的责任任命" },
      { target: end, label: "结束当前任命" },
    ],
    665,
  );
  await pause.click();
  await resume.waitFor();
  await capture(
    page,
    file("resume"),
    detail,
    [
      { target: detail.getByText("暂停", { exact: true }).first(), label: "暂停的任命仍保留记录" },
      { target: resume, label: "恢复暂停中的责任任命" },
    ],
    665,
  );
  await resume.click();
  await pause.waitFor();
  await end.click();
  const endDialog = page.getByRole("dialog", { name: "结束责任任命？" });
  const endAction = endDialog.getByRole("button", { name: "确认结束" });
  await endAction.waitFor();
  await capture(page, file("end"), page.locator("body"), [{ target: endAction, label: "核对影响后确认结束" }], 350);
  await endAction.click();
  await pause.waitFor({ state: "hidden" });
  await detail.getByRole("button", { name: "关闭" }).click();
  const lifecycle = page.getByRole("combobox", { name: "生命周期" });
  await lifecycle.click();
  await page.getByTitle("已结束", { exact: true }).click();
  await details.waitFor();
  await capture(
    page,
    file("history"),
    content(page),
    [
      { target: lifecycle, label: "将生命周期筛选为已结束" },
      { target: details, label: "查看已结束任命的详情" },
    ],
    270,
  );
}

async function captureCatalogScreens(page: Page) {
  await page.goto(`${origin}/iam-admin/positions`);
  const position = page.getByRole("cell", { name: manualExample.financePosition.posName, exact: true });
  await position.waitFor();
  await capture(
    page,
    "positions.png",
    content(page),
    [
      { target: position, label: "在职位目录核对岗位名称和编码" },
      { target: page.getByRole("columnheader", { name: "状态", exact: true }), label: "核对岗位状态" },
    ],
    310,
  );

  await page.goto(`${origin}/iam-admin/organization-responsibilities/types`);
  const type = page.getByRole("cell", { name: "负责人", exact: true });
  await type.waitFor();
  await capture(
    page,
    "responsibility-types.png",
    content(page),
    [
      { target: type, label: "查看责任类型名称" },
      { target: page.getByRole("columnheader", { name: "任命基数" }), label: "核对任命数量限制" },
    ],
    335,
  );
}

async function main() {
  const browser = await chromium.launch();
  const failures: unknown[] = [];
  try {
    const responsibilityGroups = [
      (page: Page) => captureResponsibilityScreens(page, OrganizationResponsibilityTypeCode.Head),
      (page: Page) => captureResponsibilityScreens(page, OrganizationResponsibilityTypeCode.Supervising),
    ];
    const captureGroups = responsibilitiesOnly
      ? responsibilityGroups
      : [
          captureUserScreens,
          captureOrganizationScreens,
          captureEmploymentScreens,
          ...responsibilityGroups,
          captureCatalogScreens,
        ];
    for (const captureGroup of captureGroups) {
      const context = await browser.newContext({
        viewport,
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
        reducedMotion: "reduce",
        serviceWorkers: "block",
      });
      try {
        await mockHrManualApi(context, origin);
        const page = await context.newPage();
        page.setDefaultTimeout(12_000);
        await captureGroup(page);
      } catch (error) {
        failures.push(error);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (failures.length) throw new AggregateError(failures, "Could not capture every HR manual screen");
  // Write only after capturing all screens, because Umi restarts when public assets change.
  await mkdir(output, { recursive: true });
  await Promise.all([...screenshots].map(([file, screenshot]) => writeFile(resolve(output, file), screenshot)));
  await mkdir(reportDir, { recursive: true });
  const reportFile = responsibilitiesOnly ? "hr-scenario-captures.json" : "hr-manual-extra-captures.json";
  await writeFile(resolve(reportDir, reportFile), `${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
