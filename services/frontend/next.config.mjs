/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // 3d-force-graph and its Three.js deps ship as ESM — transpile so webpack can bundle them
  transpilePackages: ["3d-force-graph", "three-forcegraph", "three-render-objects", "three"],
  async rewrites() {
    return [
      {
        // Backend API — use Docker network name (server-side only)
        source: "/api/:path*",
        destination: `${process.env.INTERNAL_API_URL || "http://localhost:8000"}/api/:path*`,
      },
      {
        // SearXNG proxy — browser hits /searxng/*, Next.js forwards to container
        source: "/searxng/:path*",
        destination: `${process.env.INTERNAL_SEARXNG_URL || "http://localhost:8080"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
