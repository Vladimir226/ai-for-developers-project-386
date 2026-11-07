import { describe, expect, it } from 'vitest';
import { wallTimeToUtcIso } from './wall-time';

// Шов 3 (unit): конвертация «настенного» времени зоны APP_TZ в UTC-метку
// (аддендум #5: Intl-roundtrip, без библиотек). API принимает только
// ISO 8601 со смещением/Z (ADR-009) — утилита отдаёт Z-форму.
// Ожидаемые метки — literals из таблицы переходов DST (tzdata), не пересчёт.

describe('wallTimeToUtcIso', () => {
  it('фиксированное смещение без DST: Москва +3', () => {
    expect(wallTimeToUtcIso('2026-11-17', '10:00', 'Europe/Moscow')).toBe(
      '2026-11-17T07:00:00.000Z',
    );
  });

  it('зима в Нью-Йорке — EST (UTC−5)', () => {
    expect(wallTimeToUtcIso('2026-01-15', '09:00', 'America/New_York')).toBe(
      '2026-01-15T14:00:00.000Z',
    );
  });

  it('лето в Нью-Йорке — EDT (UTC−4): то же настенное время, другая метка', () => {
    expect(wallTimeToUtcIso('2026-07-15', '09:00', 'America/New_York')).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('полукруглое смещение +05:30, дата в UTC уходит на день назад', () => {
    expect(wallTimeToUtcIso('2026-11-17', '01:00', 'Asia/Kolkata')).toBe(
      '2026-11-16T19:30:00.000Z',
    );
  });

  it('зона UTC — метка равна настенному времени', () => {
    expect(wallTimeToUtcIso('2026-11-17', '23:59', 'UTC')).toBe('2026-11-17T23:59:00.000Z');
  });

  it('неоднозначное время осеннего перехода — ранний случай (EDT)', () => {
    // 1 ноября 2026, 01:30 в Нью-Йорке существует дважды; фиксируем ранний
    expect(wallTimeToUtcIso('2026-11-01', '01:30', 'America/New_York')).toBe(
      '2026-11-01T05:30:00.000Z',
    );
  });

  it('несуществующее время весеннего перехода — сдвиг после скачка', () => {
    // 8 марта 2026, 02:30 в Нью-Йорке не существует (02:00 → 03:00)
    expect(wallTimeToUtcIso('2026-03-08', '02:30', 'America/New_York')).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });

  it('невозможная календарная дата — RangeError (без молчаливого перескока)', () => {
    expect(() => wallTimeToUtcIso('2026-02-30', '10:00', 'Europe/Moscow')).toThrow(RangeError);
  });

  it('мусорный формат даты — RangeError', () => {
    expect(() => wallTimeToUtcIso('17.11.2026', '10:00', 'Europe/Moscow')).toThrow(RangeError);
  });

  it('мусорный формат времени — RangeError', () => {
    expect(() => wallTimeToUtcIso('2026-11-17', '10 ч', 'Europe/Moscow')).toThrow(RangeError);
    expect(() => wallTimeToUtcIso('2026-11-17', '10:60', 'Europe/Moscow')).toThrow(RangeError);
    expect(() => wallTimeToUtcIso('2026-11-17', '24:00', 'Europe/Moscow')).toThrow(RangeError);
  });

  it('неизвестная зона — RangeError от Intl', () => {
    expect(() => wallTimeToUtcIso('2026-11-17', '10:00', 'Mars/Olympus')).toThrow(RangeError);
  });
});
