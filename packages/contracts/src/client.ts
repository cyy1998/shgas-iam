import { z } from "zod";
import { ClientStatus } from "./enums/client.status";

const CLIENT_CODE_MAX_LENGTH = 64;

export const ClientCodeSchema = z
  .string()
  .min(1, "Client Code 不能为空")
  .refine((value) => hasAtMostUnicodeCodePoints(value, CLIENT_CODE_MAX_LENGTH), "Client Code 最多 64 个字符")
  .meta({
    description: "Client Code",
    maxLength: CLIENT_CODE_MAX_LENGTH,
  });

export const PublicClientStatusDtoSchema = z.object({
  clientCode: z.string(),
  clientName: z.string(),
  status: z.enum(ClientStatus),
  url: z.string().nullable(),
});

export type PublicClientStatusDto = z.infer<typeof PublicClientStatusDtoSchema>;

function hasAtMostUnicodeCodePoints(value: string, maximum: number) {
  let count = 0;
  for (const _character of value) {
    count += 1;
    if (count > maximum) return false;
  }
  return true;
}
