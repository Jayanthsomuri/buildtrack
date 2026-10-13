/** @type {import('next').NextConfig} */
const nextConfig = {
  // Bundle only what's needed to run into .next/standalone - keeps the Docker image small.
  output: 'standalone',
};

export default nextConfig;
