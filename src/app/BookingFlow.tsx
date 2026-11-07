'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { components } from '@/generated/schema';
import { createApiClient } from '@/lib/sdk/client';
import {
  apiFailureFromError,
  bookingBanner,
  buildBookingCalendar,
  countWindows,
  firstOpenDateKey,
  humanDuration,
  type ApiFailure,
  type BookingCalendar,
  type CalendarCell,
} from './booking-logic';

// Двухшаговый сценарий гостя (FR-003, #35): шаг 1 — карточки видов брони
// (типы приходят из RSC, ADR-0004); шаг 2 — календарь свободных слотов
// выбранного типа: клиентский GET …/slots через SDK, группировка и подписи —
// чистая логика booking-logic (клиент не преобразует зоны — только APP_TZ,
// ADR-0009). Мутация — SDK POST /api/v1/bookings + router.refresh() (ADR-004);
// ошибки — только по error.code (ADR-0005): 409 — баннер макета со свежим
// списком, 422 — подсказки clay у полей, 404 типа — возврат к видам брони.

type EventType = components['schemas']['EventType'];

/** Снимок успешной брони: локальное состояние, не зависит от refresh. */
interface SuccessInfo {
  typeTitle: string;
  dayTitle: string;
  timeLabel: string;
  name: string;
  contact: string;
}

type SlotsState =
  { phase: 'loading' } | { phase: 'ready'; calendar: BookingCalendar } | { phase: 'failed' }; // сеть/неизвестный сбой — карточка повтора

