// Список предстоящих броней всех гостей — публичная страница «Предстоящие
// записи» (#57, ADR-0012): источник — GET /api/v1/bookings?upcoming=true,
// фильтр «конец ≥ сейчас» делает сервер (секция «Брони» админки, #36).
// Полностью серверный рендер: страница read-only, клиентских компонентов
// и мутаций нет. Пустое состояние — «Предстоящих звонков нет» с CTA на
// публичную страницу (прототип events.html, #13).

import Link from 'next/link';
import type { BookingJson } from '../admin/admin-logic';
import { upcomingCardFromBooking } from './bookings-logic';

interface UpcomingListProps {
  bookings: readonly BookingJson[] | null;
  timeZone: string;
  tzText: string;
}

export function UpcomingList({ bookings, timeZone, tzText }: UpcomingListProps) {
  // null отличается от пустого списка: деградация без данных — как у
  // секций админки (self-fetch падает только вместе со всей страницей)
  if (!bookings) {
    return (
      <section
        aria-label="Предстоящие записи"
        className="mt-8 rounded-2xl border border-line bg-card px-6 py-14 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
      >
        <p className="text-[15px] font-semibold">Не удалось загрузить записи</p>
        <p className="mt-1.5 text-[13.5px] text-muted">Обновите страницу и попробуйте ещё раз.</p>
      </section>
    );
  }

  if (bookings.length === 0) {
    return (
      <section
        aria-label="Предстоящие записи"
        className="mt-8 rounded-2xl border border-line bg-card px-6 py-14 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
      >
        <span className="mx-auto grid place-items-center size-14 rounded-full bg-sage-soft text-sage">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 2v4M16 2v4M3 10h18" />
            <rect x="3" y="4" width="18" height="18" rx="4" />
            <path d="M9 14h6M9 17.5h3" />
          </svg>
        </span>
        <h2 className="mt-5 text-[19px] font-bold tracking-tight">Предстоящих звонков нет</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted max-w-[36ch] mx-auto">
          Запишитесь на звонок — подтверждённая бронь появится на этой странице.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center px-5 rounded-xl bg-sage hover:bg-sage-deep text-white text-[14.5px] font-semibold transition"
        >
          Записаться на звонок
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="Предстоящие записи">
      <ul className="mt-8 space-y-4">
        {bookings.map((booking) => {
          const card = upcomingCardFromBooking(booking, timeZone);
          return (
            <li
              key={booking.id}
              className="rounded-2xl border border-line bg-card p-5 shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex gap-3.5 min-w-0">
                  <span className="grid place-items-center size-11 shrink-0 rounded-full bg-sage-soft text-sage">
                    <svg
                      width="19"
                      height="19"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <p className="text-[16.5px] font-bold tracking-tight">{card.eventTypeTitle}</p>
                    <p className="mt-1 text-[13.5px] text-muted">{card.when}</p>
                    <p className="mt-0.5 text-[13.5px] text-muted">
                      {tzText} · создана {card.createdLabel}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[11.5px] font-semibold rounded-full px-2.5 py-1 bg-sage-soft text-sage">
                  Подтверждена
                </span>
              </div>
              <div className="mt-4 pt-4 border-t border-line grid gap-1.5 text-[14px] sm:grid-cols-2">
                <p>
                  <span className="text-muted">Имя:</span>{' '}
                  <span className="font-semibold">{card.bookerName}</span>
                </p>
                <p>
                  <span className="text-muted">Контакт:</span>{' '}
                  <span className="font-semibold break-all">{card.bookerContact}</span>
                </p>
                {card.comment && (
                  <p className="italic text-muted sm:col-span-2">«{card.comment}»</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
