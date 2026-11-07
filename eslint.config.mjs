import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';
import prettierConfig from 'eslint-config-prettier';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  prettierConfig,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // герметичность сборки (ADR-007, #29): next/font/google качает шрифты
      // с fonts.googleapis.com на этапе next build — сбой сети роняет сборку
      // образа (hexlet-check run 42404916508). Шрифты — из npm (@fontsource)
      // или next/font/local с закоммиченным файлом.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/font/google',
              message:
                'Шрифт из Google Fonts скачивается во время сборки — используй @fontsource/* из npm или next/font/local.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'next-env.d.ts',
      // вендорные ассеты установленных скиллов — не код проекта
      '.agents/**',
      // сгенерировано из TypeSpec-контракта (ADR-010); типы проверяет tsc
      'src/generated/**',
    ],
  },
];

export default eslintConfig;
