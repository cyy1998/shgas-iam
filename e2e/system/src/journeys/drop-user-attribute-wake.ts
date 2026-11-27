import { CustomAttributeCodeSchema } from "@iam/contracts/custom-attributes";
import db, { closeDb } from "@iam/db";
import { closeMaintenanceResources, runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";
import { redisUrlString } from "@iam/runtime/redis/config";
import { createUserDocumentWakeFault } from "./user-document-wake-fault.ts";

const attributeCode = CustomAttributeCodeSchema.parse(process.argv[2]);
const redisUrl = process.env.IAM_E2E_REDIS_URL;
if (!redisUrl?.trim()) throw new Error("IAM_E2E_REDIS_URL is required");
const fault = createUserDocumentWakeFault({
  db,
  redis: redisUrlString().parse(redisUrl),
});

await runMaintenanceCommandWithLifecycle({
  deadlineMs: 20_000,
  run: (signal) => fault.dropWaitingAttributeDefinitionWake(attributeCode, signal),
  shutdown: () => closeMaintenanceResources([fault.close(), closeDb({ timeoutSeconds: 5 })]),
});
