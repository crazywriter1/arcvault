/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');
    if (api) {
      return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
    }
    if (process.env.NODE_ENV === 'development') {
      return [{ source: '/api/:path*', destination: 'http://localhost:3001/api/:path*' }];
    }
    return [];
  },
};
module.exports = nextConfig;
