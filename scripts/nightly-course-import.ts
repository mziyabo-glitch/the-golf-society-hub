import dotenv from "dotenv";
import { runUkGolfApiSeedQueue } from "./uk-golf-api-seed-queue";
import { runUkGolfApiProcessQueue } from "./uk-golf-api-process-queue";

dotenv.config();

async function main(): Promise<void> {
  if (process.env.UK_GOLF_API_ALLOW_LIVE_PROMOTION === "true") {
    console.warn(
      "[course-import-nightly] UK_GOLF_API_ALLOW_LIVE_PROMOTION=true detected; nightly-course-import is staging-only and will not promote.",
    );
  }

  const seeded = await runUkGolfApiSeedQueue();
  console.log("[uk-golf-api:seed-queue]", seeded);

  const summary = await runUkGolfApiProcessQueue();
  console.log("[uk-golf-api:nightly-summary]");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[course-import-nightly] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
