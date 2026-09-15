import type { CustomSsoSubjectProjection } from "../wire";

export interface CustomSsoSubjectDeliveryCapability {
  resolveUserInfo: () => Promise<CustomSsoSubjectProjection>;
}
