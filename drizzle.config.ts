import { defineConfig } from "drizzle-kit";

const dbUrl = process.env.DIGITALOCEAN_DATABASE_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

function cleanUrl(url: string) {
  return url.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: cleanUrl(dbUrl),
    ssl: { rejectUnauthorized: false },
  },
});
