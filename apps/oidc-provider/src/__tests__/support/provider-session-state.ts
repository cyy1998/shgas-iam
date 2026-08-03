import type {
  OidcSessionKernelProviderSessionStateStore,
} from "../../session/oidc-session-kernel.adapter.ts";
import type {
  ProviderSessionBinding,
  ProviderSessionBindingLookup,
  ProviderSessionLifecycleFence,
  ProviderSessionPrincipalAnchor,
  ProviderSessionPublicationResult,
  StagedProviderSessionBinding,
} from "../../session/provider-session.ts";

export class ProviderSessionStateFake implements OidcSessionKernelProviderSessionStateStore {
  private readonly anchors = new Map<string, ProviderSessionPrincipalAnchor>();
  private readonly bindings = new Map<string, ProviderSessionBinding>();
  private readonly lookups = new Map<string, ProviderSessionBindingLookup>();
  private readonly staged = new Map<string, StagedProviderSessionBinding>();
  private readonly generationMembers = new Map<string, Set<string>>();
  private publicationFailure: unknown | null = null;
  private recoverNext = false;

  failPublications(error: unknown) {
    this.publicationFailure = error;
  }

  recoverNextPublication() {
    this.recoverNext = true;
  }

  seedLookup(
    sessionUid: string,
    clientCode: string,
    lookup: ProviderSessionBindingLookup,
  ) {
    this.lookups.set(bindingKey(sessionUid, clientCode), structuredClone(lookup));
  }

  async stage(staged: StagedProviderSessionBinding, _ttlSeconds: number) {
    this.staged.set(staged.authorizationAttemptId, structuredClone(staged));
  }

  async claim(input: {
    accountId: string;
    authorizationAttemptId: string;
    clientCode: string;
    providerSessionUid: string;
  }) {
    const staged = this.staged.get(input.authorizationAttemptId);
    if (!staged
      || staged.accountId !== input.accountId
      || staged.clientCode !== input.clientCode
      || (staged.providerSessionUid !== null
        && staged.providerSessionUid !== input.providerSessionUid)) {
      return null;
    }
    this.staged.delete(input.authorizationAttemptId);
    return structuredClone(staged);
  }

  async readAnchor(sessionUid: string) {
    return clone(this.anchors.get(sessionUid));
  }

  async readStaged(authorizationAttemptId: string) {
    return clone(this.staged.get(authorizationAttemptId));
  }

  async readBinding(sessionUid: string, clientCode: string) {
    return clone(this.bindings.get(bindingKey(sessionUid, clientCode)));
  }

  async readLookup(sessionUid: string, clientCode: string) {
    const lookup = this.lookups.get(bindingKey(sessionUid, clientCode));
    return lookup
      ? { exists: true, value: structuredClone(lookup) }
      : { exists: false, value: null };
  }

  async publishRebind(input: {
    attemptId: string;
    binding: ProviderSessionBinding;
    expectedAnchorGeneration: string | null;
    providerSessionUid: string;
    ttlSeconds: number;
  }): Promise<ProviderSessionPublicationResult> {
    const failure = this.publicationFailureResult();
    if (failure)
      return failure;
    const owner = requireOwner(input.binding);
    const currentAnchor = this.anchors.get(input.providerSessionUid);
    const currentLookup = this.lookups.get(bindingKey(
      input.providerSessionUid,
      input.binding.clientCode,
    ));
    if (anchorMatches(currentAnchor, input.binding, input.attemptId)
      && lookupMatches(currentLookup, input.binding.bindingId, owner)) {
      this.writeBinding(input.providerSessionUid, input.binding, input.attemptId);
      return this.committedResult();
    }
    if (input.expectedAnchorGeneration === null
      ? currentAnchor !== undefined
      : currentAnchor?.generation !== input.expectedAnchorGeneration) {
      return { status: "conflict", recovered: false };
    }
    this.anchors.set(input.providerSessionUid, {
      accountId: input.binding.accountId,
      generation: input.attemptId,
      principalSessionId: input.binding.principalSessionId,
    });
    this.writeBinding(input.providerSessionUid, input.binding, input.attemptId);
    return this.committedResult();
  }

  async publishClientBinding(input: {
    anchor: ProviderSessionPrincipalAnchor;
    binding: ProviderSessionBinding;
    expectedLookup: ProviderSessionBindingLookup | null;
    providerSessionUid: string;
    ttlSeconds: number;
  }): Promise<ProviderSessionPublicationResult> {
    const failure = this.publicationFailureResult();
    if (failure)
      return failure;
    const owner = requireOwner(input.binding);
    const currentAnchor = this.anchors.get(input.providerSessionUid);
    const key = bindingKey(input.providerSessionUid, input.binding.clientCode);
    const currentLookup = this.lookups.get(key);
    if (anchorMatches(currentAnchor, input.binding, input.anchor.generation)
      && lookupMatches(currentLookup, input.binding.bindingId, owner)) {
      this.writeBinding(input.providerSessionUid, input.binding, input.anchor.generation);
      return this.committedResult();
    }
    if (!anchorMatches(currentAnchor, input.binding, input.anchor.generation)
      || !sameLookup(currentLookup, input.expectedLookup)) {
      return { status: "conflict", recovered: false };
    }
    this.writeBinding(input.providerSessionUid, input.binding, input.anchor.generation);
    return this.committedResult();
  }

