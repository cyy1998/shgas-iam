import { CustomAttributeCodeSchema } from "@iam/contracts/custom-attributes";
import db, { closeDb } from "@iam/db";
import { closeMaintenanceResources, runMaintenanceCommandWithLifecycle } from "@iam/runtime/maintenance";
import { redisUrlString } from "@iam/runtime/redis/config";
import { requireEnvironment } from "./environment.ts";
import { createUserDocumentWakeFault } from "./user-document-wake-fault.ts";

const attributeCode = CustomAttributeCodeSchema.parse(process.argv[2]);
const fault = createUserDocumentWakeFault({
  db,
  redis: redisUrlString().parse(requireEnvironment("IAM_E2E_REDIS_URL")),
});

await runMaintenanceCommandWithLifecycle({
  deadlineMs: 20_000,
  run: (signal) => fault.dropWaitingAttributeDefinitionWake(attributeCode, signal),
  shutdown: () => closeMaintenanceResources([fault.close(), closeDb({ timeoutSeconds: 5 })]),
});
