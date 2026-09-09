import type { ClientSubjectProjectionService } from "@iam/client-subject-projection";
import type { OidcProviderComposition } from "../composition/index.ts";
import type {
  InteractionClientReader,
  InteractionGlobalSessionResolver,
  InteractionProviderSessionBindingStore,
  InteractionProviderSessionPrincipalReader,
  InteractionReturnHandleStore,
} from "../interaction/interaction.port.ts";
import type {
  ClaimsAccountReader,
  ClaimsClientRuntimeReader,
  ClaimsProviderSessionBindingStore,
  ClaimsSubjectProjectionResolver,
  ClaimsTokenRevoker,
} from "../provider/claims/claims.port.ts";
import type { OidcAccountRepository } from "../repositories/account.repository.ts";
import type {
  OidcSessionKernelAccountReader,
  OidcSessionKernelAdapter,
  OidcSessionKernelProviderSessionStateStore,
} from "../session/oidc-session-kernel.adapter.ts";
import type { ProviderSessionStateStore } from "../session/provider-session-state.store.ts";
import type {
  AdapterOidcSessionKernel,
  AdapterProviderSessionBindingStore,
} from "../storage/redis-adapter.port.ts";
import type { OidcClientRuntimeStore } from "../stores/client-runtime.store.ts";
import { describe, expect, it } from "vitest";

function assertAssignable<Port, _Provider extends Port>() {}

type AssertTrue<T extends true> = T;
type OidcProviderCompositionKeysAreClosed = AssertTrue<
  keyof OidcProviderComposition extends "logger" | "server" | "shutdown"
    ? "logger" | "server" | "shutdown" extends keyof OidcProviderComposition
      ? true
      : false
    : false
>;
const oidcProviderCompositionKeysAreClosed: OidcProviderCompositionKeysAreClosed = true;
void oidcProviderCompositionKeysAreClosed;
function assertCompleteProviderSessionLifecycleFence(
  storage: AdapterProviderSessionBindingStore,
  session: OidcSessionKernelAdapter,
  state: OidcSessionKernelProviderSessionStateStore,
) {
  void storage.destroyProviderSession("provider-session-a");
  void storage.destroyProviderSession("provider-session-a", {
    generation: "generation-a",
    principalSessionId: "principal-a",
  });
  // @ts-expect-error storage cleanup rejects a generation-only lifecycle fence
  void storage.destroyProviderSession("provider-session-a", { generation: "generation-a" });
  // @ts-expect-error storage cleanup rejects a principal-only lifecycle fence
  void storage.destroyProviderSession("provider-session-a", { principalSessionId: "principal-a" });

  // @ts-expect-error the Session adapter never exposes a partial lifecycle fence
  void session.destroyProviderSession("provider-session-a", { generation: "generation-a" });
  // @ts-expect-error the state consumer never exposes a partial lifecycle fence
  void state.destroyProviderSession("provider-session-a", { principalSessionId: "principal-a" });
}

void assertCompleteProviderSessionLifecycleFence;

function assertSubjectOnlyAccountReader(accounts: OidcSessionKernelAccountReader) {
  void accounts.findBySubject("subject-a");
  // @ts-expect-error the subject-only account reader must not expose database-id lookup
  void accounts.findById(1);
}

void assertSubjectOnlyAccountReader;

describe("oIDC provider-to-port contracts", () => {
  it("repositories satisfy claims ports", () => {
    assertAssignable<ClaimsAccountReader, OidcAccountRepository>();
    assertAssignable<OidcSessionKernelAccountReader, OidcAccountRepository>();
    assertAssignable<ClaimsSubjectProjectionResolver, ClientSubjectProjectionService>();
    expect(true).toBe(true);
  });

  it("client runtime store satisfies all consumer ports", () => {
    assertAssignable<ClaimsClientRuntimeReader, OidcClientRuntimeStore>();
    assertAssignable<InteractionClientReader, OidcClientRuntimeStore>();
    expect(true).toBe(true);
  });

  it("session adapter satisfies claims ports", () => {
    assertAssignable<ClaimsProviderSessionBindingStore, OidcSessionKernelAdapter>();
    assertAssignable<ClaimsTokenRevoker, OidcSessionKernelAdapter>();
    expect(true).toBe(true);
  });

  it("session adapter satisfies interaction ports", () => {
    assertAssignable<InteractionGlobalSessionResolver, OidcSessionKernelAdapter>();
    assertAssignable<InteractionProviderSessionBindingStore, OidcSessionKernelAdapter>();
    assertAssignable<InteractionProviderSessionPrincipalReader, OidcSessionKernelAdapter>();
    assertAssignable<InteractionReturnHandleStore, OidcSessionKernelAdapter>();
    expect(true).toBe(true);
  });

  it("session adapter satisfies storage adapter ports", () => {
    assertAssignable<AdapterOidcSessionKernel, OidcSessionKernelAdapter>();
    assertAssignable<AdapterProviderSessionBindingStore, OidcSessionKernelAdapter>();
    expect(true).toBe(true);
  });

  it("provider session state store satisfies its Session Kernel consumer port", () => {
    assertAssignable<OidcSessionKernelProviderSessionStateStore, ProviderSessionStateStore>();
    expect(true).toBe(true);
  });
});
