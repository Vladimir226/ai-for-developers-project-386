'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createApiClient } from '@/lib/sdk/client';
import { countActiveBookings } from '@/lib/time/display';
import { cancelNoticeText, cancelOutcomeFromApiError, type BookingCard } from './admin-logic';

// Секция «Брони» (тикет #8, макет admin.html #13): карточки приходят с сервера
// (тот же RSC self-fetch GET /api/v1/bookings, что питает бейджи «Забронирован»;
// надписи готовы в APP_TZ — ADR-009). Отмена — SDK DELETE + router.refresh()
// без клиентского стора (ADR-004/010). 404 — бронь уже отменена в другом окне:
// короткое уведомление по error.code (ADR-005) живёт на уровне секции, чтобы
// пережить refresh и не пропасть вместе со строкой списка; сетевой сбой — тот
// же refresh в finally (паттерн DeleteSlotButton): список — серверная истина.

interface BookingListProps {
  bookings: BookingCard[] | null;
  tzText: string;
}

export function BookingList({ bookings, tzText }: BookingListProps) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onCancel(id: string): Promise<void> {
    if (pendingId) return;
    setPendingId(id);
    setNotice(null);
    const api = createApiClient();
    try {
      const { error } = await api.DELETE('/api/v1/bookings/{id}', {
        params: { path: { id } },
      });
      if (error) setNotice(cancelNoticeText(cancelOutcomeFromApiError(error)));
    } catch {
      // сетевой сбой: без локального текста — refresh покажет фактическое
      // состояние (паттерн DeleteSlotButton)
    } finally {
      router.refresh();
      setPendingId(null);
    }
  }

  if (bookings === null) {
    return (
      <section
        aria-label="Брони"
        className="rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
      >
        <div className="px-6 py-12 text-center">
          <p className="text-[15px] font-semibold">Не удалось загрузить брони</p>
          <p className="mt-1.5 text-[13.5px] text-muted">Обновите страницу и попробуйте ещё раз.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Брони"
      className="rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
    >
      <div className="flex items-baseline justify-between px-5 sm:px-7 pt-6 pb-4">
        <h2 className="text-[19px] font-bold tracking-tight">Брони</h2>
        <span className="text-[12.5px] text-muted">{countActiveBookings(bookings.length)}</span>
      </div>

      {notice && (
        <div
          role="status"
          className="mx-5 sm:mx-7 rounded-xl border border-line bg-warmgray px-4 py-3 text-[13.5px] text-ink"
        >
          {notice}
        </div>
      )}

      {bookings.length === 0 ? (
        <div className="border-t border-line px-6 py-12 text-center">
          <p className="text-[15px] font-semibold">Броней ещё нет</p>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Как только кто-то запишется, бронь появится здесь.
          </p>
        </div>
      ) : (
        <ul className="border-t border-line divide-y divide-line">
          {bookings.map((booking) => (
            <li key={booking.id} className="px-5 sm:px-7 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold">{booking.bookerName}</p>
                  <p className="mt-0.5 text-[13.5px] text-muted">{booking.bookerContact}</p>
                  <p className="mt-2 text-[13.5px] text-muted">
                    <span className="font-semibold text-ink">{booking.timeLabel}</span> · {tzText}
                  </p>
                  {booking.comment !== null && (
                    <p className="mt-1.5 text-[13.5px] italic text-muted max-w-[52ch]">
                      «{booking.comment}»
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={pendingId !== null}
                  onClick={() => onCancel(booking.id)}
                  aria-label={`Отменить бронь: ${booking.bookerName}, ${booking.timeLabel}`}
                  className="shrink-0 h-10 px-4 rounded-xl border border-line text-[13.5px] font-semibold text-clay hover:border-clay/50 hover:bg-clay-soft transition disabled:opacity-50"
                >
                  {pendingId === booking.id ? 'Отменяем…' : 'Отменить бронь'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
