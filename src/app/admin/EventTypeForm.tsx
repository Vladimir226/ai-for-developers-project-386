'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createApiClient } from '@/lib/sdk/client';
import {
  emptyEventTypeForm,
  eventTypeDraftFromForm,
  failureFromApiError,
  splitIssues,
  validateEventTypeForm,
  type EventTypeFormValues,
  type FieldErrors,
} from './admin-logic';

// Форма типа события (D1): создание (POST) и редактирование (PUT) — один
// компонент, режим задаётся `id`. Мутация — SDK + router.refresh() (ADR-004),
// интерпретация ответа — только по error.code (ADR-005): полевые 422
// подсвечивают поля, прочее уходит в баннер. Локальная валидация — косметика
// до отправки, право veto — за сервером.

const KNOWN_FIELDS = ['title', 'description', 'durationMinutes'] as const;

interface EventTypeFormProps {
  /** id типа — режим редактирования (PUT); без id — создание (POST). */
  id?: string;
  initial?: EventTypeFormValues;
  submitLabel: string;
  /** Вызывается после успешной мутации (выход из режима правки строки). */
  onSaved?: () => void;
  onCancel?: () => void;
}

export function EventTypeForm({ id, initial, submitLabel, onSaved, onCancel }: EventTypeFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<EventTypeFormValues>(initial ?? emptyEventTypeForm());
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<string[] | null>(null);
  const [pending, setPending] = useState(false);

  function patch(patchValues: Partial<EventTypeFormValues>): void {
    setValues((v) => ({ ...v, ...patchValues }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBanner(null);

    const localErrors = validateEventTypeForm(values);
    if (Object.keys(localErrors).length > 0) {
      setFieldErrors(localErrors);
      return;
    }
    setFieldErrors({});

    setPending(true);
    const api = createApiClient();
    const body = eventTypeDraftFromForm(values);
    try {
      const result = id
        ? await api.PUT('/api/v1/event-types/{id}', { params: { path: { id } }, body })
        : await api.POST('/api/v1/event-types', { body });

      if (result.data) {
        if (!id) setValues(emptyEventTypeForm());
        router.refresh();
        onSaved?.();
        return;
      }

      const failure = failureFromApiError(result.error);
      if (failure.kind === 'invalid') {
        const split = splitIssues(failure.issues, KNOWN_FIELDS);
        setFieldErrors(split.fieldErrors);
        // баннер — только для того, что не нашло места под полем
        const messages =
          split.otherMessages.length > 0
            ? split.otherMessages
            : Object.keys(split.fieldErrors).length === 0
              ? [failure.message ?? 'проверьте поля формы и попробуйте ещё раз']
              : [];
        if (messages.length > 0) setBanner(messages);
      } else if (failure.kind === 'notFound') {
        // тип удалён в другом окне: refresh покажет фактический список
        setBanner([failure.message]);
        router.refresh();
      } else {
        setBanner(['не удалось сохранить тип — попробуйте ещё раз']);
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

      <div className="space-y-4">
        <div>
          <label
            htmlFor={`title-${id ?? 'new'}`}
            className="block text-[13px] font-semibold mb-1.5"
          >
            Название
          </label>
          <input
            id={`title-${id ?? 'new'}`}
            name="title"
            className={`field${fieldErrors['title'] ? ' field-invalid' : ''}`}
            value={values.title}
            onChange={(e) => patch({ title: e.target.value })}
            placeholder="Например: Знакомственный звонок"
            autoComplete="off"
            maxLength={120}
            aria-invalid={Boolean(fieldErrors['title'])}
            aria-describedby={fieldErrors['title'] ? `title-error-${id ?? 'new'}` : undefined}
          />
          {fieldErrors['title'] && (
            <p
              id={`title-error-${id ?? 'new'}`}
              className="mt-1.5 text-[12.5px] font-medium text-clay"
            >
              {fieldErrors['title']}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`description-${id ?? 'new'}`}
            className="block text-[13px] font-semibold mb-1.5"
          >
            Описание <span className="font-normal text-faint">— необязательно</span>
          </label>
          <textarea
            id={`description-${id ?? 'new'}`}
            name="description"
            className={`field !h-auto min-h-20 py-2.5 resize-y${fieldErrors['description'] ? ' field-invalid' : ''}`}
            value={values.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="Что обсудим и как пройдёт звонок"
            maxLength={600}
            aria-invalid={Boolean(fieldErrors['description'])}
            aria-describedby={
              fieldErrors['description'] ? `description-error-${id ?? 'new'}` : undefined
            }
          />
          {fieldErrors['description'] && (
            <p
              id={`description-error-${id ?? 'new'}`}
              className="mt-1.5 text-[12.5px] font-medium text-clay"
            >
              {fieldErrors['description']}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor={`duration-${id ?? 'new'}`}
            className="block text-[13px] font-semibold mb-1.5"
          >
            Длительность, минуты
          </label>
          <input
            id={`duration-${id ?? 'new'}`}
            name="durationMinutes"
            type="number"
            className={`field${fieldErrors['durationMinutes'] ? ' field-invalid' : ''}`}
            value={values.durationMinutes}
            onChange={(e) => patch({ durationMinutes: e.target.value })}
            placeholder="30"
            min={15}
            max={180}
            step={1}
            inputMode="numeric"
            aria-invalid={Boolean(fieldErrors['durationMinutes'])}
            aria-describedby={
              fieldErrors['durationMinutes'] ? `duration-error-${id ?? 'new'}` : undefined
            }
          />
          {fieldErrors['durationMinutes'] && (
            <p
              id={`duration-error-${id ?? 'new'}`}
              className="mt-1.5 text-[12.5px] font-medium text-clay"
            >
              {fieldErrors['durationMinutes']}
            </p>
          )}
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            От 15 до 180 минут — длительность станет и шагом слотов (D2).
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-12 px-6 rounded-xl bg-sage hover:bg-sage-deep active:translate-y-px text-white text-[15px] font-semibold transition disabled:opacity-60"
        >
          {pending ? 'Сохраняем…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="h-12 px-4 rounded-xl border border-line text-[14px] font-semibold text-muted hover:text-ink hover:border-muted/50 transition disabled:opacity-50"
          >
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}
