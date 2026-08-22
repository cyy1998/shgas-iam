import { describe, expect, test } from "bun:test";
import {
  customSsoProfileHasResponsibility,
  internalDetailHasResponsibility,
  oidcUserInfoHasResponsibility,
} from "./responsibility-journey.ts";

const expectation = {
  positionCode: "responsibility-position",
  targetOrganizationCode: "target-organization",
};

describe("responsibility journey payload assertions", () => {
  test("accepts a Custom SSO responsibility only on the expected profile Employment", () => {
    expect(customSsoProfileHasResponsibility({
      data: {
        profile: {
          employments: [responsibilityEmployment()],
        },
      },
    }, expectation)).toBe(true);
    expect(customSsoProfileHasResponsibility({
      data: {
        profile: { employments: [responsibilityEmployment("other-position")] },
        leaked: responsibility(),
      },
    }, expectation)).toBe(false);
  });

  test("accepts an OIDC responsibility only in the iam:employments claim", () => {
    expect(oidcUserInfoHasResponsibility({
      "iam:employments": [{
        ...responsibilityEmployment(),
        position: { posCode: expectation.positionCode },
      }],
    }, expectation)).toBe(true);
    expect(oidcUserInfoHasResponsibility({
      "iam:employments": [],
      "leaked": responsibility(),
    }, expectation)).toBe(false);
  });

  test("uses the Internal Profile Employment position contract", () => {
    expect(internalDetailHasResponsibility({
      data: {
        employments: [{
          ...responsibilityEmployment(),
          position: { posCode: expectation.positionCode },
        }],
      },
    }, expectation)).toBe(true);
  });
});

function responsibilityEmployment(positionCode = expectation.positionCode) {
  return {
    position: { code: positionCode },
    responsibilities: [responsibility()],
  };
}

function responsibility() {
  return {
    type: { code: "head" },
    targetOrganization: { code: expectation.targetOrganizationCode },
  };
}
