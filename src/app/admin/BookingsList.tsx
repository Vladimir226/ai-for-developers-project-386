// Список предстоящих броней всех типов (#36): источник — GET
// /api/v1/bookings?upcoming=true (фильтр «конец ≥ сейчас» делает сервер).
// Серверный рендер из RSC self-fetch (ADR-004): маппинг в карточки и
// форматирование диапазона в APP_TZ происходят здесь, на сервере (ADR-0009);
// карточка BookingCard — клиентская, только отмена (DELETE + refresh).
// Деградация без данных — как у типов событий; пустое состояние — «Предстоящих
// броней нет».

import { countActiveBookings } from '@/lib/time/display';
import { bookingCardFromBooking, type BookingJson } from './admin-logic';
import { BookingCard } from './BookingCard';

interface BookingsListProps {
  bookings: readonly BookingJson[] | null;
  timeZone: string;
  tzText: string;
}

export function BookingsList({ bookings, timeZone, tzText }: BookingsListProps) {
  if (!bookings) {
    return (
      <section
        aria-label="Брони"
        className="mt-10 rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
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
      className="mt-10 rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 sm:px-7 pt-6 pb-4">
        <h2 className="text-[19px] font-bold tracking-tight">Брони</h2>
        <span className="text-[12.5px] text-muted">
          {bookings.length > 0
            ? `${countActiveBookings(bookings.length)} · Время — ${tzText}`
            : `Время — ${tzText}`}
        </span>
      </div>

      {bookings.length === 0 ? (
        <div className="border-t border-line px-6 py-12 text-center">
          <p className="text-[15px] font-semibold">Предстоящих броней нет</p>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Как только кто-то запишется, встреча появится здесь.
          </p>
        </div>
      ) : (
        <ul className="border-t border-line divide-y divide-line">
          {bookings.map((booking) => (
            <BookingCard key={booking.id} booking={bookingCardFromBooking(booking, timeZone)} />
          ))}
        </ul>
      )}
    </section>
  );
}
