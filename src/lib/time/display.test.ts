import { describe, expect, it } from 'vitest';
import { countIntervals, formatInterval, formatTimeRange, tzLabel } from './display';

// Шов 3 (unit): отображение времени в APP_TZ (ADR-009) в форматах макета
// admin.html (#13): «вт, 10 ноября · 10:00–10:30», «Москва, UTC+3».
// Ожидаемые строки — literals из прототипа, не результат форматирования.

describe('formatInterval', () => {
  it('интервал в пределах одного дня', () => {
    expect(
      formatInterval('2026-11-10T07:00:00.000Z', '2026-11-10T07:30:00.000Z', 'Europe/Moscow'),
    ).toBe('вт, 10 ноября · 10:00–10:30');
  });

  it('интервал через полночь — обе даты', () => {
    expect(
      formatInterval('2026-11-10T20:00:00.000Z', '2026-11-10T21:15:00.000Z', 'Europe/Moscow'),
    ).toBe('вт, 10 ноября · 23:00 – ср, 11 ноября · 00:15');
  });

  it('UTC-зона: метки без сдвига', () => {
    expect(formatInterval('2026-11-10T10:00:00.000Z', '2026-11-10T10:45:00.000Z', 'UTC')).toBe(
      'вт, 10 ноября · 10:00–10:45',
    );
  });
});

describe('formatTimeRange', () => {
  it('в пределах дня — только времена', () => {
    expect(
      formatTimeRange('2026-11-11T08:00:00.000Z', '2026-11-11T08:30:00.000Z', 'Europe/Moscow'),
    ).toBe('11:00–11:30');
  });

  it('через полночь — падает обратно на полный формат с датами', () => {
    expect(
      formatTimeRange('2026-11-10T20:00:00.000Z', '2026-11-10T21:15:00.000Z', 'Europe/Moscow'),
    ).toBe('вт, 10 ноября · 23:00 – ср, 11 ноября · 00:15');
  });
});

describe('tzLabel', () => {
  it('Москва — город и круглое смещение', () => {
    expect(tzLabel('Europe/Moscow', new Date('2026-11-07T12:00:00Z'))).toBe('Москва, UTC+3');
  });

  it('зона с летним временем — смещение на данный момент', () => {
    expect(tzLabel('America/New_York', new Date('2026-07-15T12:00:00Z'))).toBe(
      'Восточная Америка, UTC-4',
    );
  });

  it('полукруглое смещение — минуты в метке', () => {
    expect(tzLabel('Asia/Kolkata', new Date('2026-11-17T12:00:00Z'))).toBe('Индия, UTC+5:30');
  });
});

describe('countIntervals', () => {
  it('склоняет по правилам русского языка', () => {
    expect(countIntervals(0)).toBe('0 интервалов');
    expect(countIntervals(1)).toBe('1 интервал');
    expect(countIntervals(2)).toBe('2 интервала');
    expect(countIntervals(4)).toBe('4 интервала');
    expect(countIntervals(5)).toBe('5 интервалов');
    expect(countIntervals(11)).toBe('11 интервалов');
    expect(countIntervals(21)).toBe('21 интервал');
    expect(countIntervals(22)).toBe('22 интервала');
    expect(countIntervals(101)).toBe('101 интервал');
    expect(countIntervals(111)).toBe('111 интервалов');
  });
});
