import { chromium } from "@playwright/test";

async function main() {
  const browser = await chromium.launch({ headless: true });
  await browser.close();
  await new Promise(resolve => setTimeout(resolve, 1_000));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
