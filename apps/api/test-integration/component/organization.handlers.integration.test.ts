import { createOrganizationHandlers } from "@api/routes/internal/organization/organization.handlers";
import { OrganizationType } from "@iam/contracts";
import { describe, expect, mock, test } from "bun:test";

function createContext() {
  return {
    req: {
      valid: mock((target: string) => {
        expect(target).toBe("json");
        return {
          orgCode: "SUP",
          orgName: "Supplier",
          parentOrg: "GY",
        };
      }),
      header: mock((name: string) => name === "Client" ? "portal" : undefined),
    },
    json: mock((payload: unknown) => payload),
  };
}

function createHandlers(findResult: unknown = null) {
  const deps = {
    auditLogWriter: {
      recordAuditLogFromContext: mock(async () => undefined),
    },
    organizationService: {
      findOrganizationByCode: mock(async () => findResult),
      getOrganizationByCode: mock(async () => {
        throw new Error("getOrganizationByCode should not be called");
      }),
      searchOrganizations: mock(async () => []),
      setOrganization: mock(async () => true),
      updateOrganization: mock(async () => true),
    },
  };

  return {
    deps,
    handlers: createOrganizationHandlers(deps as never),
  };
}

describe("createOrganizationHandlers", () => {
  test("registers a purveyor organization through nullable lookup", async () => {
    const { deps, handlers } = createHandlers();
    const context = createContext();

    const response = await handlers.purveyorRegister(context as never, undefined as never);

    expect(response as unknown).toEqual({
      code: 200,
      data: true,
      message: "success",
    });

    expect(deps.organizationService.findOrganizationByCode).toHaveBeenCalledWith("SUP");
    expect(deps.organizationService.getOrganizationByCode).not.toHaveBeenCalled();
    expect(deps.organizationService.setOrganization).toHaveBeenCalledWith(expect.objectContaining({
      isVirtual: true,
      orgCode: "SUP",
      orgName: "Supplier",
      orgType: OrganizationType.External,
      parentCode: "GY",
    }));
    expect(deps.auditLogWriter.recordAuditLogFromContext).toHaveBeenCalled();
  });
});
