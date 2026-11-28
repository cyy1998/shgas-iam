import {
  OrganizationResponsibilityAssignmentStatus as AssignmentStatus,
  EmploymentStatus,
  UserDocumentSchema,
} from "@iam/contracts";
import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { expectRpcMutationResult, isSuccessfulRpcResponse, readCreatedResourceId } from "./admin-client-journey.ts";
import { createHeadResponsibility, oidcUserInfoHasResponsibility } from "./responsibility-journey.ts";
import { waitForEmploymentSearchVisibility } from "./user-document-search-journey.ts";

interface JourneyInput {
  adminPage: Page;
  adminUsername: string;
  internalApiKey: string;
  origin: string;
  request: APIRequestContext;
  organizationCode: string;
  positionCode: string;
  accessToken: string;
}

const adminHeaders = { Client: "iam-admin" };
const publicationTimeoutMs = 45_000;

export async function exerciseDatedEmployment(input: JourneyInput) {
  const { adminPage, adminUsername, organizationCode, positionCode } = input;
  const original = await readInternalDetail(input);
  expect(original.username).toBe(adminUsername);
  const markerName = "E2E Employment Publication";
  const nextMonth = await adminPage.evaluate(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
  });
  const futureStart = `${nextMonth}-10`;
  const futureEnd = `${nextMonth}-20`;
  const id = await createEmployment(input, futureStart, futureEnd);
  await expectEmployment(adminPage, id, {
    status: EmploymentStatus.Pending,
    startTime: futureStart,
    endTime: futureEnd,
  });

  // A fresh name proves both public snapshots were rebuilt after the Pending Employment was created.
  await changeDisplayName(adminPage, adminUsername, markerName);
  await waitForPublicEmployment(input, { visible: false, responsibility: false, name: markerName });

  await editPeriod(adminPage, id, null, futureEnd);
  await expectEmployment(adminPage, id, { status: EmploymentStatus.Enable, startTime: null, endTime: futureEnd });
  await waitForPublicEmployment(input, { visible: true, responsibility: false });

  const assignmentId = await createHeadResponsibility({
    page: adminPage,
    origin: input.origin,
    adminUsername,
    positionCode,
    targetOrganizationCode: organizationCode,
  });
  await waitForPublicEmployment(input, { visible: true, responsibility: true });

  await editPeriod(adminPage, id, futureStart, futureEnd);
  await expectEmployment(adminPage, id, {
    status: EmploymentStatus.Pending,
    startTime: futureStart,
    endTime: futureEnd,
  });
  await expectAssignment(adminPage, assignmentId, AssignmentStatus.Pause);
  await waitForPublicEmployment(input, { visible: false, responsibility: false });

  await editPeriod(adminPage, id, null, futureEnd);
  await expectEmployment(adminPage, id, { status: EmploymentStatus.Enable, startTime: null, endTime: futureEnd });
  await expectAssignment(adminPage, assignmentId, AssignmentStatus.Pause);
  await waitForPublicEmployment(input, { visible: true, responsibility: false });

  await adminPage.goto(
    `/iam-admin/organization-responsibilities/assignments?lifecycle=open&assignment=${assignmentId}`,
  );
  const resume = "admin.organizationResponsibility.resumeAssignment";
  const resumed = adminPage.waitForResponse((response) => isSuccessfulRpcResponse(response, resume));
  await adminPage.getByRole("dialog").getByRole("button", { name: "恢复任命" }).click();
  await expectRpcMutationResult(await resumed, resume, true, null);
  await waitForPublicEmployment(input, { visible: true, responsibility: true });

  await endEmployment(adminPage, id);
  await expectEmployment(adminPage, id, {
    status: EmploymentStatus.Disable,
    startTime: null,
    endTime: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/u),
  });
  await expectAssignment(adminPage, assignmentId, AssignmentStatus.Disable);
  await waitForPublicEmployment(input, { visible: false, responsibility: false });
  await changeDisplayName(adminPage, adminUsername, original.name);
  await waitForPublicEmployment(input, { visible: false, responsibility: false, name: original.name });
}

