import { z } from "zod";

export const MAX_SESSION_ORIGIN_IP_LENGTH = 64;
export const MAX_SESSION_ORIGIN_USER_AGENT_LENGTH = 512;

export const SessionOriginSchema = z.object({
  ip: z.string().min(1).max(MAX_SESSION_ORIGIN_IP_LENGTH).optional(),
  userAgent: z.string().min(1).max(MAX_SESSION_ORIGIN_USER_AGENT_LENGTH).optional(),
});
export type SessionOrigin = z.infer<typeof SessionOriginSchema>;

export function normalizeSessionOrigin(input: {
  ip?: string | null;
  userAgent?: string | null;
} | null | undefined): SessionOrigin | undefined {
  const ip = normalizeBoundedOriginValue(input?.ip, MAX_SESSION_ORIGIN_IP_LENGTH, true);
  const userAgent = normalizeBoundedOriginValue(
    input?.userAgent,
    MAX_SESSION_ORIGIN_USER_AGENT_LENGTH,
    false,
  );
  return ip || userAgent ? { ip, userAgent } : undefined;
}

function normalizeBoundedOriginValue(
  value: string | null | undefined,
  maxLength: number,
  trim: boolean,
) {
  if (typeof value !== "string")
    return undefined;
  const normalized = trim ? value.trim() : value;
  if (normalized.trim().length === 0)
    return undefined;
  return normalized.slice(0, maxLength);
}
