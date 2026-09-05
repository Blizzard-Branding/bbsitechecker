import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium"],
  // @sparticuz/chromium's binary is loaded via runtime fs reads, not a
  // static require, so Next's file tracer won't pick it up on its own.
  // Without this, the function deploys but Chromium's executablePath()
  // points at a file that was never bundled, so every audit fails.
  outputFileTracingIncludes: {
    "/api/audit": ["./node_modules/@sparticuz/chromium/**"],
  },
};

export default nextConfig;
