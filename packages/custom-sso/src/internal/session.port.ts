import type { SubjectAccessOperation } from "@iam/api-core/subject-access";
import type {
  CustomSsoSubjectProjection,
} from "@iam/custom-sso/wire";
import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type { CustomSsoOrcasUser } from "../custom-sso.port";

export interface CustomSsoAccess {
  operation?: SubjectAccessOperation;
  users: {
    findOrcasUserBySubjectIdentifier: (subjectIdentifier: string) => Promise<CustomSsoOrcasUser | null>;
  };
}

export interface CustomSsoOrcasLoginPort {
  orcasLogin: (input: {
    id: number;
    username: string;
    name: string;
    mobile?: string | null;
  }) => Promise<{
    orcasSessionId: string;
    orcasId: string;
  }>;
}

export interface CustomSsoSubjectDeliveryPort {
  createUserInfoCapability: (
    context: {
      readonly subjectIdentifier: string;
      readonly authenticatedClientCode: string;
      readonly expectedConfigVersion?: number;
    },
    client: CustomSsoClientRuntimeDto,
  ) => {
    resolveUserInfo: () => Promise<CustomSsoSubjectProjection>;
  };
  resolveGatewaySubjectHeader: (
    context: {
      readonly subjectIdentifier: string;
      readonly authenticatedClientCode: string;
      readonly expectedConfigVersion?: number;
    },
    client: CustomSsoClientRuntimeDto,
  ) => Promise<string>;
}
