import type { AuditRequestContext } from "@iam/domain/audit";
import type { CustomSsoAuditInput as AuditLogInput } from "../custom-sso.port";
import { AuditActions } from "@iam/contracts";

export function buildIndependentLoginSuccessAudit(
  subjectIdentifier: string,
  clientCode: string,
): AuditLogInput {
  return buildSubjectLoginSuccessAudit(
    subjectIdentifier,
    clientCode,
    "independent",
  );
}

export function buildGatewayLoginSuccessAudit(
  subjectIdentifier: string,
  clientCode: string,
): AuditLogInput {
  return buildSubjectLoginSuccessAudit(
    subjectIdentifier,
    clientCode,
    "gateway",
  );
}

function buildSubjectLoginSuccessAudit(
  subjectIdentifier: string,
  clientCode: string,
  // Historical audit labels describe the completed delivery, never Client configuration.
  mode: "independent" | "gateway",
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
