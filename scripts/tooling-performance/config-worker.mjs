import { buildConfig } from "./profiles.mjs";

const profileName = process.argv[2];
if (!profileName)
  throw new Error("ESLint benchmark config worker requires a profile name");

const timings = await buildConfig(profileName);

process.stdout.write(`${JSON.stringify({
  ...timings,
  maxRssKiB: process.resourceUsage().maxRSS,
})}\n`);
