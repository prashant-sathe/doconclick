import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://doconclick:doconclick_secret@localhost:5433/doconclick_db",
  },
  migrations: {
    path: "prisma/migrations",
  },
});
