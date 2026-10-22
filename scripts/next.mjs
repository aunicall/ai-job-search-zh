import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), process.argv[2] === "dev");
process.env.PORT ||= "3001";
await import("next/dist/bin/next");
