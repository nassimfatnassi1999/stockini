import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadRootEnv() {
  const envPath = path.resolve(__dirname, '../.env');
  if (!fs.existsSync(envPath)) return {};

  return Object.fromEntries(
    fs.readFileSync(envPath, 'utf8')
      .split('\n')
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        return [key, val];
      }),
  );
}

const rootEnv = loadRootEnv();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      { source: '/facturation', destination: '/workflow', permanent: true },
      { source: '/facturation/:path*', destination: '/workflow', permanent: true },
    ];
  },
  async rewrites() {
    const rawApiUrl = rootEnv.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const apiUrl = rawApiUrl.replace(/\/$/, '').endsWith('/api')
      ? rawApiUrl.replace(/\/$/, '')
      : `${rawApiUrl.replace(/\/$/, '')}/api`;
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
