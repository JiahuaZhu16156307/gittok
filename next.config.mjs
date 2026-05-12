/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  env: {
    // Client-side mock mode: controls whether interaction store calls real GitHub API
    // USE_MOCK_FEED controls server-side feed data; NEXT_PUBLIC_USE_MOCK_FEED controls client interactions
    NEXT_PUBLIC_USE_MOCK_FEED: process.env.NEXT_PUBLIC_USE_MOCK_FEED || "false",
  },
};

export default nextConfig;
