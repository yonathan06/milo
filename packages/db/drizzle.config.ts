import { defineConfig } from "drizzle-kit";

// Generation needs no credentials. Apply reviewed migrations via db:migrate.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
});
