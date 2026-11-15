import { startApi } from "@api/server";
import { createSmsProvider } from "./sms-provider.ts";
import { createWecomProvider } from "./wecom-provider.ts";

const runId = process.env.IAM_E2E_RUN_ID;
if (!runId) throw new Error("IAM_E2E_RUN_ID is required by the E2E API image");

await startApi({ integrationFetch: { wechat: createWecomProvider(runId), sms: createSmsProvider() } });
