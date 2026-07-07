import withSerwistInit from "@serwist/next";
import type { NextConfig } from "next";
import crypto from "crypto";

const revision = crypto.randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/offline", revision }],
});

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "http://localhost:3000",
  ],
};

export default withSerwist(nextConfig);