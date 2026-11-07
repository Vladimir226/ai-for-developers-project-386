'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { createApiClient } from '@/lib/sdk/client';
import { wallTimeToUtcIso } from '@/lib/time/wall-time';
import { countIntervals, formatInterval, formatTimeRange } from '@/lib/time/display';
import {
  adminWindow,
  findOverlappingSlot,
  outcomeFromApiError,
  type SubmitFailure,
} from './admin-logic';

// Мультиввод интервалов (FR-001): строки — контролируемое состояние, поэтому
// после частичного успеха в форме остаются только неопубликованные строки с
// введёнными значениями. Мутация — SDK POST (ADR-010) построчно; интерпретация
// ответа — только по error.code (ADR-005): строки публикуются по отдельности,
// частичный успех честно показывается двумя баннерами макета.

interface Row {
  key: number;
  date: string;
  start: string;
  end: string;
}

/** Строка после отправки: ISO-метки для подсказок и исход ответа API. */
interface SentRow extends Row {
  startsAt: string;
  endsAt: string;
  label: string;
  outcome: SubmitFailure['kind'];
  messages: string[];
}

export function PublishForm({ appTz }: { appTz: string }) {
  const router = useRouter();
  const nextKey = useRef(1);
  const [rows, setRows] = useState<Row[]>([{ key: 0, date: '', start: '', end: '' }]);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState<{ created: number; total: number } | null>(null);
  const [failure, setFailure] = useState<{ title: string; items: string[] } | null>(null);

  function patchRow(key: number, patch: Partial<Row>): void {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addRow(): void {
    setRows((rs) => [...rs, { key: nextKey.current++, date: '', start: '', end: '' }]);
  }

  function removeRow(key: number): void {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== key) : rs));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setSuccess(null);
    setFailure(null);

    const api = createApiClient();
    const failed: SentRow[] = [];
    let created = 0;

    for (const row of rows) {
      let attempt: SentRow;
      try {
        // конвертация «настенного» времени в UTC — чистая утилита (аддендум #5);
        // пустые значения отсечены native required
        const startsAt = wallTimeToUtcIso(row.date, row.start, appTz);
        const endsAt = wallTimeToUtcIso(row.date, row.end, appTz);
        attempt = {
          ...row,
          startsAt,
          endsAt,
          label: formatInterval(startsAt, endsAt, appTz),
          outcome: 'unknown',
          messages: [],
        };
      } catch {
        attempt = {
          ...row,
          startsAt: '',
          endsAt: '',
          label: `${row.date} ${row.start}–${row.end}`.trim(),
          outcome: 'invalid',
          messages: ['проверьте дату и время'],
        };
      }

      if (attempt.outcome === 'invalid' && !attempt.startsAt) {
        failed.push(attempt);
        continue;
      }

      try {
        const { data, error } = await api.POST('/api/v1/slots', {
          body: { startsAt: attempt.startsAt, endsAt: attempt.endsAt },
        });
        if (data) {
          created += 1;
          continue;
        }
        const outcome = outcomeFromApiError(error);
        failed.push({
          ...attempt,
          outcome: outcome.kind,
          messages: outcome.kind === 'invalid' ? outcome.messages : [],
        });
      } catch {
        failed.push({ ...attempt, outcome: 'network', messages: [] });
      }
    }

    if (failed.some((f) => f.outcome === 'overlap')) {
      // подсказка «пересекается с 11:00–11:30»: список свежий, потому что
      // часть конфликтов — строки, опубликованные этим же заходом
      try {
        const { data } = await api.GET('/api/v1/slots', {
          params: { query: { view: 'all', ...adminWindow() } },
        });
        const slots = data?.slots ?? [];
        for (const f of failed) {
          if (f.outcome !== 'overlap' || !f.startsAt) continue;
          const conflict = findOverlappingSlot({ startsAt: f.startsAt, endsAt: f.endsAt }, slots);
          if (conflict) {
            f.messages = [
              `пересекается с ${formatTimeRange(conflict.startsAt, conflict.endsAt, appTz)}`,
            ];
          }
        }
      } catch {
        // без подсказки останется общий текст пересечения
      }
    }

    if (created > 0) {
      setSuccess({ created, total: rows.length });
      router.refresh();
    }
    if (failed.length > 0) {
      setFailure(composeFailure(failed));
      setRows((rs) => rs.filter((r) => failed.some((f) => f.key === r.key)));
    } else {
      setRows([{ key: nextKey.current++, date: '', start: '', end: '' }]);
    }
    setPending(false);
  }

  return (
    <>
      {success && (
        <div
          role="status"
          className="mt-5 rounded-xl border border-sage/30 bg-sage-soft px-4 py-3 flex items-center gap-3 text-[14px]"
        >
          <svg
            className="shrink-0 text-sage"
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-sage-deep">
            <strong className="font-semibold">
              {success.created === success.total
                ? `Опубликовано: ${countIntervals(success.created)}`
                : `Опубликовано: ${success.created} из ${success.total} интервалов`}
            </strong>{' '}
            — они сразу видны на публичной странице.
          </span>
        </div>
      )}

      <form className="mt-5" onSubmit={onSubmit}>
        {failure && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-clay/40 bg-clay-soft p-4 text-[13.5px] text-clay-deep"
          >
            <div className="flex gap-2.5">
              <svg
                className="shrink-0 mt-px"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 8v5M12 16.5v.01" />
                <path d="M10.3 3.9 2.5 17.4A1.9 1.9 0 0 0 4.2 20.3h15.6a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0z" />
              </svg>
              <div>
                <strong className="font-semibold">{failure.title}</strong>
                <ul className="mt-1.5 list-disc pl-4 space-y-1 text-clay-deep/85">
                  {failure.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-[1fr_84px_84px_32px] gap-2 text-[12px] font-semibold text-muted mb-2 px-0.5">
          <span>Дата</span>
          <span>Начало</span>
          <span>Конец</span>
          <span className="sr-only">Действия</span>
        </div>

        <div className="space-y-2.5">
          {rows.map((row, index) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_84px_84px_32px] gap-2 items-center interval-row"
            >
              <input
                type="date"
                name="row-date"
                aria-label={`Дата интервала ${index + 1}`}
                className="field min-w-0"
                required
                value={row.date}
                onChange={(e) => patchRow(row.key, { date: e.target.value })}
              />
              <input
                type="time"
                name="row-start"
                aria-label={`Начало интервала ${index + 1}`}
                className="field"
                required
                value={row.start}
                onChange={(e) => patchRow(row.key, { start: e.target.value })}
              />
              <input
                type="time"
                name="row-end"
                aria-label={`Конец интервала ${index + 1}`}
                className="field"
                required
                value={row.end}
                onChange={(e) => patchRow(row.key, { end: e.target.value })}
              />
              <button
                type="button"
                onClick={() => removeRow(row.key)}
                disabled={rows.length <= 1 || pending}
                title="Удалить строку"
                aria-label={`Удалить строку ${index + 1}`}
                className="grid place-items-center size-8 rounded-lg text-faint hover:text-clay hover:bg-clay-soft transition disabled:opacity-50"
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                >
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={pending}
          className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-sage hover:text-sage-deep transition-colors disabled:opacity-50"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Добавить строку
        </button>

        <button
          type="submit"
          disabled={pending}
          className="mt-5 w-full h-12 rounded-xl bg-sage hover:bg-sage-deep active:translate-y-px text-white text-[15px] font-semibold transition disabled:opacity-60"
        >
          {pending ? 'Публикуем…' : 'Опубликовать интервалы'}
        </button>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          Прошедшие интервалы и интервалы с концом раньше начала отклоняются с пояснением.
        </p>
      </form>
    </>
  );
}

/** Заголовок и строки алерта ошибки — по составу неудач (макет #13). */
function composeFailure(failed: readonly SentRow[]): { title: string; items: string[] } {
  const hasOverlap = failed.some((f) => f.outcome === 'overlap');
  const hasNetwork = failed.some((f) => f.outcome === 'network');

  const title = hasOverlap
    ? 'Интервалы пересекаются с опубликованными'
    : hasNetwork
      ? 'Не удалось связаться с сервером'
      : 'Проверьте интервалы';

  const items = failed.map((f) => {
    if (f.outcome === 'network') {
      return 'Не удалось связаться с сервером — попробуйте ещё раз';
    }
    if (f.outcome === 'overlap') {
      return `${f.label} — ${f.messages[0] ?? 'пересекается с опубликованным интервалом'}`;
    }
    if (f.outcome === 'invalid') {
      return `${f.label} — ${f.messages.join('; ') || 'проверьте поля'}`;
    }
    return `${f.label} — не удалось опубликовать, попробуйте ещё раз`;
  });

  return { title, items };
}
