import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // standalone-выход для Docker-образа (ADR-007): server.js + минимальный
  // набор зависимостей копируются в runtime-слой без dev-зависимостей и тестов
  output: 'standalone',
};

export default nextConfig;
