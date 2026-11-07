import type { Metadata } from 'next';
import Link from 'next/link';

// TODO(#33): панель по новому API (#32) — типы событий (CRUD, каскадное
// удаление броней D4) и рабочие часы недели (GET/PUT). TODO(#35): UI
// управления. Прежняя панель ручной публикации интервалов удалена вместе с
// POST/DELETE /api/v1/slots (ADR-0011); роуты вернутся в #33, до тех пор
// страница — статичная заглушка без данных.

export const metadata: Metadata = {
  title: 'Панель владельца — Запись на звонок',
};

export default function AdminPage() {
  return (
    <div className="bg-paper text-ink font-sans antialiased min-h-screen flex flex-col">
      <header className="border-b border-line bg-card/70">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="grid place-items-center size-9 rounded-xl bg-sage-soft text-sage">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M8 2v4M16 2v4M3 10h18" />
                <rect x="3" y="4" width="18" height="18" rx="4" />
                <path d="M9.5 15.5c.6.8 1.5 1.2 2.5 1.2s1.9-.4 2.5-1.2" />
              </svg>
            </span>
            <span className="font-extrabold tracking-tight text-[17px] whitespace-nowrap">
              Запись на звонок
            </span>
          </span>
          <Link
            href="/"
            className="whitespace-nowrap text-muted hover:text-sage transition-colors text-sm font-medium"
          >
            Публичная страница&nbsp;&rarr;
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-10 pb-16 flex-1">
        <h1 className="text-[30px] sm:text-[34px] font-extrabold tracking-tight">
          Панель владельца
        </h1>
        <section
          aria-label="Управление временно недоступно"
          className="mt-8 rounded-2xl border border-line bg-card px-6 py-12 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
        >
          <p className="text-[15px] leading-relaxed text-muted max-w-[52ch] mx-auto">
            Управление переходит на модель «типы событий + рабочие часы»: владелец задаст виды
            броней с длительностью и рабочие часы недели, слоты будут вычисляться автоматически.
            Загляните чуть позже.
          </p>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between text-[12.5px] text-muted">
          <span>«Запись на звонок»</span>
        </div>
      </footer>
    </div>
  );
}
