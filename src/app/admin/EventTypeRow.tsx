'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createApiClient } from '@/lib/sdk/client';
import { failureFromApiError, formatDuration, eventTypeFormFromEventType } from './admin-logic';
import { EventTypeForm } from './EventTypeForm';

// Строка типа события в списке (D1): просмотр → правка (PUT) → двухшаговое
// удаление (DELETE). Каскад D4 разрушителен — «Удалить» сначала раскрывает
// явное предупреждение «брони этого типа будут удалены», и только повторный
// клик отправляет DELETE. Список — серверная истина: после любой мутации
// router.refresh() (ADR-004); 404 (удалён в другом окне) сводится к тому же
// refresh. Нативный confirm не используется: предупреждение должно быть
// видно в e2e-сценариях (#37).

export interface EventTypeRowData {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
}

type RowMode = 'view' | 'editing' | 'confirming';

export function EventTypeRow({ eventType }: { eventType: EventTypeRowData }) {
  const router = useRouter();
  const [mode, setMode] = useState<RowMode>('view');
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function onDelete(): Promise<void> {
    setPending(true);
    setNotice(null);
    const api = createApiClient();
    try {
      const { error } = await api.DELETE('/api/v1/event-types/{id}', {
        params: { path: { id: eventType.id } },
      });
      if (error) {
        const failure = failureFromApiError(error);
        if (failure.kind !== 'notFound') {
          setNotice('не удалось удалить тип — попробуйте ещё раз');
        }
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

  if (mode === 'editing') {
    return (
      <li className="px-5 sm:px-7 py-5">
        <EventTypeForm
          id={eventType.id}
          initial={eventTypeFormFromEventType(eventType)}
          submitLabel="Сохранить изменения"
          onSaved={() => setMode('view')}
          onCancel={() => setMode('view')}
        />
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3 px-5 sm:px-7 py-4">
      {mode === 'confirming' ? (
        <div
          role="alert"
          className="rounded-xl border border-clay/40 bg-clay-soft px-4 py-3.5 text-[13.5px] text-clay-deep"
        >
          <p>
            Удалить тип «{eventType.title}»?{' '}
            <strong className="font-semibold">Брони этого типа будут удалены</strong> — время
            освободится для остальных типов.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={onDelete}
              className="h-10 px-4 rounded-xl bg-clay-deep hover:bg-clay active:translate-y-px text-white text-[13.5px] font-semibold transition disabled:opacity-60"
            >
              {pending ? 'Удаляем…' : 'Да, удалить'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setMode('view')}
              className="h-10 px-4 rounded-xl border border-line bg-card text-[13.5px] font-semibold text-muted hover:text-ink transition disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[14.5px] font-semibold truncate">{eventType.title}</p>
            {eventType.description && (
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted line-clamp-2 max-w-[54ch]">
                {eventType.description}
              </p>
            )}
          </div>
          <span className="shrink-0 text-[12px] font-semibold rounded-full bg-sage-soft text-sage px-2.5 py-1 whitespace-nowrap">
            {formatDuration(eventType.durationMinutes)}
          </span>
          <div className="shrink-0 flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setMode('editing');
              }}
              title="Изменить тип"
              aria-label={`Изменить тип: ${eventType.title}`}
              className="grid place-items-center size-9 rounded-lg text-faint hover:text-sage hover:bg-sage-soft transition"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => {
                setNotice(null);
                setMode('confirming');
              }}
              title="Удалить тип"
              aria-label={`Удалить тип: ${eventType.title}`}
              className="grid place-items-center size-9 rounded-lg text-faint hover:text-clay hover:bg-clay-soft transition"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p role="alert" className="text-[12.5px] font-medium text-clay">
          {notice}
        </p>
      )}
    </li>
  );
}
