import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerApiClient } from '@/lib/sdk/server';
import { getAppTz } from '@/lib/time/app-tz';
import { tzLabel } from '@/lib/time/display';
import { UPCOMING_BOOKINGS_QUERY } from '../admin/admin-logic';
import { UpcomingList } from './UpcomingList';

// «Предстоящие записи» (#57, ADR-0012): публичный read-only список всех
// предстоящих броней всех гостей — паритет данных с разделом «Брони»
// админки (#36): тот же GET /api/v1/bookings?upcoming=true self-fetch'ем
// через SDK (ADR-0004), фильтр «конец ≥ сейчас» делает сервер.
// Форматирование — на сервере в APP_TZ с явным поясом (ADR-0009).

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Предстоящие записи — Запись на звонок',
};

export default async function BookingsPage() {
  const appTz = getAppTz();
  const now = new Date();
  const tzText = tzLabel(appTz, now);

  const api = await createServerApiClient();
  const { data } = await api.GET('/api/v1/bookings', UPCOMING_BOOKINGS_QUERY);
  // null отличается от пустого списка: пустой — «Предстоящих звонков нет»,
  // null — ошибка загрузки (деградация в UpcomingList)
  const bookings = data?.bookings ?? null;

  return (
    <div className="bg-paper text-ink font-sans antialiased min-h-screen flex flex-col">
      <header className="border-b border-line bg-card/70">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 min-w-0">
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
          </Link>
          <nav className="flex items-center gap-4 sm:gap-5 text-[13.5px] sm:text-sm font-medium">
            <Link
              href="/"
              className="whitespace-nowrap text-muted hover:text-sage transition-colors"
            >
              Записаться&nbsp;&rarr;
            </Link>
            {/* текущая страница — как в прототипе events.html: не ссылка */}
            <span className="hidden sm:inline text-ink cursor-default whitespace-nowrap">
              Предстоящие записи
            </span>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 pt-10 sm:pt-14 pb-16 flex-1">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-sage">
          Расписание
        </p>
        <h1 className="mt-3 text-[30px] sm:text-[34px] font-extrabold tracking-tight">
          Предстоящие записи
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-muted max-w-[52ch]">
          Подтверждённые звонки на ближайшие дни. Все времена — {tzText}.
        </p>
        <UpcomingList bookings={bookings} timeZone={appTz} tzText={tzText} />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 h-14 flex items-center justify-between text-[12.5px] text-muted">
          <span>«Запись на звонок»</span>
          <span>Время — {tzText}</span>
        </div>
      </footer>
    </div>
  );
}
