import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.TETRAFORCE_NEXT_DIST_DIR ?? ".next",
  transpilePackages: ["@tetraforce/contracts"]
};

export default nextConfig;
