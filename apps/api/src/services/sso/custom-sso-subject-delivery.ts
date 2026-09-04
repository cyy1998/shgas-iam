import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type {
  CustomSsoSubjectProjectionPort,
} from "./custom-sso-subject-delivery.port";
import type {
  CustomSsoSubjectProjectionV2Dto,
} from "./custom-sso-subject.schema";
import {
  CustomSsoClientDeliveryUnauthorizedError,
} from "@api/services/sso/custom-sso-client-delivery.error";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import {
  parseSubjectClaimSelection,
  SUBJECT_CLAIM_CATALOG,
} from "@iam/client-subject-projection";
import { resolveCustomSsoSubjectProjection } from "@iam/client-subject-projection/custom-sso";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";

export interface CustomSsoSubjectDeliveryDeps {
  projection: CustomSsoSubjectProjectionPort;
}

export interface CustomSsoSubjectDeliveryContext {
  readonly subjectIdentifier: string;
  readonly authenticatedClientCode: string;
  readonly expectedConfigVersion?: number;
}

export interface CustomSsoSubjectDeliveryCapability {
  resolveUserInfo: () => Promise<CustomSsoSubjectProjectionV2Dto>;
}

export function createCustomSsoSubjectDelivery(
  deps: CustomSsoSubjectDeliveryDeps,
) {
  function loadAcceptedClient(
    context: CustomSsoSubjectDeliveryContext,
    client: CustomSsoClientRuntimeDto,
  ) {
    const config = client.customSsoConfig;
    if (
      client.clientCode !== context.authenticatedClientCode
      || client.status === ClientStatus.Disable
      || client.isDelete
      || !client.customSsoEnabled
      || config === null
      || config === undefined
      || (
        context.expectedConfigVersion !== undefined
        && client.customSsoConfigVersion
        !== context.expectedConfigVersion
      )
    ) {
      throw new CustomSsoClientDeliveryUnauthorizedError();
    }
    return { client, config };
  }

  async function resolveUserInfo(
    context: CustomSsoSubjectDeliveryContext,
    client: CustomSsoClientRuntimeDto,
  ) {
    const { config } = loadAcceptedClient(context, client);
    const selection = parseSubjectClaimSelection({
      catalogVersion: SUBJECT_CLAIM_CATALOG.version,
      claims: [...config.subjectClaims],
    });
    const wire = await resolveCustomSsoSubjectProjection(deps.projection, {
      subjectIdentifier: context.subjectIdentifier,
      clientCode: context.authenticatedClientCode,
      selection,
    });
    return wire;
  }

  function createUserInfoCapability(
    context: CustomSsoSubjectDeliveryContext,
    client: CustomSsoClientRuntimeDto,
  ): CustomSsoSubjectDeliveryCapability {
    const capturedContext = {
      subjectIdentifier: context.subjectIdentifier,
      authenticatedClientCode: context.authenticatedClientCode,
      ...(context.expectedConfigVersion === undefined
        ? {}
        : { expectedConfigVersion: context.expectedConfigVersion }),
    };
    const acceptedClient = loadAcceptedClient(capturedContext, client).client;
    return Object.freeze({
      resolveUserInfo: async () =>
        await resolveUserInfo(capturedContext, acceptedClient),
    });
  }

  async function resolveGatewaySubjectHeader(
    context: CustomSsoSubjectDeliveryContext,
    client: CustomSsoClientRuntimeDto,
  ) {
    const projection = await resolveGatewaySubjectProjection(context, client);
    const payload = {
      version: 1 as const,
      subjectIdentifier: context.subjectIdentifier,
      ...(projection.username === undefined
        ? {}
        : { username: projection.username }),
      ...(projection.name === undefined
        ? {}
        : { name: projection.name }),
    };
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  }

  return {
    createUserInfoCapability,
    resolveGatewaySubjectHeader,
  };

  async function resolveGatewaySubjectProjection(
    context: CustomSsoSubjectDeliveryContext,
    client: CustomSsoClientRuntimeDto,
  ) {
    const { config } = loadAcceptedClient(context, client);
    if (config.mode !== CustomSsoClientMode.Gateway) {
      throw new AuthzUnauthorizedError("未登录");
    }

    const claims = config.subjectClaims.filter(
      claim =>
        claim === SubjectClaim.SubjectIdentifier
        || claim === SubjectClaim.ProfileUsername
        || claim === SubjectClaim.ProfileName,
    );
    const selection = parseSubjectClaimSelection({
      catalogVersion: SUBJECT_CLAIM_CATALOG.version,
      claims: [...claims],
    });
    const projection = await deps.projection.resolve({
      subjectIdentifier: context.subjectIdentifier,
      clientCode: context.authenticatedClientCode,
      selection,
    });
    assertProjectionSubject(projection.subjectIdentifier, context);
    return projection;
  }
}

function assertProjectionSubject(
  projectedSubjectIdentifier: string,
  context: CustomSsoSubjectDeliveryContext,
) {
  if (projectedSubjectIdentifier !== context.subjectIdentifier) {
    throw new TypeError(
      "Custom SSO subject projection returned a different Subject Identifier",
    );
  }
}

export type CustomSsoSubjectDelivery = ReturnType<
  typeof createCustomSsoSubjectDelivery
>;
