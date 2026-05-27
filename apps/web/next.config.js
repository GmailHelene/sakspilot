/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Tillat at /api-kall sendes via en proxy slik at frontend og backend
  // kan dele cookie under utvikling uten å sette opp CORS hver gang.
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
