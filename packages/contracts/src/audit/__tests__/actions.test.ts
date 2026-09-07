import { describe, expect, test } from "bun:test";
import {
  auditActionOptions,
  getAuditActionLabel,
} from "../actions";

describe("audit action catalog", () => {
  test("labels canonical actions and preserves unknown actions verbatim", () => {
    expect(getAuditActionLabel("auth.login.password")).toBe("密码登录");
    expect(getAuditActionLabel("auth.login.password.failure")).toBe("auth.login.password.failure");
    expect(getAuditActionLabel("external.import.success")).toBe("external.import.success");
    expect(getAuditActionLabel("constructor")).toBe("constructor");
  });

  test("generates canonical action options only", () => {
    const values = auditActionOptions.map(option => option.value);

    expect(values).toContain("auth.login.password");
    expect(values).toContain("admin.session.revoke");
    expect(getAuditActionLabel("admin.session.revoke")).toBe(
      "强制下线单个会话",
    );
    expect(values).toContain("admin.session.revoke_user");
    expect(getAuditActionLabel("admin.session.revoke_user")).toBe(
      "下线用户全部会话",
    );
    expect(values).toContain("admin.login_restriction.release");
    expect(getAuditActionLabel("admin.login_restriction.release")).toBe(
      "解除临时登录限制",
    );
    expect(values).toContain("admin.employment.clear_primary");
    expect(getAuditActionLabel("admin.employment.clear_primary")).toBe(
      "取消主岗",
    );
    expect(values).toContain(
      "admin.organization_responsibility_assignment.create",
    );
    expect(
      getAuditActionLabel(
        "admin.organization_responsibility_assignment.create",
      ),
    ).toBe("创建组织责任任命");
    expect(
      getAuditActionLabel("admin.organization_responsibility_assignment.pause"),
    ).toBe("暂停组织责任任命");
    expect(
      getAuditActionLabel(
        "admin.organization_responsibility_assignment.resume",
      ),
    ).toBe("恢复组织责任任命");
    expect(
      getAuditActionLabel("admin.organization_responsibility_assignment.end"),
    ).toBe("结束组织责任任命");
    expect(values).toContain("admin.client.oidc.configure");
    expect(values).toContain("admin.client.oidc.rotate_secret");
    expect(values).toContain("admin.client.custom_sso.configure");
    expect(values).toContain("admin.client.custom_sso.enable");
    expect(values).toContain("admin.client.custom_sso.disable");
    expect(values).toContain("admin.client.custom_sso.remove");
    expect(values).toContain("admin.client.custom_sso.rotate_secret");
    expect(values).not.toContain("auth.login.password.failure");
  });
});
