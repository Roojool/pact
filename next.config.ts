import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  serverExternalPackages: ['falkordb', '@js-temporal/polyfill'],
};

export default config;
