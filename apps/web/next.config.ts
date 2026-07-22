import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  transpilePackages: ["@tetraforce/contracts"]
};

export default nextConfig;
