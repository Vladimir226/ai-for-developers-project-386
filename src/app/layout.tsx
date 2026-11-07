import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Запись на звонок',
  description: 'Публикуйте свободное время и записывайтесь на звонки',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
