/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    // Local dev only — production uses NEXT_PUBLIC_API_BASE_URL.
    if (process.env.NODE_ENV !== 'development') return [];
    return [
      { source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' },
    ];
  },
};
module.exports = nextConfig;
