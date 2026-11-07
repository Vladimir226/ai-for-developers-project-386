import type { Metadata } from 'next';
// Manrope 400–800 + кириллица из npm-пакета (#29): шрифты приходят из
// npm-реестра (он и так нужен для npm ci), а не с fonts.googleapis.com —
// сборка образа герметична. index.css пакета объявляет @font-face
// 'Manrope Variable' (wght 200–800) с unicode-range по всем subset'ам,
// включая кириллицу; font-family связывается с токенами в globals.css.
import '@fontsource-variable/manrope';
import './globals.css';

export const metadata: Metadata = {
  title: 'Запись на звонок',
  description: 'Публикуйте свободное время и записывайтесь на звонки',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body className="font-sans">{children}</body>
    </html>
  );
}
