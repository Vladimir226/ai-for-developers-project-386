import { describe, expect, it } from 'vitest';
import {
  buildWorkingHoursBody,
  countEventTypes,
  eventTypeDraftFromForm,
  eventTypeFormFromEventType,
  failureFromApiError,
  formatDuration,
  hhmmToMinutes,
  minutesToHHMM,
  splitIssues,
  validateEventTypeForm,
  validateWeekRows,
  weekRowsFromDays,
  WEEK_DISPLAY_ORDER,
  type EventTypeFormValues,
  type WorkingDayRow,
} from './admin-logic';

// Шов 3 (unit): чистая логика панели владельца (ADR-004: UI тонкий) —
// плюрализация длительности, минуты↔«чч:мм», локальная валидация форм,
// сборка тела PUT рабочих часов и разбор конверта ошибок (ADR-005).
// Ожидания — literals, не пересчёт. Право veto — за сервером: локальные
// проверки только объясняют форму до отправки, серверные 422 маппятся
// в те же ключи полей.

// ── formatDuration ───────────────────────────────────────────────────────────

describe('formatDuration', () => {
  it('круглые минуты: 30 минут, 45 минут', () => {
    expect(formatDuration(30)).toBe('30 минут');
    expect(formatDuration(45)).toBe('45 минут');
  });

  it('единственное число минут: 21 минута, 31 минута', () => {
    expect(formatDuration(21)).toBe('21 минута');
    expect(formatDuration(31)).toBe('31 минута');
  });

  it('родительный падеж минут: 22 минуты, 17 минут', () => {
    expect(formatDuration(22)).toBe('22 минуты');
    expect(formatDuration(17)).toBe('17 минут');
  });

  it('ровно час: 1 час (без нулевых минут)', () => {
    expect(formatDuration(60)).toBe('1 час');
  });

  it('час с минутами: 1 час 30 минут, 1 час 15 минут', () => {
    expect(formatDuration(90)).toBe('1 час 30 минут');
    expect(formatDuration(75)).toBe('1 час 15 минут');
  });

  it('часы во множественном: 2 часа, 3 часа', () => {
    expect(formatDuration(120)).toBe('2 часа');
    expect(formatDuration(180)).toBe('3 часа');
  });

  it('часы с минутами: 2 часа 45 минут', () => {
    expect(formatDuration(165)).toBe('2 часа 45 минут');
  });

  it('51 минута при часе: 1 час 51 минута', () => {
    expect(formatDuration(111)).toBe('1 час 51 минута');
  });
});

describe('countEventTypes', () => {
  it('1 тип, 2 типа, 5 типов, 11 типов', () => {
    expect(countEventTypes(1)).toBe('1 тип');
    expect(countEventTypes(2)).toBe('2 типа');
    expect(countEventTypes(5)).toBe('5 типов');
    expect(countEventTypes(11)).toBe('11 типов');
  });
});

// ── минуты ↔ «чч:мм» ────────────────────────────────────────────────────────

describe('minutesToHHMM', () => {
  it('540 → 09:00, 1110 → 18:30', () => {
    expect(minutesToHHMM(540)).toBe('09:00');
    expect(minutesToHHMM(1110)).toBe('18:30');
  });

  it('0 → 00:00, 1440 → 24:00 (конец дня)', () => {
    expect(minutesToHHMM(0)).toBe('00:00');
    expect(minutesToHHMM(1440)).toBe('24:00');
  });
});

describe('hhmmToMinutes', () => {
  it('09:00 → 540, 18:30 → 1110', () => {
    expect(hhmmToMinutes('09:00')).toBe(540);
    expect(hhmmToMinutes('18:30')).toBe(1110);
  });

  it('однозначный час тоже принимается: 9:00 → 540', () => {
    expect(hhmmToMinutes('9:00')).toBe(540);
  });

  it('мусор → null: пусто, без двоеточия, часы/минуты за пределами', () => {
    expect(hhmmToMinutes('')).toBeNull();
    expect(hhmmToMinutes('0900')).toBeNull();
    expect(hhmmToMinutes('24:00')).toBeNull();
    expect(hhmmToMinutes('09:60')).toBeNull();
    expect(hhmmToMinutes('девять')).toBeNull();
  });
});

// ── валидация формы типа события ─────────────────────────────────────────────

