// Конвертация «настенного» времени (то, что ввёл владелец в поля даты/времени
// в своей зоне APP_TZ) в UTC-метку — аддендум #5, ADR-009. Без библиотек:
// смещение зоны считается через Intl round-trip.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

interface WallDateTime {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
}

/** Валидирует формат полей `input[type=date]` / `input[type=time]`. */
function parseWallDateTime(date: string, time: string): WallDateTime {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
    throw new RangeError(`неверный формат даты/времени: ${date} ${time}`);
  }

  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  // Date.UTC молча перескакивает на «следующий день» (31 ноября → 1 декабря),
  // поэтому невозможные даты отлавливаем сравнением компонентов.
  const asUtc = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(asUtc);
  const calendarOk =
    roundTrip.getUTCFullYear() === year &&
    roundTrip.getUTCMonth() === month - 1 &&
    roundTrip.getUTCDate() === day;
  if (!calendarOk || hour > 23 || minute > 59) {
    throw new RangeError(`несуществующие дата/время: ${date} ${time}`);
  }

  return { year, month, day, hour, minute };
}

/**
 * Смещение зоны в мс на данный инстант: «настенные» части форматирования
 * минус сам инстант. en-US даёт цифровые части без скрытой локализации.
 */
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);

  const get = (type: string): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? '';
    // hour '24' в hour12:false означает полночь предыдущего дня
    return Number(raw === '24' ? '0' : raw);
  };

  const wallAsIfUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return wallAsIfUtc - at.getTime();
}

/**
 * «Настенное» время зоны в UTC-метку (ISO 8601, Z — форма, принимаемая
 * контрактом, ADR-009).
 *
 * Крайние случаи перехода на летнее время фиксируются тестами:
 * - неоднозначное время (осенний «повторный» час) → ранний случай;
 * - несуществующее время (весенний «пропавший» час) → момент после скачка.
 */
export function wallTimeToUtcIso(date: string, time: string, timeZone: string): string {
  const wall = parseWallDateTime(date, time);
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);

  // Два прохода: смещение зависит от инстанта, а инстант — от смещения.
  // Для зон без DST (включая Europe/Moscow) сходится за первый.
  const first = naive - tzOffsetMs(new Date(naive), timeZone);
  const second = naive - tzOffsetMs(new Date(first), timeZone);
  const candidates = first === second ? [first] : [first, second];

  const matches = (instant: number): boolean => {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(instant));
    const [y, mo, d, h, mi] = formatted.match(/\d+/g)?.map(Number) ?? [];
    return (
      y === wall.year &&
      mo === wall.month &&
      d === wall.day &&
      h === wall.hour &&
      mi === wall.minute
    );
  };

  const exact = candidates.find(matches);
  // Ранний случай при неоднозначности — candidates идут в порядке проходов;
  // при «пропавшем» часе точного соответствия нет — берём более поздний момент.
  const resolved = exact ?? Math.max(...candidates);
  return new Date(resolved).toISOString();
}
