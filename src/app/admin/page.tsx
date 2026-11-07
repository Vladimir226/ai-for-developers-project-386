import type { Metadata } from 'next';
import Link from 'next/link';
import { createServerApiClient } from '@/lib/sdk/server';
import { getAppTz } from '@/lib/time/app-tz';
import { tzLabel } from '@/lib/time/display';
import { EventTypeForm } from './EventTypeForm';
import { EventTypeList } from './EventTypeList';
import { WorkingHoursForm } from './WorkingHoursForm';

// Панель владельца (#34): типы событий (CRUD, каскадное удаление D4) и
// рабочие часы недели (D3). Чтение — RSC self-fetch через SDK (ADR-004,
// ADR-010), мутации — клиентские компоненты тем же SDK + router.refresh().
// Брони — плейсхолдер до #36. Рабочие часы — «настенное» время APP_TZ
// (ADR-009), в контракт уходят минуты от полуночи.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Панель владельца — Запись на звонок',
};

export default async function AdminPage() {
  const appTz = getAppTz();
  const now = new Date();
  const tzText = tzLabel(appTz, now);

  const api = await createServerApiClient();
  const [eventTypesResult, hoursResult] = await Promise.all([
    api.GET('/api/v1/event-types'),
    api.GET('/api/v1/working-hours'),
  ]);

  // self-fetch того же процесса падает только вместе со всей страницей;
  // при частичном отказе каждая секция деградирует без своих данных
  const eventTypes = eventTypesResult.data?.eventTypes ?? null;
  const workingDays = hoursResult.data?.days ?? null;

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
        <div>
          <h1 className="text-[30px] sm:text-[34px] font-extrabold tracking-tight">
            Панель владельца
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Управляйте видами броней и рабочими часами — слоты пересчитываются сами. Все времена —{' '}
            {tzText}.
          </p>
        </div>

        <section aria-label="Типы событий" className="mt-8">
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-10">
            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-8 rounded-2xl border border-line bg-card p-5 sm:p-7 shadow-[0_1px_3px_rgba(55,53,47,0.04)]">
                <h2 className="text-[19px] font-bold tracking-tight">Новый тип события</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">
                  Вид брони с фиксированной длительностью: гость увидит его на публичной странице.
                </p>
                <EventTypeForm submitLabel="Создать тип" />
              </div>
            </div>
            <div className="lg:col-span-7">
              <EventTypeList eventTypes={eventTypes} />
            </div>
          </div>
        </section>

        <section aria-label="Рабочие часы" className="mt-10">
          <div className="rounded-2xl border border-line bg-card px-5 sm:px-7 py-6 shadow-[0_1px_3px_rgba(55,53,47,0.04)]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[19px] font-bold tracking-tight">Рабочие часы</h2>
              <span className="text-[12.5px] text-muted">Время — {tzText}</span>
            </div>
            <p className="mt-1.5 mb-5 text-[13.5px] leading-relaxed text-muted max-w-[64ch]">
              Слоты генерируются внутри рабочих часов каждого дня; выходной — без слотов.
            </p>
            <WorkingHoursForm initialDays={workingDays} />
          </div>
        </section>

        {/* TODO(#36): список броней владельца и отмена (GET/DELETE /api/v1/bookings). */}
        <section aria-label="Брони" className="mt-10">
          <div className="rounded-2xl border border-line bg-card px-6 py-10 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]">
            <h2 className="text-[19px] font-bold tracking-tight">Брони</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-muted max-w-[52ch] mx-auto">
              Список предстоящих броней всех типов и отмена появятся здесь в ближайшем обновлении.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 flex items-center justify-between text-[12.5px] text-muted">
          <span>«Запись на звонок»</span>
          <span>Время — {tzText}</span>
        </div>
      </footer>
    </div>
  );
}
