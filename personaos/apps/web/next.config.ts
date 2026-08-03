import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  transpilePackages: [
    "@personaos/ui",
    "@personaos/types",
    "@personaos/config",
    "@personaos/shared"
  ]
};

export default nextConfig;
