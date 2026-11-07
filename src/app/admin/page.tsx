import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerApiClient } from '@/lib/sdk/server';
import { getAppTz } from '@/lib/time/app-tz';
import { tzLabel } from '@/lib/time/display';
import { adminWindow } from './admin-logic';
import { PublishForm } from './PublishForm';
import { SlotList } from './SlotList';

// Панель владельца (FR-002): чтение — RSC self-fetch через SDK (ADR-004,
// ADR-010), мутации — клиентские компоненты тем же SDK + router.refresh().
// Окно списка — adminWindow(): все опубликованные интервалы, включая
// прошедшие (бейдж «Прошёл») и дальние планы.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Панель владельца — Запись на звонок',
};

export default async function AdminPage() {
  const appTz = getAppTz();
  const now = new Date();
  const { from, to } = adminWindow();

  const api = await createServerApiClient();
  const [slotsResult, bookingsResult] = await Promise.all([
    api.GET('/api/v1/slots', { params: { query: { view: 'all', from, to } } }),
    // брони нужны только для бейджа «Забронирован»; сам список броней — тикет #8
    api.GET('/api/v1/bookings'),
  ]);

  // self-fetch того же процесса падает только вместе со всей страницей;
  // при частичном отказе список деградирует без статусов броней
  const slots = slotsResult.data?.slots ?? null;
  const bookedSlotIds = bookingsResult.data?.bookings.map((b) => b.slotId) ?? null;

  return (
    <div className="bg-paper text-ink font-sans antialiased min-h-screen flex flex-col">
      <header className="border-b border-line bg-card/70">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
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
          <div className="flex items-center gap-4 sm:gap-5 text-sm font-medium">
            <span className="hidden md:inline text-ink cursor-default">Панель владельца</span>
            <Link
              href="/"
              className="whitespace-nowrap text-muted hover:text-sage transition-colors"
            >
              Публичная страница&nbsp;&rarr;
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-10 pb-16 flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[30px] sm:text-[34px] font-extrabold tracking-tight">
              Панель владельца
            </h1>
            <p className="mt-2 text-[15px] text-muted">
              Публикуйте интервалы и управляйте бронями. Все времена — {tzLabel(appTz, now)}.
            </p>
          </div>
        </div>

        <div className="mt-8 grid lg:grid-cols-12 gap-8 lg:gap-10">
          <section className="lg:col-span-5" aria-label="Новые интервалы">
            <div className="lg:sticky lg:top-8 rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-[0_1px_3px_rgba(55,53,47,0.04)]">
              <h2 className="text-[19px] font-bold tracking-tight">Новые интервалы</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                Каждый интервал — одно бронируемое окно. Добавьте несколько строк сразу.
              </p>
              <PublishForm appTz={appTz} />
            </div>
          </section>

          <div className="lg:col-span-7">
            <SlotList slots={slots} bookedSlotIds={bookedSlotIds} appTz={appTz} now={now} />
          </div>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between text-[12.5px] text-muted">
          <span>«Запись на звонок»</span>
          <span>Время — {tzLabel(appTz, now)}</span>
        </div>
      </footer>
    </div>
  );
}
