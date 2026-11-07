import type { Metadata } from 'next';
import { Manrope } from 'next/font/google';
import './globals.css';

// Manrope 400–800 из макета #13; next/font самохостит файлы в _next/static.
const manrope = Manrope({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-manrope',
});

export const metadata: Metadata = {
  title: 'Запись на звонок',
  description: 'Публикуйте свободное время и записывайтесь на звонки',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={manrope.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
