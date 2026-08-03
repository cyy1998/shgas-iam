import { describe, expect, test } from "bun:test";
import { getUserTypeOptions, UserType } from "../../index";

describe("UserType", () => {
  test("exports informal employees as a supported user type", () => {
    const informalUserType: string = UserType.Informal;
    expect(informalUserType).toBe("非正式员工");
  });

  test("lists informal employees in the public user type options", () => {
    expect(getUserTypeOptions()).toEqual([
      { label: "正式员工", value: UserType.Formal },
      { label: "非正式员工", value: UserType.Informal },
      { label: "外部用户", value: UserType.External },
    ]);
  });
});
