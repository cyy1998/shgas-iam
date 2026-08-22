import type {
  CustomSsoSubjectProjectionV2Dto,
} from "@api/services/sso/custom-sso-subject.schema";
import type { User, UserDetailDto } from "@api/services/user/user.type";

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
  createUserInfoCapability: (context: {
    readonly subjectIdentifier: string;
    readonly authenticatedClientCode: string;
    readonly expectedConfigVersion?: number;
  }) => {
    resolveUserInfo: () => Promise<CustomSsoSubjectProjectionV2Dto>;
  };
  resolveGatewaySubjectHeader: (context: {
    readonly subjectIdentifier: string;
    readonly authenticatedClientCode: string;
    readonly expectedConfigVersion?: number;
  }) => Promise<string>;
}

export interface CustomSsoGatewayOrcasUserPort {
  getActiveUserBySubjectIdentifier: (
    subjectIdentifier: string,
  ) => Promise<User | null>;
  getUserDetailById: (userId: number) => Promise<UserDetailDto>;
}
