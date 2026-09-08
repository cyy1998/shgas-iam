import type { ApiRequestContext, InternalAuditActor } from "@api/services/audit/audit.context";

export interface RegisterPurveyorContactInput {
  username: string;
  mobile: string;
  name: string;
  orgCode: string;
}

export interface RegisterPurveyorContactOptions {
  actor: InternalAuditActor;
  requestContext?: ApiRequestContext;
}