describe('validateEventTypeForm', () => {
  it('валидная форма — без ошибок', () => {
    const values: EventTypeFormValues = {
      title: 'Знакомство',
      description: 'Первый звонок',
      durationMinutes: '30',
    };
    expect(validateEventTypeForm(values)).toEqual({});
  });

  it('пустое название — ошибка поля title', () => {
    const errors = validateEventTypeForm({
      title: '   ',
      description: '',
      durationMinutes: '30',
    });
    expect(errors['title']).toBe('укажите название');
  });

  it('название длиннее 100 — ошибка границы', () => {
    const errors = validateEventTypeForm({
      title: 'а'.repeat(101),
      description: '',
      durationMinutes: '30',
    });
    expect(errors['title']).toBe('не больше 100 символов');
  });

  it('описание длиннее 500 — ошибка поля description', () => {
    const errors = validateEventTypeForm({
      title: 'Звонок',
      description: 'а'.repeat(501),
      durationMinutes: '30',
    });
    expect(errors['description']).toBe('не больше 500 символов');
  });

  it('пустая длительность — ошибка поля durationMinutes', () => {
    const errors = validateEventTypeForm({
      title: 'Звонок',
      description: '',
      durationMinutes: '',
    });
    expect(errors['durationMinutes']).toBe('укажите длительность');
  });

  it('дробная длительность — целые минуты', () => {
    const errors = validateEventTypeForm({
      title: 'Звонок',
      description: '',
      durationMinutes: '30.5',
    });
    expect(errors['durationMinutes']).toBe('целое число минут');
  });

  it('длительность за границами 15..180 — ошибка диапазона', () => {
    expect(
      validateEventTypeForm({ title: 'x', description: '', durationMinutes: '10' })[
        'durationMinutes'
      ],
    ).toBe('от 15 до 180 минут');
    expect(
      validateEventTypeForm({ title: 'x', description: '', durationMinutes: '181' })[
        'durationMinutes'
      ],
    ).toBe('от 15 до 180 минут');
  });
});

describe('eventTypeFormFromEventType', () => {
  it('тип из API → значения формы правки (описание без undefined)', () => {
    expect(
      eventTypeFormFromEventType({
        title: 'Консультация',
        durationMinutes: 45,
      }),
    ).toEqual({ title: 'Консультация', description: '', durationMinutes: '45' });
    expect(
      eventTypeFormFromEventType({
        title: 'Звонок',
        description: 'Разберём идею',
        durationMinutes: 90,
      }),
    ).toEqual({ title: 'Звонок', description: 'Разберём идею', durationMinutes: '90' });
  });
});

describe('eventTypeDraftFromForm', () => {
  it('обрезает пробелы, пустое описание → undefined', () => {
    expect(
      eventTypeDraftFromForm({ title: '  Звонок ', description: '  ', durationMinutes: '45' }),
    ).toEqual({ title: 'Звонок', description: undefined, durationMinutes: 45 });
  });

  it('описание сохраняется обрезанным', () => {
    expect(
      eventTypeDraftFromForm({ title: 'x', description: ' обсуждение ', durationMinutes: '60' }),
    ).toEqual({ title: 'x', description: 'обсуждение', durationMinutes: 60 });
  });
});

// ── рабочие часы: строки недели ──────────────────────────────────────────────

