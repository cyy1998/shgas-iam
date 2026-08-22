import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

const publicationTimeoutMs = 45_000;

export interface ResponsibilityExpectation {
  positionCode: string;
  targetOrganizationCode: string;
}

interface ResponsibilityJourneyInput extends ResponsibilityExpectation {
  adminUsername: string;
  internalApiKey: string;
  origin: string;
  request: APIRequestContext;
}

export async function createHeadResponsibility(input: {
  adminUsername: string;
  origin: string;
  page: Page;
  positionCode: string;
  targetOrganizationCode: string;
}) {
  await input.page.goto(`${input.origin}/iam-admin/organizations`);
  await input.page.getByText(`(${input.targetOrganizationCode})`, {
    exact: true,
  }).click();
  await input.page.getByRole("tab", { name: "责任任命" }).click();
  await input.page.getByRole("button", { name: "新建责任任命" }).click();
  const modal = input.page.getByRole("dialog");
  await expect(modal.getByText(`目标组织：${input.targetOrganizationCode}`))
    .toBeVisible();
  await modal.getByRole("combobox", { name: "任职" }).fill(input.adminUsername);
  await input.page.getByTitle(new RegExp(input.positionCode, "u")).click();
  await modal.getByRole("button", { name: /确\s*定/u }).click();
  await expect(input.page.getByText("责任任命已创建")).toBeVisible();
  await expect(input.page.getByRole("columnheader", { name: "任命 ID" }))
    .toHaveCount(0);
  await expect(input.page.getByRole("columnheader", { name: "任职 ID" }))
    .toHaveCount(0);
  const detailButton = input.page.getByRole("button", { name: "详情" });
  await expect(detailButton).toBeVisible();
  await expect(input.page.getByRole("button", { name: "编辑" })).toHaveCount(0);
  await detailButton.click();
  const detailDrawer = input.page.getByRole("dialog");
  await expect(detailDrawer.getByText(/^任命 #\d+$/u)).toBeVisible();
  await expect(detailDrawer.getByText("任命 ID：", { exact: false }))
    .toHaveCount(0);
  await detailDrawer.getByRole("button", { name: "关闭" }).click();
}

export async function waitForInternalResponsibility(
  input: ResponsibilityJourneyInput & { expected: boolean },
) {
  await expect.poll(
    async () => await readInternalResponsibility(input),
    { timeout: publicationTimeoutMs },
  ).toBe(input.expected);
}

export async function expectInternalResponsibilityDsl(
  input: ResponsibilityJourneyInput,
) {
  const response = await input.request.post(
    `${input.origin}/api/iam/internal/users/search-dsl`,
    {
      headers: { apikey: input.internalApiKey },
      data: {
        filter: {
          exists: {
            path: "employments",
            where: {
              exists: {
                path: "responsibilities",
                where: {
                  and: [
                    {
                      field: "type.code",
                      op: "eq",
                      value: "head",
                    },
                    {
                      field: "targetOrganization",
                      op: "withinSubtreeOf",
                      value: input.targetOrganizationCode,
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  );
  expect(response.status()).toBe(200);
  const body = readRecord(await response.json());
  const profiles = body?.data;
  expect(Array.isArray(profiles)
    && profiles.some(profile => profileHasResponsibility(
      profile,
      input,
      "posCode",
    )))
    .toBe(true);

  const legacyResponse = await input.request.post(
    `${input.origin}/api/iam/internal/users/search-dsl`,
    {
      headers: { apikey: input.internalApiKey },
      data: {
        filter: {
          nested: "employments",
          where: { all: [] },
        },
      },
    },
  );
  expect(legacyResponse.status()).toBe(422);
}

export function internalDetailHasResponsibility(
  value: unknown,
  expectation: ResponsibilityExpectation,
) {
  const body = readRecord(value);
  return profileHasResponsibility(body?.data, expectation, "posCode");
}

export function customSsoProfileHasResponsibility(
  value: unknown,
  expectation: ResponsibilityExpectation,
) {
  const body = readRecord(value);
  const data = readRecord(body?.data);
  return profileHasResponsibility(data?.profile, expectation, "code");
}

export function oidcUserInfoHasResponsibility(
  value: unknown,
  expectation: ResponsibilityExpectation,
) {
  const claims = readRecord(value);
  return employmentsHaveResponsibility(
    claims?.["iam:employments"],
    expectation,
    "posCode",
  );
}

export async function readInternalResponsibility(
  input: ResponsibilityJourneyInput,
) {
  const response = await input.request.get(
    `${input.origin}/api/iam/internal/users/${encodeURIComponent(input.adminUsername)}`,
    { headers: { apikey: input.internalApiKey } },
  );
  if (response.status() !== 200)
    return false;
  return internalDetailHasResponsibility(await response.json(), input);
}

function profileHasResponsibility(
  value: unknown,
  expectation: ResponsibilityExpectation,
  positionCodeField: "code" | "posCode",
) {
  return employmentsHaveResponsibility(
    readRecord(value)?.employments,
    expectation,
    positionCodeField,
  );
}

function employmentsHaveResponsibility(
  value: unknown,
  expectation: ResponsibilityExpectation,
  positionCodeField: "code" | "posCode",
) {
  return Array.isArray(value) && value.some((employment) => {
    const record = readRecord(employment);
    const position = readRecord(record?.position);
    return position?.[positionCodeField] === expectation.positionCode
      && responsibilitiesMatch(record?.responsibilities, expectation);
  });
}

function responsibilitiesMatch(
  value: unknown,
  expectation: ResponsibilityExpectation,
) {
  return Array.isArray(value) && value.some((responsibility) => {
    const record = readRecord(responsibility);
    return readRecord(record?.type)?.code === "head"
      && readRecord(record?.targetOrganization)?.code
      === expectation.targetOrganizationCode;
  });
}

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}
