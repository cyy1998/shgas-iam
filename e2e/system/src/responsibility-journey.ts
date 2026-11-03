import { UserDocumentSchema } from "@iam/contracts";
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
  await input.page
    .getByText(`(${input.targetOrganizationCode})`, {
      exact: true,
    })
    .click();
  await input.page.getByRole("tab", { name: "责任任命" }).click();
  await input.page.getByRole("button", { name: "新建责任任命" }).click();
  const modal = input.page.getByRole("dialog");
  await expect(modal.getByText(`目标组织：${input.targetOrganizationCode}`)).toBeVisible();
  await modal.getByRole("combobox", { name: "任职" }).fill(input.adminUsername);
  await input.page.getByTitle(new RegExp(input.positionCode, "u")).click();
  await modal.getByRole("button", { name: /确\s*定/u }).click();
  await expect(input.page.getByText("责任任命已创建")).toBeVisible();
  const detailButton = input.page.getByRole("button", { name: "详情" });
  await expect(detailButton).toBeVisible();
  await expect(input.page.getByRole("button", { name: "编辑" })).toHaveCount(0);
  await detailButton.click();
  const detailDrawer = input.page.getByRole("dialog");
  await expect(detailDrawer.getByText(/^任命 #\d+$/u)).toBeVisible();
  await detailDrawer.getByRole("button", { name: "关闭" }).click();
}

export async function waitForInternalResponsibility(input: ResponsibilityJourneyInput & { expected: boolean }) {
  await expect
    .poll(async () => await readInternalResponsibility(input), { timeout: publicationTimeoutMs })
    .toBe(input.expected);
}

export async function expectInternalResponsibilityDsl(input: ResponsibilityJourneyInput) {
  const response = await input.request.post(`${input.origin}/api/iam/internal/users/search-dsl`, {
    headers: { apikey: input.internalApiKey },
    data: {
      select: Object.keys(UserDocumentSchema.shape),
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
                    exists: {
                      path: "targetOrganization.path",
                      where: { field: "code", op: "eq", value: input.targetOrganizationCode },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    },
  });
  expect(response.status()).toBe(200);
  const body = readRecord(await response.json());
  const profiles = readRecord(body?.data)?.items;
  if (!Array.isArray(profiles)) throw new Error("Internal user search requires a document array");
  const documents = profiles.map((profile) => UserDocumentSchema.parse(profile));
  expect(documents.some((document) => document.username === input.adminUsername)).toBe(true);

  const legacyResponse = await input.request.post(`${input.origin}/api/iam/internal/users/search-dsl`, {
    headers: { apikey: input.internalApiKey },
    data: {
      filter: {
        nested: "employments",
        where: { all: [] },
      },
    },
  });
  expect(legacyResponse.status()).toBe(422);
}

export function internalDetailHasResponsibility(value: unknown, expectation: ResponsibilityExpectation) {
  const body = readRecord(value);
  return profileHasResponsibility(body?.data, expectation);
}

export function customSsoProfileHasResponsibility(value: unknown, expectation: ResponsibilityExpectation) {
  const body = readRecord(value);
  const data = readRecord(body?.data);
  return profileHasResponsibility(data?.profile, expectation);
}

export function oidcUserInfoHasResponsibility(value: unknown, expectation: ResponsibilityExpectation) {
  const claims = readRecord(value);
  return employmentsHaveResponsibility(claims?.["iam:employments"], expectation);
}

export async function readInternalResponsibility(input: ResponsibilityJourneyInput) {
  const response = await input.request.get(
    `${input.origin}/api/iam/internal/users/${encodeURIComponent(input.adminUsername)}`,
    { headers: { apikey: input.internalApiKey } },
  );
  const status = response.status();
  const body: unknown = status === 200 ? await response.json() : undefined;
  return parseInternalResponsibilityResponse(status, body, input);
}

export function parseInternalResponsibilityResponse(
  status: number,
  body: unknown,
  input: ResponsibilityExpectation & { adminUsername: string },
) {
  expect(status).toBe(200);
  const profile = UserDocumentSchema.parse(readRecord(body)?.data);
  expect(profile.username).toBe(input.adminUsername);
  return internalDetailHasResponsibility(body, input);
}

function profileHasResponsibility(value: unknown, expectation: ResponsibilityExpectation) {
  return employmentsHaveResponsibility(readRecord(value)?.employments, expectation);
}

function employmentsHaveResponsibility(value: unknown, expectation: ResponsibilityExpectation) {
  if (!Array.isArray(value)) throw new Error("Responsibility disclosure requires an employments array");
  const employments = value.map((employment) => {
    const record = readRecord(employment);
    const position = readRecord(record?.position);
    if (typeof position?.code !== "string") throw new Error("Responsibility disclosure requires a position code");
    const matches = responsibilitiesMatch(record?.responsibilities, expectation);
    return { positionCode: position.code, matches };
  });
  return employments.some((employment) => employment.positionCode === expectation.positionCode && employment.matches);
}

function responsibilitiesMatch(value: unknown, expectation: ResponsibilityExpectation) {
  if (!Array.isArray(value)) throw new Error("Responsibility disclosure requires a responsibilities array");
  const responsibilities = value.map((responsibility) => {
    const record = readRecord(responsibility);
    const typeCode = readRecord(record?.type)?.code;
    const targetCode = readRecord(record?.targetOrganization)?.code;
    if (typeof typeCode !== "string" || typeof targetCode !== "string")
      throw new Error("Responsibility disclosure requires type and target codes");
    return { typeCode, targetCode };
  });
  return responsibilities.some(
    (responsibility) =>
      responsibility.typeCode === "head" && responsibility.targetCode === expectation.targetOrganizationCode,
  );
}

function readRecord(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
