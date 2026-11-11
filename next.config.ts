import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Admin -> News uploads cover photos (max 3 MB) through a server action.
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
