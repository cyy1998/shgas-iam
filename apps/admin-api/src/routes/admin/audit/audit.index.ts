import type { PublicBindings } from "@iam/api-core/types";
import { createRouter } from "@iam/api-core/core/create-router";
import * as handlers from "./audit.handlers";
import * as routes from "./audit.routes";

const router = createRouter<PublicBindings>().basePath("/audit-logs");

router.openapi(routes.auditLogsSearch, handlers.auditLogsSearch);

export default router;
