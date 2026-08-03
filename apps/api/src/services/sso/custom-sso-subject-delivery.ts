import type { CustomSsoClientRuntimeDto } from "@iam/domain/client";
import type {
  CustomSsoSubjectProjectionPort,
} from "./custom-sso-subject-delivery.port";
import type {
  CustomSsoSubjectProjectionV1Dto,
} from "./custom-sso-subject.schema";
import {
  CustomSsoClientRuntimeUnavailableError,
} from "@api/services/client/custom-sso-client-runtime.reader";
import {
  CustomSsoClientDeliveryUnauthorizedError,
} from "@api/services/sso/custom-sso-client-delivery.error";
import { AuthzUnauthorizedError } from "@iam/api-core/errors/AuthzUnauthorizedError";
import {
  parseSubjectClaimSelection,
} from "@iam/client-subject-projection";
import {
  mapClientSubjectProjectionToCustomSsoV1,
} from "@iam/client-subject-projection/custom-sso";
import {
  ClientStatus,
  CustomSsoClientMode,
  SubjectClaim,
} from "@iam/contracts";
import {
  CustomSsoSubjectProjectionV1Schema,
} from "./custom-sso-subject.schema";

export interface CustomSsoSubjectDeliveryDeps {
  clients: {
    findRuntimeRecord: (
      clientCode: string,
    ) => Promise<CustomSsoClientRuntimeDto | null>;
  };
  projection: CustomSsoSubjectProjectionPort;
}

export interface CustomSsoSubjectDeliveryContext {
  readonly subjectIdentifier: string;
  readonly authenticatedClientCode: string;
  readonly expectedConfigVersion?: number;
}

export interface CustomSsoSubjectDeliveryCapability {
  resolveUserInfo: () => Promise<CustomSsoSubjectProjectionV1Dto>;
}

export function createCustomSsoSubjectDelivery(
  deps: CustomSsoSubjectDeliveryDeps,
) {
  async function loadCurrentClient(
    context: CustomSsoSubjectDeliveryContext,
  ) {
    const client = await deps.clients.findRuntimeRecord(
      context.authenticatedClientCode,
    );
    const config = client?.customSsoConfig;
    if (
      client === null
      || client.clientCode !== context.authenticatedClientCode
      || client.status !== ClientStatus.Enable
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
  ) {
    const projection = await resolveCurrentSubjectProjection(
      context,
      "user-info",
    );
    return CustomSsoSubjectProjectionV1Schema.parse(
      mapClientSubjectProjectionToCustomSsoV1(projection),
    );
  }

  function createUserInfoCapability(
    context: CustomSsoSubjectDeliveryContext,
  ): CustomSsoSubjectDeliveryCapability {
    const capturedContext = {
      subjectIdentifier: context.subjectIdentifier,
      authenticatedClientCode: context.authenticatedClientCode,
      ...(context.expectedConfigVersion === undefined
        ? {}
        : { expectedConfigVersion: context.expectedConfigVersion }),
    };
    return Object.freeze({
      resolveUserInfo: async () => await resolveUserInfo(capturedContext),
    });
  }

  async function resolveGatewaySubjectHeader(
    context: CustomSsoSubjectDeliveryContext,
  ) {
    const projection = await resolveCurrentSubjectProjection(
      context,
      "gateway-header",
    );
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

  async function assertClientRemainsCurrent(
    context: CustomSsoSubjectDeliveryContext,
    projectedConfigVersion: number,
  ) {
    const { client } = await loadCurrentClient(context);
    if (client.customSsoConfigVersion === projectedConfigVersion)
      return;
    if (context.expectedConfigVersion !== undefined)
      throw new AuthzUnauthorizedError("未登录");
    throw new CustomSsoClientRuntimeUnavailableError();
  }

  async function resolveCurrentSubjectProjection(
    context: CustomSsoSubjectDeliveryContext,
    delivery: "gateway-header" | "user-info",
  ) {
    const { client, config } = await loadCurrentClient(context);
    if (
      delivery === "gateway-header"
      && config.mode !== CustomSsoClientMode.Gateway
    ) {
      throw new AuthzUnauthorizedError("未登录");
    }

    const claims = delivery === "gateway-header"
      ? config.subjectClaims.filter(
          claim =>
            claim === SubjectClaim.SubjectIdentifier
            || claim === SubjectClaim.ProfileUsername
            || claim === SubjectClaim.ProfileName,
        )
      : config.subjectClaims;
    const selection = parseSubjectClaimSelection({
      catalogVersion: config.subjectClaimCatalogVersion,
      claims: [...claims],
    });
    const projection = await deps.projection.resolve({
      subjectIdentifier: context.subjectIdentifier,
      clientCode: context.authenticatedClientCode,
      selection,
    });
    assertProjectionSubject(projection.subjectIdentifier, context);
    await assertClientRemainsCurrent(
      context,
      client.customSsoConfigVersion,
    );
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