describe('weekRowsFromDays', () => {
  it('null → дефолт D3: Пн–Пт 09:00–18:00, Сб–Вс выходные, порядок Пн..Вс', () => {
    const rows = weekRowsFromDays(null);
    expect(rows.map((r) => r.weekday)).toEqual(WEEK_DISPLAY_ORDER);
    expect(rows.map((r) => r.isDayOff)).toEqual([false, false, false, false, false, true, true]);
    expect(rows[0]).toMatchObject({ start: '09:00', end: '18:00' });
  });

  it('дни из GET маппатся в строки Пн..Вс с чч:мм', () => {
    const rows = weekRowsFromDays([
      { weekday: 0, isDayOff: true },
      { weekday: 1, isDayOff: false, startMinutes: 600, endMinutes: 1200 },
      { weekday: 2, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
      { weekday: 3, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
      { weekday: 4, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
      { weekday: 5, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
      { weekday: 6, isDayOff: true },
    ]);
    expect(rows.map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
    expect(rows[0]).toMatchObject({ start: '10:00', end: '20:00', isDayOff: false });
    // у выходного — латентные 09:00–18:00, чтобы включить день одним чекбоксом
    expect(rows[6]).toMatchObject({ isDayOff: true, start: '09:00', end: '18:00' });
  });
});

describe('validateWeekRows', () => {
  const workingWeek: WorkingDayRow[] = WEEK_DISPLAY_ORDER.map((weekday) => ({
    weekday,
    isDayOff: weekday === 0 || weekday === 6,
    start: '09:00',
    end: '18:00',
  }));

  it('валидная неделя — без ошибок', () => {
    expect(validateWeekRows(workingWeek)).toEqual({});
  });

  it('start ≥ end — ошибка на endMinutes дня (ключ как у сервера)', () => {
    const rows = workingWeek.map((r) =>
      r.weekday === 2 ? { ...r, start: '18:00', end: '09:00' } : r,
    );
    const errors = validateWeekRows(rows);
    expect(errors['days.2.endMinutes']).toBe(
      'конец должен быть позже начала (или сделайте день выходным)',
    );
  });

  it('пустое время рабочего дня — ошибка на поле', () => {
    const rows = workingWeek.map((r) => (r.weekday === 4 ? { ...r, start: '' } : r));
    const errors = validateWeekRows(rows);
    expect(errors['days.4.startMinutes']).toBe('укажите время');
  });

  it('у выходного время не проверяется', () => {
    const rows = workingWeek.map((r) => (r.weekday === 6 ? { ...r, start: '', end: 'мусор' } : r));
    expect(validateWeekRows(rows)).toEqual({});
  });
});

describe('buildWorkingHoursBody', () => {
  it('дни сортируются по weekday 0..6; у выходного минуты не отправляются', () => {
    const rows: WorkingDayRow[] = [
      { weekday: 6, isDayOff: true, start: '09:00', end: '18:00' },
      { weekday: 0, isDayOff: true, start: '09:00', end: '18:00' },
      { weekday: 1, isDayOff: false, start: '10:00', end: '19:30' },
      { weekday: 2, isDayOff: false, start: '09:00', end: '18:00' },
      { weekday: 3, isDayOff: false, start: '09:00', end: '18:00' },
      { weekday: 4, isDayOff: false, start: '09:00', end: '18:00' },
      { weekday: 5, isDayOff: false, start: '09:00', end: '18:00' },
    ];
    expect(buildWorkingHoursBody(rows)).toEqual({
      days: [
        { weekday: 0, isDayOff: true },
        { weekday: 1, isDayOff: false, startMinutes: 600, endMinutes: 1170 },
        { weekday: 2, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
        { weekday: 3, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
        { weekday: 4, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
        { weekday: 5, isDayOff: false, startMinutes: 540, endMinutes: 1080 },
        { weekday: 6, isDayOff: true },
      ],
    });
  });
});

// ── конверт ошибок (ADR-005) ─────────────────────────────────────────────────

describe('failureFromApiError', () => {
  it('VALIDATION_ERROR с details — полевые ошибки', () => {
    expect(
      failureFromApiError({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Невалидное тело запроса',
          details: [
            { field: 'title', message: 'обязательное поле' },
            { field: 'durationMinutes', message: 'некорректное значение' },
          ],
        },
      }),
    ).toEqual({
      kind: 'invalid',
      issues: [
        { field: 'title', message: 'обязательное поле' },
        { field: 'durationMinutes', message: 'некорректное значение' },
      ],
    });
  });

  it('VALIDATION_ERROR без details — сообщение конверта как общее', () => {
    expect(
      failureFromApiError({ error: { code: 'VALIDATION_ERROR', message: 'битый JSON' } }),
    ).toEqual({ kind: 'invalid', issues: [], message: 'битый JSON' });
  });

  it('NOT_FOUND — тип уже удалён в другом окне', () => {
    expect(
      failureFromApiError({ error: { code: 'NOT_FOUND', message: 'Тип события не найден' } }),
    ).toEqual({ kind: 'notFound', message: 'Тип события не найден' });
  });

  it('нечто без конверта — unknown', () => {
    expect(failureFromApiError(null)).toEqual({ kind: 'unknown' });
    expect(failureFromApiError({ weird: true })).toEqual({ kind: 'unknown' });
  });
});

describe('splitIssues', () => {
  it('известные поля — в fieldErrors, прочее — в общие сообщения', () => {
    const { fieldErrors, otherMessages } = splitIssues(
      [
        { field: 'title', message: 'обязательное поле' },
        {
          field: 'days.2.endMinutes',
          message: 'конец должен быть позже начала (или сделайте день выходным)',
        },
        { field: 'days', message: 'нужно ровно 7 дней — по одному на каждый день недели' },
      ],
      ['title', 'description', 'durationMinutes', 'days.2.endMinutes'],
    );
    expect(fieldErrors).toEqual({
      title: 'обязательное поле',
      'days.2.endMinutes': 'конец должен быть позже начала (или сделайте день выходным)',
    });
    expect(otherMessages).toEqual(['нужно ровно 7 дней — по одному на каждый день недели']);
  });

  it('дубликат поля — побеждает первое сообщение', () => {
    const { fieldErrors } = splitIssues(
      [
        { field: 'title', message: 'первое' },
        { field: 'title', message: 'второе' },
      ],
      ['title'],
    );
    expect(fieldErrors).toEqual({ title: 'первое' });
  });
});