export function BookingFlow({
  eventTypes,
  appTz,
  tzText,
}: {
  eventTypes: EventType[] | null;
  appTz: string;
  tzText: string;
}) {
  const router = useRouter();

  const [selectedType, setSelectedType] = useState<EventType | null>(null);
  const [slotsState, setSlotsState] = useState<SlotsState | null>(null);
  const [activeMonthKey, setActiveMonthKey] = useState<string | null>(null);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [selectedSlotAt, setSelectedSlotAt] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [comment, setComment] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<ApiFailure | null>(null);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);
  const [typesBanner, setTypesBanner] = useState<{ title: string; text: string } | null>(null);
  // граница актуальности выборки слотов: быстрые переходы между типами
  // не должны скрещивать ответ прошлого запроса с новым состоянием
  const fetchSeq = useRef(0);
  // точка возврата внимания после 409: список слотов или баннер (пустой день)
  const bannerRef = useRef<HTMLElement | null>(null);
  const slotsRef = useRef<HTMLElement | null>(null);

  const calendar = slotsState?.phase === 'ready' ? slotsState.calendar : null;
  const month =
    calendar && activeMonthKey
      ? (calendar.months.find((m) => m.key === activeMonthKey) ?? calendar.months[0])
      : (calendar?.months[0] ?? null);
  const monthIndex = calendar && month ? calendar.months.indexOf(month) : 0;
  const day = calendar && selectedDayKey ? (calendar.days[selectedDayKey] ?? null) : null;
  const slots = day?.slots ?? [];
  const selectedSlot = slots.find((s) => s.startsAt === selectedSlotAt) ?? null;
  const fieldErrors = failure?.kind === 'invalid' ? failure.fields : {};
  const banner = failure ? bookingBanner(failure) : null;
  const isEmptyCalendar = calendar !== null && firstOpenDateKey(calendar) === null;

  function backToTypes(): void {
    setSelectedType(null);
    setSlotsState(null);
    setActiveMonthKey(null);
    setSelectedDayKey(null);
    setSelectedSlotAt(null);
    setFailure(null);
    setSuccess(null);
  }

  /** Свежие слоты выбранного типа; выбор даты/слота сбрасывается на первые доступные. */
  async function loadSlots(typeId: string): Promise<void> {
    const seq = ++fetchSeq.current;
    // failure не сбрасываем: баннер 409 должен жить и после обновления списка
    setSlotsState({ phase: 'loading' });
    const api = createApiClient();
    try {
      const { data, error } = await api.GET('/api/v1/event-types/{id}/slots', {
        params: { path: { id: typeId } },
      });
      if (seq !== fetchSeq.current) return; // ответ устарел — пользователь уже ушёл

      if (data) {
        const cal = buildBookingCalendar(data.slots, appTz, new Date());
        setSlotsState({ phase: 'ready', calendar: cal });
        const first = firstOpenDateKey(cal);
        setActiveMonthKey(first?.slice(0, 7) ?? cal.months[0].key);
        setSelectedDayKey(first);
        setSelectedSlotAt(first ? (cal.days[first]?.slots[0]?.startsAt ?? null) : null);
        return;
      }

      const loadFailure = apiFailureFromError(error);
      if (loadFailure.kind === 'gone') {
        // тип удалён владельцем — назад к видам брони, список обновит refresh
        setTypesBanner(bookingBanner(loadFailure));
        backToTypes();
        router.refresh();
        return;
      }
      setSlotsState({ phase: 'failed' });
    } catch {
      if (seq === fetchSeq.current) setSlotsState({ phase: 'failed' });
    }
  }

  async function selectType(type: EventType): Promise<void> {
    setSelectedType(type);
    setTypesBanner(null);
    setSuccess(null);
    setFailure(null);
    await loadSlots(type.id);
  }

  function pickDay(dateKey: string, monthKey: string): void {
    setSelectedDayKey(dateKey);
    setActiveMonthKey(monthKey);
    // автоподбор первого окна дня — поведение прежнего флоу (макет #13)
    setSelectedSlotAt(calendar?.days[dateKey]?.slots[0]?.startsAt ?? null);
    setFailure(null);
  }

  function pickSlot(startsAt: string): void {
    setSelectedSlotAt(startsAt);
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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!selectedType || !day || !selectedSlot || pending) return;

    setPending(true);
    setFailure(null);
    try {
      const api = createApiClient();
      const { data, error } = await api.POST('/api/v1/bookings', {
        body: {
          eventTypeId: selectedType.id,
          startsAt: selectedSlot.startsAt,
          bookerName: name,
          bookerContact: contact,
          comment: comment.trim() || undefined,
        },
      });

      if (data) {
        setSuccess({
          typeTitle: selectedType.title,
          dayTitle: day.title,
          timeLabel: selectedSlot.timeLabel,
          name,
          contact,
        });
        setName('');
        setContact('');
        setComment('');
        // сервер — источник истины (ADR-004): типы могли измениться
        router.refresh();
        return;
      }

      const bookingFailure = apiFailureFromError(error);
      if (bookingFailure.kind === 'gone') {
        setTypesBanner(bookingBanner(bookingFailure));
        backToTypes();
        router.refresh();
        return;
      }

      setFailure(bookingFailure);
      if (bookingFailure.kind === 'booked' || bookingFailure.kind === 'past') {
        // список должен показать фактическое состояние окна
        await loadSlots(selectedType.id);
        router.refresh();
      }
    } catch {
      setFailure({ kind: 'network' });
    } finally {
      setPending(false);
    }
  }

  function bookAgain(): void {
    setSuccess(null);
    setFailure(null);
    if (selectedType) void loadSlots(selectedType.id);
  }

  // После 409 список перезагружается молча — возвращаем внимание гостя
  // скроллом, как в прежнем флоу (scrollIntoView к списку окон выбранного
  // дня; если день опустел — к баннеру над ним).
  useEffect(() => {
    if (!failure || (failure.kind !== 'booked' && failure.kind !== 'past')) return;
    if (slotsState?.phase !== 'ready') return;
    const target = slots.length > 0 ? slotsRef.current : bannerRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [failure, slotsState, slots.length]);

  // Шаг 1 — виды брони (страница RSC уже принесла список типов)
  if (!selectedType) {
    return (
      <>
        {typesBanner && (
          <section
            aria-label="Вид брони недоступен"
            role="alert"
            className="lg:col-span-9 rounded-2xl border border-clay/40 bg-clay-soft p-5"
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
                <h2 className="font-bold text-clay-deep">{typesBanner.title}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-clay-deep/80">
                  {typesBanner.text}
                </p>
              </div>
            </div>
          </section>
        )}

        {eventTypes === null ? (
          <section
            aria-label="Ошибка загрузки видов брони"
            className="lg:col-span-9 rounded-2xl border border-line bg-card px-6 py-12 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
          >
            <p className="text-[15px] font-semibold">Не удалось загрузить виды брони</p>
            <p className="mt-1.5 text-[13.5px] text-muted">
              Обновите страницу и попробуйте ещё раз.
            </p>
          </section>
        ) : eventTypes.length === 0 ? (
          <section
            aria-label="Нет видов брони"
            className="lg:col-span-9 rounded-2xl border border-line bg-card px-6 py-12 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
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
            <h2 className="mt-5 text-[18px] font-bold tracking-tight">
              Свободных видов брони пока нет
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-muted max-w-[34ch] mx-auto">
              Владелец ещё не настроил виды звонков. Загляните на эту страницу позже.
            </p>
          </section>
        ) : (
          <section aria-label="Виды брони" className="lg:col-span-9">
            <div className="grid sm:grid-cols-2 gap-4">
              {eventTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => void selectType(type)}
                  className="group text-left rounded-2xl border border-line bg-card p-5 shadow-[0_1px_3px_rgba(55,53,47,0.04)] transition hover:border-sage focus-visible:ring-2 focus-visible:ring-sage/40 focus-visible:outline-none"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[17px] font-bold tracking-tight leading-snug group-hover:text-sage transition-colors">
                      {type.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-sage-soft text-sage text-[12.5px] font-semibold px-2.5 py-1 whitespace-nowrap">
                      {humanDuration(type.durationMinutes)}
                    </span>
                  </div>
                  {type.description ? (
                    <p className="mt-2 text-[13.5px] leading-relaxed text-muted line-clamp-3">
                      {type.description}
                    </p>
                  ) : (
                    <p className="mt-2 text-[13.5px] leading-relaxed text-faint">Без описания</p>
                  )}
                  <span className="mt-4 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-sage">
                    Выбрать
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="transition-transform group-hover:translate-x-0.5"
                    >
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  // Подтверждение заменяет и календарь, и правую колонку
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
            <dt className="text-muted">Вид брони</dt>
            <dd className="font-semibold text-right">{success.typeTitle}</dd>
          </div>
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
            <dd className="font-semibold text-right">{success.name || '—'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Контакт</dt>
            <dd className="font-semibold text-right">{success.contact || '—'}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={bookAgain}
            className="h-11 px-5 rounded-xl border border-line hover:border-sage hover:text-sage text-[14px] font-semibold transition"
          >
            Забронировать ещё
          </button>
          <button
            type="button"
            onClick={() => {
              setTypesBanner(null);
              backToTypes();
            }}
            className="h-11 px-5 rounded-xl text-[14px] font-semibold text-muted hover:text-sage transition"
          >
            К видам брони
          </button>
        </div>
      </section>
    );
  }

  // Шаг 2 — календарь свободных слотов выбранного типа
  return (
    <div className="lg:col-span-9 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setTypesBanner(null);
            backToTypes();
          }}
          className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-muted hover:text-sage transition-colors"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M11 18l-6-6 6-6" />
          </svg>
          Виды брони
        </button>
        <p className="text-[13.5px] text-muted">
          <span className="font-semibold text-ink">{selectedType.title}</span> ·{' '}
          {humanDuration(selectedType.durationMinutes)} · {tzText}
        </p>
      </div>

      {slotsState === null || slotsState.phase === 'loading' ? (
        <section
          aria-label="Загрузка свободных окон"
          className="rounded-2xl border border-line bg-card px-6 py-12 text-center shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
        >
          <p className="text-[15px] font-semibold">Загружаем свободные окна…</p>
          <p className="mt-1.5 text-[13.5px] text-muted">Календарь на ближайшие две недели</p>
        </section>
      ) : slotsState.phase === 'failed' ? (
        <section
          aria-label="Ошибка загрузки свободных окон"
          role="alert"
          className="rounded-2xl border border-clay/40 bg-clay-soft p-5"
        >
          <h2 className="font-bold text-clay-deep">Не удалось связаться с сервером</h2>
          <p className="mt-1 text-[13.5px] leading-relaxed text-clay-deep/80">
            Свободные окна не загрузились. Проверьте подключение и попробуйте ещё раз.
          </p>
          <button
            type="button"
            onClick={() => void loadSlots(selectedType.id)}
            className="mt-4 h-10 px-4 rounded-xl border border-clay/40 text-[13.5px] font-semibold text-clay-deep hover:bg-clay/10 transition"
          >
            Попробовать снова
          </button>
        </section>
      ) : (
        <div className="grid lg:grid-cols-9 gap-6 lg:gap-8">
          <section
            aria-label="Календарь"
            className={`lg:col-span-5 rounded-2xl border border-line bg-card p-4 sm:p-6 shadow-[0_1px_3px_rgba(55,53,47,0.04)] ${isEmptyCalendar ? 'cal-empty' : ''}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-bold tracking-tight">{month?.label}</h2>
              <div className="flex items-center gap-2">
                <span className="hidden sm:inline text-[12px] text-muted">
                  окна на 14 дней вперёд
                </span>
                {calendar!.months.length > 1 && month && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label="Предыдущий месяц"
                      disabled={monthIndex === 0}
                      onClick={() => setActiveMonthKey(calendar!.months[monthIndex - 1].key)}
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
                      disabled={monthIndex === calendar!.months.length - 1}
                      onClick={() => setActiveMonthKey(calendar!.months[monthIndex + 1].key)}
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
              {month?.cells.map((cell) => (
                <DayButton
                  key={cell.dateKey}
                  cell={cell}
                  selected={cell.dateKey === selectedDayKey}
                  onPick={() => pickDay(cell.dateKey, month.key)}
                />
              ))}
            </div>

            <p className="mt-4 flex items-center gap-2 text-[12px] text-muted">
              <span className="inline-block size-2 rounded-full bg-sage"></span> — сегодня; под
              числом — количество свободных окон
            </p>
          </section>

          <div className="lg:col-span-4 space-y-6">
            {banner && (
              <section
                aria-label="Ошибка бронирования"
                role="alert"
                ref={bannerRef}
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
                <h2 className="mt-5 text-[18px] font-bold tracking-tight">
                  На ближайшие две недели свободных окон нет
                </h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted max-w-[34ch] mx-auto">
                  У этого вида брони всё занято. Загляните позже или выберите другой вид.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setTypesBanner(null);
                    backToTypes();
                  }}
                  className="mt-5 h-11 px-5 rounded-xl border border-line hover:border-sage hover:text-sage text-[14px] font-semibold transition"
                >
                  К видам брони
                </button>
              </section>
            ) : (
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
                        key={slot.startsAt}
                        type="button"
                        className={`slot-btn ${slot.startsAt === selectedSlotAt ? 'slot-on' : ''}`}
                        aria-pressed={slot.startsAt === selectedSlotAt}
                        onClick={() => pickSlot(slot.startsAt)}
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
            )}

            {!isEmptyCalendar && selectedSlot && day && (
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
                    minLength={5}
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
          </div>
        </div>
      )}
    </div>
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
  minLength,
  required,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | undefined;
  maxLength: number;
  minLength?: number;
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
        minLength={minLength}
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
