import Link from 'next/link';
import { createServerApiClient } from '@/lib/sdk/server';
import { getAppTz } from '@/lib/time/app-tz';
import { tzLabel } from '@/lib/time/display';
import { BookingFlow } from './BookingFlow';
import { buildBookingCalendar } from './booking-logic';

// Публичная страница бронирования (FR-003): только свободные будущие
// интервалы, времена — в APP_TZ с явным поясом (ADR-009), форматирование —
// на сервере. Чтение — RSC self-fetch через SDK с дефолтным окном API
// (сейчас + 31 день, ADR-004/010); интерактив и мутации — в BookingFlow.

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const appTz = getAppTz();
  const now = new Date();
  const tzText = tzLabel(appTz, now);

  const api = await createServerApiClient();
  const { data } = await api.GET('/api/v1/slots', { params: { query: { view: 'free' } } });
  // self-fetch того же процесса падает только вместе со всей страницей;
  // при частичном отказе показываем карточку повтора вместо календаря
  const slots = data?.slots ?? null;
  const calendar = slots ? buildBookingCalendar(slots, appTz, now) : null;

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
          <Link
            href="/admin"
            className="text-[13.5px] sm:text-sm font-medium text-muted hover:text-sage transition-colors whitespace-nowrap"
          >
            Панель владельца&nbsp;&rarr;
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-8 sm:pt-12 pb-16 flex-1">
        <div className="grid lg:grid-cols-12 gap-8 lg:gap-10">
          <aside className="lg:col-span-3">
            <div className="lg:sticky lg:top-8">
              <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-sage">
                Бронирование
              </p>
              <h1 className="mt-3 text-[30px] leading-[1.14] sm:text-[34px] font-extrabold tracking-tight">
                Запишитесь на&nbsp;звонок
              </h1>
              <p className="mt-4 text-[15px] leading-relaxed text-muted">
                Выберите день в календаре, окно и оставьте контакты. Бронь подтверждается сразу
                после отправки формы.
              </p>

              <dl className="mt-7 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <svg
                    className="shrink-0 text-sage"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                  <dt className="text-ink font-medium">До 30 минут</dt>
                </div>
                <div className="flex items-center gap-3">
                  <svg
                    className="shrink-0 text-sage"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
                  </svg>
                  <dt className="text-ink font-medium">Звонок по телефону или видеосвязи</dt>
                </div>
                <div className="flex items-center gap-3">
                  <svg
                    className="shrink-0 text-sage"
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="4" />
                    <path d="M8 2v4M16 2v4M3 10h18" />
                  </svg>
                  <dt className="text-ink font-medium">Запись открыта на&nbsp;месяц вперёд</dt>
                </div>
              </dl>

              <p className="mt-8 text-[13px] leading-relaxed text-muted border-l-2 border-line pl-4">
                Все времена — <span className="font-semibold text-ink">{tzText}</span>. Слот
                закрепляется за первым, кто завершил бронирование.
              </p>
            </div>
          </aside>

          {calendar ? (
            <BookingFlow calendar={calendar} tzText={tzText} />
          ) : (
            <section
              aria-label="Ошибка загрузки расписания"
              className="lg:col-span-9 rounded-2xl border border-line bg-card px-6 py-12 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
            >
              <p className="text-[15px] font-semibold">Не удалось загрузить расписание</p>
              <p className="mt-1.5 text-[13.5px] text-muted">
                Обновите страницу и попробуйте ещё раз.
              </p>
            </section>
          )}
        </div>
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
