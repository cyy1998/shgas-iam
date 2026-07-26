import type { ApiRequestContext } from "@api/services/audit/audit.context";
import type { InternalAuditActor } from "@api/services/audit/events/internal.audit";

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
