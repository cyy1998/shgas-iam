import { startApi } from "@api/server";
import { requireEnvironment } from "./environment.ts";
import { createSmsProvider } from "./sms-provider.ts";
import { createWecomProvider } from "./wecom-provider.ts";

await startApi({
  hostname: "127.0.0.1",
  integrationFetch: {
    wechat: createWecomProvider(requireEnvironment("IAM_E2E_RUN_ID")),
    sms: createSmsProvider(requireEnvironment("IAM_E2E_SMS_DELIVERY_PATH")),
  },
});