  async refresh(input: {
    binding: ProviderSessionBinding;
    providerSessionUid: string;
    ttlSeconds: number;
  }) {
    const generation = input.binding.anchorGeneration;
    const owner = input.binding.mappingOwnerId;
    const currentAnchor = this.anchors.get(input.providerSessionUid);
    const currentLookup = this.lookups.get(bindingKey(
      input.providerSessionUid,
      input.binding.clientCode,
    ));
    if (!generation
      || !owner
      || !anchorMatches(currentAnchor, input.binding, generation)
      || !lookupMatches(currentLookup, input.binding.bindingId, owner)) {
      return false;
    }
    this.writeBinding(input.providerSessionUid, input.binding, generation);
    return true;
  }

  async deleteOwned(input: {
    anchorGeneration?: string;
    clientCode: string;
    mappingOwnerId?: string;
    providerSessionUid: string;
  }) {
    const key = bindingKey(input.providerSessionUid, input.clientCode);
    const lookup = this.lookups.get(key);
    if (lookup && lookup.mappingOwnerId === input.mappingOwnerId) {
      this.lookups.delete(key);
      this.bindings.delete(key);
    }
    if (!input.anchorGeneration || !input.mappingOwnerId)
      return 0;
    const membersKey = generationKey(input.providerSessionUid, input.anchorGeneration);
    const members = this.generationMembers.get(membersKey);
    if (!members)
      return 0;
    members.delete(input.mappingOwnerId);
    if (members.size > 0)
      return 0;
    this.generationMembers.delete(membersKey);
    if (this.anchors.get(input.providerSessionUid)?.generation === input.anchorGeneration)
      this.anchors.delete(input.providerSessionUid);
    return 1;
  }

  async destroyProviderSession(
    providerSessionUid: string,
    expected?: ProviderSessionLifecycleFence,
  ) {
    if (!expected?.generation || !expected.principalSessionId)
      return true;
    const anchor = this.anchors.get(providerSessionUid);
    if (anchor?.generation !== expected.generation
      || anchor.principalSessionId !== expected.principalSessionId) {
      return true;
    }
    if (anchor)
      this.generationMembers.delete(generationKey(providerSessionUid, anchor.generation));
    this.anchors.delete(providerSessionUid);
    return true;
  }

  private writeBinding(
    providerSessionUid: string,
    binding: ProviderSessionBinding,
    generation: string,
  ) {
    const owner = requireOwner(binding);
    const key = bindingKey(providerSessionUid, binding.clientCode);
    this.bindings.set(key, structuredClone(binding));
    this.lookups.set(key, { bindingId: binding.bindingId, mappingOwnerId: owner });
    const membersKey = generationKey(providerSessionUid, generation);
    const members = this.generationMembers.get(membersKey) ?? new Set<string>();
    members.add(owner);
    this.generationMembers.set(membersKey, members);
  }

  private publicationFailureResult(): ProviderSessionPublicationResult | null {
    return this.publicationFailure === null
      ? null
      : { status: "unknown", error: this.publicationFailure };
  }

  private committedResult(): ProviderSessionPublicationResult {
    const recovered = this.recoverNext;
    this.recoverNext = false;
    return { status: "committed", recovered };
  }
}

function bindingKey(sessionUid: string, clientCode: string) {
  return `${sessionUid}\0${clientCode}`;
}

function generationKey(sessionUid: string, generation: string) {
  return `${sessionUid}\0${generation}`;
}

function requireOwner(binding: ProviderSessionBinding) {
  if (!binding.mappingOwnerId)
    throw new Error("OIDC provider session binding mapping owner is unavailable");
  return binding.mappingOwnerId;
}

function anchorMatches(
  anchor: ProviderSessionPrincipalAnchor | undefined,
  binding: ProviderSessionBinding,
  generation: string,
) {
  return anchor?.accountId === binding.accountId
    && anchor.generation === generation
    && anchor.principalSessionId === binding.principalSessionId;
}

function lookupMatches(
  lookup: ProviderSessionBindingLookup | undefined,
  bindingId: string,
  mappingOwnerId: string,
) {
  return lookup?.bindingId === bindingId && lookup.mappingOwnerId === mappingOwnerId;
}

function sameLookup(
  actual: ProviderSessionBindingLookup | undefined,
  expected: ProviderSessionBindingLookup | null,
) {
  if (!expected)
    return actual === undefined;
  return actual?.bindingId === expected.bindingId
    && actual.mappingOwnerId === expected.mappingOwnerId;
}

function clone<T>(value: T | undefined): T | null {
  return value === undefined ? null : structuredClone(value);
}
