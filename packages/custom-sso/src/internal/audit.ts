import type { AuditRequestContext } from "@iam/domain/audit";
import type { CustomSsoAuditInput as AuditLogInput } from "../custom-sso.port";
import { AuditActions, CustomSsoClientMode } from "@iam/contracts";

export function buildIndependentLoginSuccessAudit(
  subjectIdentifier: string,
  clientCode: string,
): AuditLogInput {
  return buildSubjectLoginSuccessAudit(
    subjectIdentifier,
    clientCode,
    CustomSsoClientMode.Independent,
  );
}

export function buildGatewayLoginSuccessAudit(
  subjectIdentifier: string,
  clientCode: string,
): AuditLogInput {
  return buildSubjectLoginSuccessAudit(
    subjectIdentifier,
    clientCode,
    CustomSsoClientMode.Gateway,
  );
}

function buildSubjectLoginSuccessAudit(
  subjectIdentifier: string,
  clientCode: string,
  mode: CustomSsoClientMode,
): AuditLogInput {
  return {
    action: AuditActions["auth.login.local"],
    outcome: "success",
    actorType: "user",
    actorUserId: null,
    targetType: "subject",
    targetId: null,
    targetCode: subjectIdentifier,
    details: {
      clientCode,
      loginType: "local",
      mode,
    },
  };
}

export function withRequestContext(context: AuditRequestContext | undefined, input: AuditLogInput): AuditLogInput {
  return context ? { ...context, ...input } : input;
}
