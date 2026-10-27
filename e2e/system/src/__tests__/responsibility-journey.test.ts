import { describe, expect, test } from "bun:test";
import {
  customSsoProfileHasResponsibility,
  internalDetailHasResponsibility,
  oidcUserInfoHasResponsibility,
  parseInternalResponsibilityResponse,
} from "../responsibility-journey.ts";

const expectation = {
  positionCode: "responsibility-position",
  targetOrganizationCode: "target-organization",
};

describe("responsibility journey payload assertions", () => {
  test("rejects failed HTTP and malformed successful Internal detail", () => {
    const input = { ...expectation, adminUsername: "admin" };
    expect(() => parseInternalResponsibilityResponse(503, undefined, input)).toThrow();
    expect(() => parseInternalResponsibilityResponse(200, { data: {} }, input)).toThrow();
    expect(() =>
      parseInternalResponsibilityResponse(200, { data: { username: "admin", employments: [] } }, input),
    ).toThrow();
  });
  test("rejects missing or malformed disclosure instead of proving absence", () => {
    for (const employments of [undefined, null, {}, [null], [{ position: { code: "p" } }]]) {
      expect(() => oidcUserInfoHasResponsibility({ "iam:employments": employments }, expectation)).toThrow();
    }
    expect(oidcUserInfoHasResponsibility({ "iam:employments": [] }, expectation)).toBe(false);
    expect(
      oidcUserInfoHasResponsibility(
        { "iam:employments": [{ position: { code: "p" }, responsibilities: [] }] },
        expectation,
      ),
    ).toBe(false);
  });

  test("validates every item even after a matching responsibility", () => {
    expect(() =>
      oidcUserInfoHasResponsibility(
        {
          "iam:employments": [responsibilityEmployment(), null],
        },
        expectation,
      ),
    ).toThrow();
    expect(() =>
      customSsoProfileHasResponsibility(
        {
          data: {
            profile: {
              employments: [{ ...responsibilityEmployment(), responsibilities: [responsibility(), null] }],
            },
          },
        },
        expectation,
      ),
    ).toThrow();
  });

  test("accepts a Custom SSO responsibility only on the expected profile Employment", () => {
    expect(
      customSsoProfileHasResponsibility(
        {
          data: {
            profile: {
              employments: [responsibilityEmployment()],
            },
          },
        },
        expectation,
      ),
    ).toBe(true);
    expect(
      customSsoProfileHasResponsibility(
        {
          data: {
            profile: { employments: [responsibilityEmployment("other-position")] },
            leaked: responsibility(),
          },
        },
        expectation,
      ),
    ).toBe(false);
  });

  test("accepts an OIDC responsibility only in the iam:employments claim", () => {
    expect(
      oidcUserInfoHasResponsibility(
        {
          "iam:employments": [responsibilityEmployment()],
        },
        expectation,
      ),
    ).toBe(true);
    expect(
      oidcUserInfoHasResponsibility(
        {
          "iam:employments": [],
          leaked: responsibility(),
        },
        expectation,
      ),
    ).toBe(false);
  });

  test("rejects the retired OIDC position field instead of treating it as the current wire", () => {
    expect(() =>
      oidcUserInfoHasResponsibility(
        {
          "iam:employments": [{ ...responsibilityEmployment(), position: { posCode: expectation.positionCode } }],
        },
        expectation,
      ),
    ).toThrow("Responsibility disclosure requires a position code");
  });

  test("uses the Internal Document Employment position contract", () => {
    expect(
      internalDetailHasResponsibility(
        {
          data: {
            employments: [
              {
                ...responsibilityEmployment(),
                position: { code: expectation.positionCode },
              },
            ],
          },
        },
        expectation,
      ),
    ).toBe(true);
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
