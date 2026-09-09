import type { CustomSsoClientMode } from "@iam/contracts";

/** Used only after this operation has confirmed permanent Client rejection. */
export interface RejectedAuthorizationGrantPort {
  rejectAuthorizationGrant: (input: {
    code: string;
    clientCode: string;
    redirectUri: string;
    mode: CustomSsoClientMode;
  }) => Promise<void>;
}
