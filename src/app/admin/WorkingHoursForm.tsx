'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createApiClient } from '@/lib/sdk/client';
import {
  buildWorkingHoursBody,
  failureFromApiError,
  splitIssues,
  validateWeekRows,
  WEEKDAY_LABELS,
  weekRowsFromDays,
  type FieldErrors,
  type WorkingDayRow,
  type WorkingHoursDayJson,
} from './admin-logic';

// Редактор рабочих часов (D3): 7 строк Пн..Вс, каждая — либо время
// начало/конец с шагом 30 минут, либо чекбокс «Выходной». Сохранение — PUT
// всей недели (частичных обновлений нет), мутация SDK + router.refresh()
// (ADR-004). Времена — «настенные», зона APP_TZ (ADR-009). Серверные 422
// (дубли дней, start ≥ end) приходят с ключами `days.<weekday>…` — индекс
// массива равен weekday, потому что тело сортируется перед отправкой, и
// ошибки ложатся в те же места, что и локальные.

interface WorkingHoursFormProps {
  /** Дни из GET или null, когда прочитать не удалось (форма стартует с D3). */
  initialDays: readonly WorkingHoursDayJson[] | null;
}

export function WorkingHoursForm({ initialDays }: WorkingHoursFormProps) {
  const router = useRouter();
  const [rows, setRows] = useState<WorkingDayRow[]>(() => weekRowsFromDays(initialDays));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const knownFields = rows.flatMap((row) => [
    `days.${row.weekday}.startMinutes`,
    `days.${row.weekday}.endMinutes`,
  ]);

  function patchRow(weekday: number, patch: Partial<WorkingDayRow>): void {
    setRows((rs) => rs.map((r) => (r.weekday === weekday ? { ...r, ...patch } : r)));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBanner(null);
    setSaved(false);

    const localErrors = validateWeekRows(rows);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }
    setFieldErrors({});

    setPending(true);
    const api = createApiClient();
    try {
      const { error } = await api.PUT('/api/v1/working-hours', {
        body: buildWorkingHoursBody(rows),
      });
      if (!error) {
        setSaved(true);
        router.refresh();
        return;
      }

      const failure = failureFromApiError(error);
      if (failure.kind === 'invalid') {
        // known — только полевые ключи дней; недели-уровень (`days`: дубли,
        // «ровно 7 дней») не привязан к полю и должен попасть в баннер
        const split = splitIssues(failure.issues, knownFields);
        setFieldErrors(split.fieldErrors);
        if (split.otherMessages.length > 0) {
          setBanner(split.otherMessages);
        } else if (Object.keys(split.fieldErrors).length === 0) {
          setBanner([failure.message ?? 'проверьте часы и попробуйте ещё раз']);
        }
      } else {
        setBanner(['не удалось сохранить часы — попробуйте ещё раз']);
      }
    } catch {
      setBanner(['нет связи с сервером — проверьте соединение и попробуйте ещё раз']);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      {banner && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-clay/40 bg-clay-soft p-4 text-[13.5px] text-clay-deep"
        >
          <ul className="list-disc pl-4 space-y-1">
            {banner.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
      {saved && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-sage/30 bg-sage-soft px-4 py-3 text-[13.5px] font-semibold text-sage-deep"
        >
          Часы недели сохранены — слоты пересчитались.
        </div>
      )}

      <div className="space-y-2">
        {rows.map((row) => {
          const startError = fieldErrors[`days.${row.weekday}.startMinutes`];
          const endError = fieldErrors[`days.${row.weekday}.endMinutes`];
          return (
            <div
              key={row.weekday}
              className="grid grid-cols-[44px_1fr_1fr_112px] items-start gap-2.5 sm:gap-3"
            >
              <span
                className={`h-11 grid place-items-center text-[13.5px] font-bold ${row.isDayOff ? 'text-faint' : 'text-ink'}`}
              >
                {WEEKDAY_LABELS[row.weekday]}
              </span>
              <div>
                <label className="sr-only" htmlFor={`start-${row.weekday}`}>
                  Начало дня {WEEKDAY_LABELS[row.weekday]}
                </label>
                <input
                  id={`start-${row.weekday}`}
                  type="time"
                  step={1800}
                  className={`field${startError ? ' field-invalid' : ''}`}
                  value={row.isDayOff ? '' : row.start}
                  onChange={(e) => patchRow(row.weekday, { start: e.target.value })}
                  disabled={row.isDayOff}
                  aria-invalid={Boolean(startError)}
                  aria-describedby={startError ? `start-error-${row.weekday}` : undefined}
                />
                {startError && (
                  <p
                    id={`start-error-${row.weekday}`}
                    className="mt-1 text-[12px] font-medium text-clay"
                  >
                    {startError}
                  </p>
                )}
              </div>
              <div>
                <label className="sr-only" htmlFor={`end-${row.weekday}`}>
                  Конец дня {WEEKDAY_LABELS[row.weekday]}
                </label>
                <input
                  id={`end-${row.weekday}`}
                  type="time"
                  step={1800}
                  className={`field${endError ? ' field-invalid' : ''}`}
                  value={row.isDayOff ? '' : row.end}
                  onChange={(e) => patchRow(row.weekday, { end: e.target.value })}
                  disabled={row.isDayOff}
                  aria-invalid={Boolean(endError)}
                  aria-describedby={endError ? `end-error-${row.weekday}` : undefined}
                />
                {endError && (
                  <p
                    id={`end-error-${row.weekday}`}
                    className="mt-1 text-[12px] font-medium text-clay"
                  >
                    {endError}
                  </p>
                )}
              </div>
              <label
                className={`h-11 px-3 flex items-center gap-2 rounded-xl border text-[13px] font-semibold cursor-pointer select-none transition ${
                  row.isDayOff
                    ? 'border-transparent bg-warmgray text-ink'
                    : 'border-line text-muted hover:border-muted/40'
                }`}
              >
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-sage)]"
                  checked={row.isDayOff}
                  onChange={(e) => patchRow(row.weekday, { isDayOff: e.target.checked })}
                />
                Выходной
              </label>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-12 px-6 rounded-xl bg-sage hover:bg-sage-deep active:translate-y-px text-white text-[15px] font-semibold transition disabled:opacity-60"
        >
          {pending ? 'Сохраняем…' : 'Сохранить часы'}
        </button>
        <p className="text-[12.5px] leading-relaxed text-muted">
          Вся неделя сохраняется целиком; перерывы внутри дня не поддерживаются.
        </p>
      </div>
    </form>
  );
}
