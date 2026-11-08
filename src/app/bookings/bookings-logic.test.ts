import { describe, expect, it } from 'vitest';
import type { BookingJson } from '../admin/admin-logic';
import { upcomingCardFromBooking } from './bookings-logic';

// Шов 3 (unit): карточка предстоящей брони страницы «Предстоящие записи»
// (#57, ADR-0012): тип встречи, интервал и «создана …» форматируются на
// сервере в APP_TZ (ADR-0009), клиент ничего не вычисляет. Ожидаемые
// строки — literals из прототипа events.html (#13), не результат
// форматирования.

const booking: BookingJson = {
  id: 'b1',
  eventType: { id: 't1', title: 'Созвон 30', durationMinutes: 30 },
  startsAt: '2026-11-10T07:30:00.000Z',
  endsAt: '2026-11-10T08:00:00.000Z',
  bookerName: 'Мария',
  bookerContact: 'maria@example.com',
  comment: 'Хочу обсудить сотрудничество',
  createdAt: '2026-11-07T15:40:00.000Z',
};

describe('upcomingCardFromBooking', () => {
  it('карточка: тип, интервал и «создана …» в APP_TZ, контакты, комментарий', () => {
    expect(upcomingCardFromBooking(booking, 'Europe/Moscow')).toEqual({
      eventTypeTitle: 'Созвон 30',
      when: 'вт, 10 ноября · 10:30–11:00',
      createdLabel: '7 ноября в 18:40',
      bookerName: 'Мария',
      bookerContact: 'maria@example.com',
      comment: 'Хочу обсудить сотрудничество',
    });
  });

  it('без комментария ключа comment нет — пустой строки-заглушки не будет', () => {
    const withoutComment: BookingJson = { ...booking };
    delete withoutComment.comment;
    expect(upcomingCardFromBooking(withoutComment, 'Europe/Moscow')).toEqual({
      eventTypeTitle: 'Созвон 30',
      when: 'вт, 10 ноября · 10:30–11:00',
      createdLabel: '7 ноября в 18:40',
      bookerName: 'Мария',
      bookerContact: 'maria@example.com',
    });
  });
});
