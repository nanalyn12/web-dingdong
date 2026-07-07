import { defineConfig } from "drizzle-kit";

// drizzle-kit runs locally; pull DATABASE_URL from .env (Node 22+).
try {
  process.loadEnvFile(".env");
} catch {
  // .env optional (CI can pass DATABASE_URL directly)
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
