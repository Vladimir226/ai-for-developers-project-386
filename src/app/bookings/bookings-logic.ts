// Чистая логика страницы «Предстоящие записи» (#57, ADR-0012): маппинг
// брони из GET /api/v1/bookings?upcoming=true в карточку, готовую к
// рендеру; форматирование — только на сервере в APP_TZ (ADR-0009).
// Страница read-only: ни мутаций, ни клиентских компонентов — ключ id
// карточке не нужен.

import { formatDayTime, formatInterval } from '@/lib/time/display';
import type { BookingJson } from '../admin/admin-logic';

/** Карточка предстоящей брони: всё готово к рендеру, вычислений на клиенте нет. */
export interface UpcomingCardData {
  eventTypeTitle: string;
  when: string;
  createdLabel: string;
  bookerName: string;
  bookerContact: string;
  comment?: string;
}

/**
 * Бронь → карточка «Предстоящих записей»: тип встречи, интервал
 * «вт, 10 ноября · 10:30–11:00» и подпись «создана 7 ноября в 18:40»
 * в зоне APP_TZ (форматы прототипа events.html, #13). Комментарий
 * отсутствием ключа, а не пустой строкой.
 */
export function upcomingCardFromBooking(booking: BookingJson, timeZone: string): UpcomingCardData {
  const card: UpcomingCardData = {
    eventTypeTitle: booking.eventType.title,
    when: formatInterval(booking.startsAt, booking.endsAt, timeZone),
    createdLabel: formatDayTime(booking.createdAt, timeZone),
    bookerName: booking.bookerName,
    bookerContact: booking.bookerContact,
  };
  if (booking.comment !== undefined) card.comment = booking.comment;
  return card;
}
