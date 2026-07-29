import type { LifecycleObjectKind, PrincipalRef } from "./model";

export type IndexMemberKind = "p" | "b" | "c" | "a";

export type ParsedIndexMember = {
  kind: LifecycleObjectKind;
  id: string;
};

const objectKindCodes = {
  principal_session: "p",
  client_binding: "b",
  credential: "c",
  artifact: "a",
} as const satisfies Record<LifecycleObjectKind, IndexMemberKind>;

const codeObjectKinds = {
  p: "principal_session",
  b: "client_binding",
  c: "credential",
  a: "artifact",
} as const satisfies Record<IndexMemberKind, LifecycleObjectKind>;

export type SessionKernelKeyBuilder = ReturnType<typeof createSessionKernelKeyBuilder>;

export function createSessionKernelKeyBuilder(namespace = "sess:v2:") {
  const ns = namespace.endsWith(":") ? namespace : `${namespace}:`;
  return {
    namespace: ns,
    active: (kind: LifecycleObjectKind, id: string) => `${ns}active:${objectKindCodes[kind]}:${id}`,
    lookup: (kind: Extract<LifecycleObjectKind, "principal_session" | "credential" | "artifact">, lookupHash: string) =>
      `${ns}lookup:${objectKindCodes[kind]}:${lookupHash}`,
    tombstone: (kind: LifecycleObjectKind, id: string) => `${ns}revoked:${objectKindCodes[kind]}:${id}`,
    lookupTombstone: (
      kind: Extract<LifecycleObjectKind, "principal_session" | "credential" | "artifact">,
      lookupHash: string,
    ) => `${ns}revoked_lookup:${objectKindCodes[kind]}:${lookupHash}`,
    index: {
      principalSessions: `${ns}idx:principal_sessions`,
      user: (principal: PrincipalRef) =>
        `${ns}idx:user:${encodePart(principal.principalType)}:${encodePart(principal.subjectId)}:principal`,
      client: (clientCode: string) => `${ns}idx:client:${encodePart(clientCode)}`,
      clientProtocol: (clientCode: string, protocol: string) =>
        `${ns}idx:client_protocol:${encodePart(clientCode)}:${encodePart(protocol)}`,
      principal: (principalSessionId: string) => `${ns}idx:principal:${encodePart(principalSessionId)}`,
      binding: (bindingId: string) => `${ns}idx:binding:${encodePart(bindingId)}`,
      protocol: (protocol: string) => `${ns}idx:protocol:${encodePart(protocol)}`,
    },
  };
}

export function encodeIndexMember(kind: LifecycleObjectKind, id: string) {
  return `${objectKindCodes[kind]}:${id}`;
}

export function parseIndexMember(member: string): ParsedIndexMember | null {
  const separator = member.indexOf(":");
  if (separator <= 0)
    return null;
  const code = member.slice(0, separator) as IndexMemberKind;
  const id = member.slice(separator + 1);
  const kind = codeObjectKinds[code];
  if (!kind || id.length === 0)
    return null;
  return { kind, id };
}

export async function cleanExpiredIndexMembers(redis: {
  zremrangebyscore: (key: string, min: string | number, max: string | number) => Promise<number>;
}, key: string, now: number) {
  return await redis.zremrangebyscore(key, "-inf", now);
}

function encodePart(value: string) {
  return encodeURIComponent(value);
}
