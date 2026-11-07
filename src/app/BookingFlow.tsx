'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createApiClient } from '@/lib/sdk/client';
import {
  bookingBanner,
  bookingFailureFromApiError,
  countWindows,
  firstOpenDateKey,
  type BookingCalendar,
  type BookingFailure,
  type CalendarCell,
} from './booking-logic';

// Интерактив публичной страницы (FR-003): выбор дня и окна, форма брони,
// подтверждение. Данные и подписи приходят с сервера (RSC, ADR-009 — клиент
// не преобразует зоны); мутация — SDK POST /api/v1/bookings + router.refresh()
// (ADR-004, ADR-010). Ошибки — только по error.code (ADR-005): 409 баннером
// макета со свежим списком, 422 — подсказками clay у полей.

/** Снимок успешной брони: локальное состояние, не зависит от refresh. */
interface SuccessInfo {
  dayTitle: string;
  timeLabel: string;
  name: string;
  contact: string;
}

export function BookingFlow({ calendar, tzText }: { calendar: BookingCalendar; tzText: string }) {
  const router = useRouter();
  const api = createApiClient();
  const slotsRef = useRef<HTMLElement | null>(null);

  const initialDayKey = firstOpenDateKey(calendar);
  const [activeMonthKey, setActiveMonthKey] = useState(
    initialDayKey?.slice(0, 7) ?? calendar.months[0].key,
  );
  const [selectedDayKey, setSelectedDayKey] = useState(initialDayKey);
  const [selectedSlotId, setSelectedSlotId] = useState(
    initialDayKey ? (calendar.days[initialDayKey]?.slots[0]?.id ?? null) : null,
  );
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<BookingFailure | null>(null);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  const month = calendar.months.find((m) => m.key === activeMonthKey) ?? calendar.months[0];
  const monthIndex = calendar.months.indexOf(month);
  const day = selectedDayKey ? (calendar.days[selectedDayKey] ?? null) : null;
  const slots = useMemo(() => day?.slots ?? [], [day]);
  const selectedSlot = slots.find((s) => s.id === selectedSlotId) ?? null;
  const fieldErrors = failure?.kind === 'invalid' ? failure.fields : {};
  const banner = failure ? bookingBanner(failure) : null;
  const isEmptyCalendar = firstOpenDateKey(calendar) === null;

  // Валидность выделения после router.refresh(): исчезнувший слот/день
  // замещается первым доступным — автоподбор первого окна дня (макет #13).
  useEffect(() => {
    if (day) {
      if (!slots.some((s) => s.id === selectedSlotId)) {
        setSelectedSlotId(slots[0]?.id ?? null);
      }
      return;
    }
    const first = firstOpenDateKey(calendar);
    setSelectedDayKey(first);
    setActiveMonthKey(first?.slice(0, 7) ?? calendar.months[0].key);
    setSelectedSlotId(first ? (calendar.days[first]?.slots[0]?.id ?? null) : null);
  }, [calendar, day, selectedSlotId, slots]);

  function pickDay(dateKey: string, monthKey: string): void {
    setSelectedDayKey(dateKey);
    setActiveMonthKey(monthKey);
    setSelectedSlotId(null); // эффект подберёт первое окно дня
    setFailure(null);
  }

  function pickSlot(slotId: string): void {
    setSelectedSlotId(slotId);
    setFailure(null);
  }

  function clearFieldError(field: string): void {
    setFailure((f) =>
      f?.kind === 'invalid' && f.fields[field]
        ? {
            ...f,
            fields: Object.fromEntries(Object.entries(f.fields).filter(([key]) => key !== field)),
          }
        : f,
    );
  }

  function resetAfterSuccess(): void {
    setSuccess(null);
    setName('');
    setContact('');
    setComment('');
    setFailure(null);
    const first = firstOpenDateKey(calendar); // calendar уже обновлён refresh'ем
    setSelectedDayKey(first);
    setActiveMonthKey(first?.slice(0, 7) ?? calendar.months[0].key);
    setSelectedSlotId(first ? (calendar.days[first]?.slots[0]?.id ?? null) : null);
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedSlot || !day || pending) return;

    setPending(true);
    setFailure(null);
    try {
      const { data, error } = await api.POST('/api/v1/bookings', {
        body: {
          slotId: selectedSlot.id,
          bookerName: name,
          bookerContact: contact,
          comment: comment.trim() || undefined,
        },
      });

      if (data) {
        setSuccess({
          dayTitle: day.title,
          timeLabel: selectedSlot.timeLabel,
          name,
          contact,
        });
        // слот исчезает из свободных: сервер — источник истины (ADR-004)
        router.refresh();
        return;
      }

      const bookingFailure = bookingFailureFromApiError(error);
      setFailure(bookingFailure);
      if (
        bookingFailure.kind === 'booked' ||
        bookingFailure.kind === 'past' ||
        bookingFailure.kind === 'gone'
      ) {
        // список должен показать фактическое состояние окна
        setSelectedSlotId(null);
        router.refresh();
      }
    } catch {
      setFailure({ kind: 'network' });
    } finally {
      setPending(false);
    }
  }

  // Успех заменяет и календарь, и правую колонку (состояние success макета)
  if (success) {
    return (
      <section
        aria-label="Бронь подтверждена"
        className="lg:col-span-9 rounded-2xl border border-sage/30 bg-card p-5 sm:p-8 shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
      >
        <div className="flex gap-4">
          <span className="grid place-items-center size-11 shrink-0 rounded-full bg-sage text-white">
            <svg
              width="20"
              height="20"
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
          </span>
          <div>
            <h2 className="text-[20px] font-extrabold tracking-tight">Бронь подтверждена</h2>
            <p className="mt-1 text-[14px] text-muted">
              До связи! Выбранное время закреплено за вами.
            </p>
          </div>
        </div>

        <dl className="mt-5 rounded-xl border border-line bg-paper px-4 py-3.5 grid gap-x-6 gap-y-2.5 text-[14px] sm:max-w-md">
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Дата</dt>
            <dd className="font-semibold text-right">{success.dayTitle}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Время</dt>
            <dd className="font-semibold">
              {success.timeLabel} · {tzText}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Имя</dt>
            <dd className="font-semibold text-right">{success.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Контакт</dt>
            <dd className="font-semibold text-right">{success.contact}</dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={resetAfterSuccess}
          className="mt-5 h-11 px-5 rounded-xl border border-line hover:border-sage hover:text-sage text-[14px] font-semibold transition"
        >
          Забронировать ещё
        </button>
      </section>
    );
  }

  return (
    <>
      <section
        aria-label="Календарь"
        className={`lg:col-span-5 rounded-2xl border border-line bg-card p-4 sm:p-6 shadow-[0_1px_3px_rgba(55,53,47,0.04)] ${isEmptyCalendar ? 'cal-empty' : ''}`}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[17px] font-bold tracking-tight">{month.label}</h2>
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline text-[12px] text-muted">окна на месяц вперёд</span>
            {calendar.months.length > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Предыдущий месяц"
                  disabled={monthIndex === 0}
                  onClick={() => setActiveMonthKey(calendar.months[monthIndex - 1].key)}
                  className="grid place-items-center size-7 rounded-lg border border-line text-muted hover:text-sage hover:border-sage transition disabled:opacity-40 disabled:pointer-events-none"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Следующий месяц"
                  disabled={monthIndex === calendar.months.length - 1}
                  onClick={() => setActiveMonthKey(calendar.months[monthIndex + 1].key)}
                  className="grid place-items-center size-7 rounded-lg border border-line text-muted hover:text-sage hover:border-sage transition disabled:opacity-40 disabled:pointer-events-none"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[11.5px] font-semibold text-muted">
          <span>пн</span>
          <span>вт</span>
          <span>ср</span>
          <span>чт</span>
          <span>пт</span>
          <span>сб</span>
          <span>вс</span>
        </div>
        <div className="mt-1.5 grid grid-cols-7 gap-1">
          {month.cells.map((cell) => (
            <DayButton
              key={cell.dateKey}
              cell={cell}
              selected={cell.dateKey === selectedDayKey}
              onPick={() => pickDay(cell.dateKey, month.key)}
            />
          ))}
        </div>

        <p className="mt-4 flex items-center gap-2 text-[12px] text-muted">
          <span className="inline-block size-2 rounded-full bg-sage"></span> — сегодня; под числом —
          количество свободных окон
        </p>
      </section>

      <div className="lg:col-span-4 space-y-6">
        {isEmptyCalendar ? (
          <section
            aria-label="Нет свободных окон"
            className="rounded-2xl border border-line bg-card px-5 py-12 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
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
            <h2 className="mt-5 text-[18px] font-bold tracking-tight">Свободных окон пока нет</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted max-w-[34ch] mx-auto">
              Владелец регулярно добавляет новое время. Загляните на эту страницу позже.
            </p>
          </section>
        ) : (
          <>
            {banner && (
              <section
                aria-label="Ошибка бронирования"
                role="alert"
                className="rounded-2xl border border-clay/40 bg-clay-soft p-5"
              >
                <div className="flex gap-3.5">
                  <span className="grid place-items-center size-9 shrink-0 rounded-full bg-clay/15 text-clay">
                    <svg
                      width="18"
                      height="18"
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
                  </span>
                  <div>
                    <h2 className="font-bold text-clay-deep">{banner.title}</h2>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-clay-deep/80">
                      {banner.text}
                    </p>
                  </div>
                </div>
              </section>
            )}

            <section
              aria-label="Окна на выбранный день"
              ref={slotsRef}
              className="rounded-2xl border border-line bg-card p-5 shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[16px] font-bold tracking-tight">
                  {day?.title ?? 'Выберите день'}
                </h2>
                <span className="text-[12px] text-muted whitespace-nowrap">{tzText}</span>
              </div>
              {slots.length > 0 ? (
                <div className="mt-4 grid grid-cols-2 lg:grid-cols-1 gap-2.5">
                  {slots.map((slot) => (
                    <button
                      key={slot.id}
                      type="button"
                      className={`slot-btn ${slot.id === selectedSlotId ? 'slot-on' : ''}`}
                      aria-pressed={slot.id === selectedSlotId}
                      onClick={() => pickSlot(slot.id)}
                    >
                      {slot.timeLabel}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                  На этот день свободных окон нет — выберите другой день в календаре.
                </p>
              )}
            </section>

            {selectedSlot && day && (
              <section
                aria-label="Форма бронирования"
                className="rounded-2xl border border-line bg-card p-5 shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-[16px] font-bold tracking-tight">Ваша бронь</h2>
                    <p className="mt-1.5 text-[13.5px] text-muted">
                      {day.title} ·{' '}
                      <strong className="text-ink font-semibold">{selectedSlot.timeLabel}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-[12.5px] font-medium text-muted hover:text-sage transition-colors shrink-0 pt-0.5"
                    onClick={() =>
                      slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                    }
                  >
                    Изменить время
                  </button>
                </div>

                <form className="mt-5 grid gap-4" onSubmit={onSubmit}>
                  <Field
                    id="booker-name"
                    label="Ваше имя"
                    value={name}
                    maxLength={100}
                    required
                    error={fieldErrors.bookerName}
                    onChange={(v) => {
                      setName(v);
                      clearFieldError('bookerName');
                    }}
                  />
                  <Field
                    id="booker-contact"
                    label="Телефон или email"
                    value={contact}
                    maxLength={200}
                    required
                    placeholder="+7 900 000-00-00"
                    error={fieldErrors.bookerContact}
                    onChange={(v) => {
                      setContact(v);
                      clearFieldError('bookerContact');
                    }}
                  />
                  <div>
                    <label
                      htmlFor="booker-comment"
                      className="block text-[13px] font-semibold text-ink mb-1.5"
                    >
                      Комментарий <span className="font-normal text-muted">· необязательно</span>
                    </label>
                    <textarea
                      id="booker-comment"
                      name="comment"
                      rows={2}
                      maxLength={500}
                      placeholder="О чём хотите поговорить"
                      value={comment}
                      onChange={(e) => {
                        setComment(e.target.value);
                        clearFieldError('comment');
                      }}
                      className={`w-full rounded-xl border bg-card px-3.5 py-2.5 text-[15px] placeholder:text-faint resize-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 transition ${
                        fieldErrors.comment
                          ? 'border-clay'
                          : 'border-line focus-visible:border-sage'
                      }`}
                    />
                    {fieldErrors.comment && (
                      <p className="mt-1.5 text-[12.5px] text-clay-deep">{fieldErrors.comment}</p>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={pending}
                    className="h-12 rounded-xl bg-sage hover:bg-sage-deep active:translate-y-px text-white text-[15px] font-semibold transition disabled:opacity-60"
                  >
                    {pending ? 'Бронируем…' : 'Забронировать звонок'}
                  </button>
                </form>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function DayButton({
  cell,
  selected,
  onPick,
}: {
  cell: CalendarCell;
  selected: boolean;
  onPick: () => void;
}) {
  const classes = [
    'cal-day',
    cell.state === 'off' ? 'off' : '',
    cell.state === 'zero' ? 'zero' : '',
    selected ? 'on' : '',
    cell.isToday ? 'today' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      disabled={cell.state === 'off'}
      aria-pressed={selected}
      aria-label={cell.label || undefined}
      className={classes}
      onClick={onPick}
    >
      <b>{cell.dayNumber}</b>
      <span className="cal-count">
        {cell.state === 'open' ? countWindows(cell.count) : cell.state === 'zero' ? '0' : ''}
      </span>
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  maxLength,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  maxLength: number;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold text-ink mb-1.5">
        {label}
      </label>
      <input
        id={id}
        name={id}
        type="text"
        value={value}
        required={required}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-xl border bg-card px-3.5 h-11 text-[15px] placeholder:text-faint focus:outline-none focus-visible:ring-2 focus-visible:ring-sage/40 transition ${
          error ? 'border-clay' : 'border-line focus-visible:border-sage'
        }`}
      />
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-[12.5px] text-clay-deep">
          {error}
        </p>
      )}
    </div>
  );
}
