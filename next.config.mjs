/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['googleapis', 'exceljs'],
  },
};

export default nextConfig;
