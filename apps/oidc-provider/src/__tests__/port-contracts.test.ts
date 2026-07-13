import type {
  InteractionClientReader,
  InteractionGlobalSessionResolver,
  InteractionProviderSessionBindingStore,
  InteractionReturnHandleStore,
} from "../interaction/interaction.port.ts";
import type {
  ClaimsAccountReader,
  ClaimsAuthorizationReader,
  ClaimsClientRuntimeReader,
  ClaimsProviderSessionBindingStore,
  ClaimsSessionResolver,
  ClaimsTokenRevoker,
} from "../provider/claims.port.ts";
import type { OidcAccountRepository } from "../repositories/account.repository.ts";
import type { OidcAuthorizationRepository } from "../repositories/authorization.repository.ts";
import type { OidcSessionKernelAdapter } from "../session/oidc-session-kernel.adapter.ts";
import type { OidcClientRuntimeStore } from "../stores/client-runtime.store.ts";
import { describe, expect, it } from "vitest";

function assertAssignable<Port, _Provider extends Port>() {}

describe("oIDC provider-to-port contracts", () => {
  it("repositories satisfy claims ports", () => {
    assertAssignable<ClaimsAccountReader, OidcAccountRepository>();
    assertAssignable<ClaimsAuthorizationReader, OidcAuthorizationRepository>();
    expect(true).toBe(true);
  });

  it("client runtime store satisfies all consumer ports", () => {
    assertAssignable<ClaimsClientRuntimeReader, OidcClientRuntimeStore>();
    assertAssignable<InteractionClientReader, OidcClientRuntimeStore>();
    expect(true).toBe(true);
  });

  it("session adapter satisfies claims ports", () => {
    assertAssignable<ClaimsSessionResolver, OidcSessionKernelAdapter>();
    assertAssignable<ClaimsProviderSessionBindingStore, OidcSessionKernelAdapter>();
    assertAssignable<ClaimsTokenRevoker, OidcSessionKernelAdapter>();
    expect(true).toBe(true);
  });

  it("session adapter satisfies interaction ports", () => {
    assertAssignable<InteractionGlobalSessionResolver, OidcSessionKernelAdapter>();
    assertAssignable<InteractionProviderSessionBindingStore, OidcSessionKernelAdapter>();
    assertAssignable<InteractionReturnHandleStore, OidcSessionKernelAdapter>();
    expect(true).toBe(true);
  });
});
