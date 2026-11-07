'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createApiClient } from '@/lib/sdk/client';
import { cancelFailureNotice, failureFromApiError, type BookingCardData } from './admin-logic';

// Карточка предстоящей брони (#36): тип встречи, диапазон в APP_TZ, имя,
// контакт, комментарий. Отмена — двухшаговая: «Отменить» раскрывает явное
// подтверждение, повторный клик отправляет DELETE /api/v1/bookings/{id}.
// Нативный confirm не используется — предупреждение должно быть видно в
// e2e-сценариях (#37), как и у удаления типа (D4). После мутации —
// router.refresh(): список — серверная истина (ADR-004); 404 (бронь уже
// отменена в другом окне) молча сводится к тому же refresh.

type CardMode = 'view' | 'confirming';

export function BookingCard({ booking }: { booking: BookingCardData }) {
  const router = useRouter();
  const [mode, setMode] = useState<CardMode>('view');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onCancel(): Promise<void> {
    setPending(true);
    setNotice(null);
    const api = createApiClient();
    try {
      const { error } = await api.DELETE('/api/v1/bookings/{id}', {
        params: { path: { id: booking.id } },
      });
      if (error) {
        // null — бронь уже исчезла: refresh уберёт карточку без сообщения
        setNotice(cancelFailureNotice(failureFromApiError(error)));
      }
    } catch {
      setNotice('нет связи с сервером — попробуйте ещё раз');
    } finally {
      // refresh и при ошибке: список — серверная истина (ADR-004)
      router.refresh();
      setPending(false);
      setMode('view');
    }
  }

  return (
    <li className="px-5 sm:px-7 py-5">
      {mode === 'confirming' ? (
        <div
          role="alert"
          className="rounded-xl border border-clay/40 bg-clay-soft px-4 py-3.5 text-[13.5px] text-clay-deep"
        >
          <p>
            Отменить встречу «{booking.eventTypeTitle}» с{' '}
            <strong className="font-semibold">{booking.bookerName}</strong> ({booking.when})?{' '}
            <strong className="font-semibold">Время снова станет свободным</strong> для всех типов.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={onCancel}
              className="h-10 px-4 rounded-xl bg-clay-deep hover:bg-clay active:translate-y-px text-white text-[13.5px] font-semibold transition disabled:opacity-60"
            >
              {pending ? 'Отменяем…' : 'Да, отменить'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode('view')}
              className="h-10 px-4 rounded-xl border border-line bg-card text-[13.5px] font-semibold text-muted hover:text-ink transition disabled:opacity-50"
            >
              Оставить
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-bold truncate">{booking.bookerName}</p>
            <p className="mt-0.5 text-[13.5px] text-muted">{booking.bookerContact}</p>
            <p className="mt-2 text-[13.5px] text-muted">
              <span className="font-semibold text-ink">{booking.eventTypeTitle}</span> ·{' '}
              <span className="font-semibold text-ink">{booking.when}</span>
            </p>
            {booking.comment && (
              <p className="mt-1.5 text-[13.5px] italic text-muted max-w-[52ch]">
                «{booking.comment}»
              </p>
            )}
          </div>
          <div className="shrink-0 flex items-center gap-2">
            <span className="text-[12px] font-semibold rounded-full bg-sage-soft text-sage px-2.5 py-1 whitespace-nowrap">
              {booking.durationLabel}
            </span>
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setMode('confirming');
              }}
              title="Отменить бронь"
              aria-label={`Отменить броню: ${booking.bookerName}, ${booking.eventTypeTitle}, ${booking.when}`}
              className="h-10 px-4 rounded-xl border border-line text-[13.5px] font-semibold text-clay hover:border-clay/50 hover:bg-clay-soft transition"
            >
              Отменить
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="alert" className="mt-3 text-[12.5px] font-medium text-clay">
          {notice}
        </p>
      )}
    </li>
  );
}
