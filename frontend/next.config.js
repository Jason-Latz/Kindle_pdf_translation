/** @type {import('next').NextConfig} */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  output: "export",
  images: {
    unoptimized: true
  },
  env: {
    NEXT_PUBLIC_API_BASE: API_BASE
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${API_BASE}/api/:path*`
      }
    ];
  }
};

module.exports = nextConfig;
