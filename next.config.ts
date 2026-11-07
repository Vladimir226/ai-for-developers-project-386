import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // standalone-выход для Docker-образа подключается в тикете Docker (#3);
  // сейчас стандартный запуск `next dev` / `next start`
};

export default nextConfig;
