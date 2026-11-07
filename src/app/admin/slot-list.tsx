import { countIntervals, formatInterval } from '@/lib/time/display';
import { slotStatus, type SlotStatus } from './admin-logic';
import { DeleteSlotButton } from './delete-slot-button';

// Список опубликованных интервалов (серверный рендер, ADR-009: время в APP_TZ).
// Статусы — бейджи макета #13: «Свободен» (sage), «Забронирован» и «Прошёл»
// (нейтральный warmgray).

interface SlotListProps {
  slots: { id: string; startsAt: string; endsAt: string }[] | null;
  bookedSlotIds: string[] | null;
  appTz: string;
  now: Date;
}

const STATUS_BADGE: Record<SlotStatus, { label: string; className: string }> = {
  free: { label: 'Свободен', className: 'bg-sage-soft text-sage' },
  booked: { label: 'Забронирован', className: 'bg-warmgray text-muted' },
  past: { label: 'Прошёл', className: 'bg-warmgray text-muted' },
};

export function SlotList({ slots, bookedSlotIds, appTz, now }: SlotListProps) {
  if (!slots) {
    return (
      <section
        aria-label="Опубликованные интервалы"
        className="rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
      >
        <div className="px-6 py-12 text-center">
          <p className="text-[15px] font-semibold">Не удалось загрузить интервалы</p>
          <p className="mt-1.5 text-[13.5px] text-muted">Обновите страницу и попробуйте ещё раз.</p>
        </div>
      </section>
    );
  }

  const booked = new Set(bookedSlotIds ?? []);

  return (
    <section
      aria-label="Опубликованные интервалы"
      className="rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
    >
      <div className="flex items-baseline justify-between px-5 sm:px-7 pt-6 pb-4">
        <h2 className="text-[19px] font-bold tracking-tight">Опубликованные интервалы</h2>
        <span className="text-[12.5px] text-muted">{countIntervals(slots.length)}</span>
      </div>

      {slots.length === 0 ? (
        <div className="border-t border-line px-6 py-12 text-center">
          <p className="text-[15px] font-semibold">Интервалов ещё нет</p>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Опубликуйте первое окно — оно появится на публичной странице.
          </p>
        </div>
      ) : (
        <ul className="border-t border-line divide-y divide-line">
          {slots.map((slot) => {
            const status = slotStatus(slot, booked, now);
            const badge = STATUS_BADGE[status];
            return (
              <li key={slot.id} className="flex items-center gap-3 px-5 sm:px-7 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-[14.5px] font-semibold">
                    {formatInterval(slot.startsAt, slot.endsAt, appTz)}
                  </p>
                </div>
                <span
                  className={`shrink-0 text-[11.5px] font-semibold rounded-full px-2.5 py-1 ${badge.className}`}
                >
                  {badge.label}
                </span>
                <DeleteSlotButton id={slot.id} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
