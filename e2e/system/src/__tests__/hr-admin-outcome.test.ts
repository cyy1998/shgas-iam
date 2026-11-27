import { expect, test } from "bun:test";
import type { HrAdminOutcomeScenario } from "../hr-admin-outcome.ts";
import { assertHrAdminDenialLog } from "../hr-admin-outcome.ts";

const scenario = {
  runId: "outcome-01",
  adminUsername: "e2e-admin-outcome-01",
  hrAdminUsername: "e2e-hr-admin-outcome-01",
  hrAdminRoleCode: "iam:hr-admin",
  responsibilityHolderPositionCode: "e2e-resp-pos-outcome-01",
  outsideResponsibilityHolderPositionCode: "e2e-outside-resp-pos-outcome-01",
  responsibilityTargetOrganizationCode: "e2e-resp-target-outcome-01",
  hrSecondScopeRootOrganizationCode: "e2e-hr-root-outcome-01",
  hrResponsibilityTargetOrganizationCode: "e2e-hr-target-outcome-01",
} satisfies HrAdminOutcomeScenario;

test("rejects scope keys and hidden fixture values in every HR denial log", () => {
  const references = {
    adminMixedRoleAssignmentId: 40,
    hiddenResponsibilityAssignmentId: 41,
    hrSecondScopeRoleAssignmentId: 42,
    outsideResponsibilityHolderEmploymentId: 43,
    responsibilityHolderEmploymentId: 44,
  };
  const safeDenial = {
    event: "admin.authorization.denied",
    actor: { username: scenario.hrAdminUsername },
    action: "admin.organizationResponsibility.createAssignment",
    resourceType: "organizationResponsibilityAssignment",
    resourceIdentifier: "create-request",
    reasonCode: "RESOURCE_OUT_OF_SCOPE",
  };

  expect(() => assertHrAdminDenialLog(JSON.stringify(safeDenial), scenario, references)).not.toThrow();
  expect(() =>
    assertHrAdminDenialLog(
      [JSON.stringify(safeDenial), JSON.stringify({ ...safeDenial, scope: [1] })].join("\n"),
      scenario,
      references,
    ),
  ).toThrow("leaked authorization scope");
  expect(() =>
    assertHrAdminDenialLog(
      [
        JSON.stringify(safeDenial),
        JSON.stringify({
          ...safeDenial,
          detail: scenario.outsideResponsibilityHolderPositionCode,
        }),
      ].join("\n"),
      scenario,
      references,
    ),
  ).toThrow("leaked concealed fixture value");
  expect(() =>
    assertHrAdminDenialLog(
      [
        JSON.stringify(safeDenial),
        JSON.stringify({
          ...safeDenial,
          resourceIdentifier: references.hiddenResponsibilityAssignmentId,
        }),
      ].join("\n"),
      scenario,
      references,
    ),
  ).toThrow("leaked concealed fixture value");
});
