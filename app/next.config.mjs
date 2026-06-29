import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // @arc/core is a workspace package whose `exports` point at raw .ts source, so
  // Next must run its compiler over it (it is not pre-built to JS).
  transpilePackages: ['@arc/core', '@arc/payout'],
  // The workspace root is one level up; pin file tracing there to silence the
  // multi-lockfile root inference warning and keep monorepo resolution correct.
  outputFileTracingRoot: path.join(__dirname, '..'),
  // @arc/core lives outside this app's directory (../packages/core); allow it.
  experimental: {
    externalDir: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