async function createEmployment(input: JourneyInput, startTime: string, endTime: string) {
  const page = input.adminPage;
  await page.goto("/iam-admin/employments");
  await page.getByRole("button", { name: "新增雇佣" }).click();
  const dialog = page.getByRole("dialog", { name: "新增雇佣" });
  const field = (label: string) => dialog.locator(".ant-form-item").filter({ hasText: label });
  const dropdown = page.locator(".ant-select-dropdown:visible");
  const pickOption = async (label: string, code: string) => {
    const item = field(label);
    const select = item.getByRole("combobox");
    const option = new RegExp(`\\(${code}\\)$`, "u");
    await select.fill(code);
    await dropdown.getByTitle(option).hover();
    await select.press("Enter");
    await expect(item.getByTitle(option)).toBeVisible();
  };
  await pickOption("用户", input.adminUsername);
  const organization = field("任职组织");
  const organizationOption = new RegExp(`\\(${input.organizationCode}\\)$`, "u");
  const organizationDropdown = page.locator(".ant-tree-select-dropdown:visible");
  await organization.getByRole("combobox").fill(input.organizationCode);
  await expect(async () => {
    await organizationDropdown.getByText(organizationOption).click({ timeout: 2_000 });
    await expect(organization.getByTitle(organizationOption)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await expect(organizationDropdown).toHaveCount(0);
  await pickOption("岗位", input.positionCode);
  await dialog.getByPlaceholder("开始日").click();
  await chooseCalendarDay(page, startTime);
  await chooseCalendarDay(page, endTime);

  const procedure = "admin.employment.create";
  const saved = page.waitForResponse((response) => response.url().includes(procedure));
  await dialog.getByRole("button", { name: /确\s*定/u }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBe(true);
  return await readCreatedResourceId(response, procedure);
}

async function openEmployment(page: Page, id: number) {
  await page.goto(`/iam-admin/employments?employmentId=${id}`);
  return page.getByRole("dialog");
}

async function editPeriod(page: Page, id: number, startTime: string | null, endTime: string) {
  const drawer = await openEmployment(page, id);
  await drawer.getByRole("button", { name: /^编\s*辑$/u }).click();
  const start = drawer.getByPlaceholder("开始日");
  const end = drawer.getByPlaceholder("截止日");
  await start.click();
  if (startTime) {
    await chooseCalendarDay(page, startTime);
    await end.click();
    await chooseCalendarDay(page, endTime);
  } else {
    await page.getByText("清空开始日", { exact: true }).click();
  }
  await expect(start).toHaveValue(startTime ?? "");
  await expect(end).toHaveValue(endTime);
  const procedure = "admin.employment.update";
  const saved = page.waitForResponse((response) => isSuccessfulRpcResponse(response, procedure));
  await drawer.getByRole("button", { name: /保\s*存/u }).click();
  await expectRpcMutationResult(await saved, procedure, true, null);
}

async function chooseCalendarDay(page: Page, date: string) {
  await page.locator(`.ant-picker-dropdown:visible .ant-picker-cell-in-view[title="${date}"]`).click();
}

async function endEmployment(page: Page, id: number) {
  const drawer = await openEmployment(page, id);
  await drawer.getByRole("button", { name: /结\s*束/u }).click();
  const confirmation = page.getByRole("dialog", { name: "确认结束该任职？" });
  const procedure = "admin.employment.end";
  const ended = page.waitForResponse((response) => isSuccessfulRpcResponse(response, procedure));
  await confirmation.getByRole("button", { name: "结束任职" }).click();
  await expectRpcMutationResult(await ended, procedure, true, null);
}

async function expectEmployment(
  page: Page,
  id: number,
  expected: { status: EmploymentStatus; startTime: string | null; endTime: unknown },
) {
  const response = await page.request.get(`/api/iam/admin/employments/${id}`, { headers: adminHeaders });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(body).toMatchObject({ data: { id, isPrimary: false, ...expected } });
}

async function expectAssignment(page: Page, id: number, status: AssignmentStatus) {
  const response = await page.request.get(`/api/iam/admin/organization-responsibilities/assignments/${id}`, {
    headers: adminHeaders,
  });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(body).toMatchObject({ data: { id, status } });
}

async function changeDisplayName(page: Page, username: string, name: string) {
  const response = await page.request.put(`/api/iam/admin/users/${encodeURIComponent(username)}`, {
    headers: adminHeaders,
    data: { name },
  });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  expect(body).toMatchObject({ data: { changed: true } });
}

async function readInternalDetail(input: JourneyInput) {
  const response = await input.request.get(
    `${input.origin}/api/iam/internal/users/${encodeURIComponent(input.adminUsername)}`,
    { headers: { apikey: input.internalApiKey } },
  );
  expect(response.status()).toBe(200);
  const { data } = await response.json();
  return UserDocumentSchema.parse(data);
}

async function waitForPublicEmployment(
  input: JourneyInput,
  expected: { visible: boolean; responsibility: boolean; name?: string },
) {
  await expect
    .poll(
      async () => {
        const profile = await readInternalDetail(input);
        const employment = profile.employments.find(({ position }) => position.code === input.positionCode);
        return {
          visible: employment !== undefined,
          responsibility:
            employment?.responsibilities.some(
              ({ type, targetOrganization }) =>
                type.code === "head" && targetOrganization.code === input.organizationCode,
            ) ?? false,
          name: profile.name,
        };
      },
      { timeout: publicationTimeoutMs },
    )
    .toMatchObject(expected);

  await waitForEmploymentSearchVisibility({ ...input, expected: expected.visible });

  await expect
    .poll(
      async () => {
        const response = await input.request.get(`${input.origin}/oidc/me`, {
          headers: { Authorization: `Bearer ${input.accessToken}` },
        });
        expect(response.status()).toBe(200);
        const claims = await response.json();
        const employments = claims["iam:employments"];
        if (!Array.isArray(employments)) throw new Error("UserInfo is missing the requested Employment claim");
        return {
          visible: employments.some((employment) => employment.position.code === input.positionCode),
          responsibility: oidcUserInfoHasResponsibility(claims, {
            positionCode: input.positionCode,
            targetOrganizationCode: input.organizationCode,
          }),
          name: claims.name,
        };
      },
      { timeout: publicationTimeoutMs },
    )
    .toMatchObject(expected);
}
