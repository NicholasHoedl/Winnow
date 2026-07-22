import "dotenv/config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({
  schema: [
    "./src/db/schema.ts",
    "./src/modules/todos/schema.ts",
    "./src/modules/meals/schema.ts",
    "./src/modules/budget/schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
})
