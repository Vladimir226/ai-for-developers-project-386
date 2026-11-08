// Отображение времени в APP_TZ (ADR-009): форматы из утверждённого макета
// admin.html (#13). Чистые функции — шаблон и тексты видны юнит-тестам (шов 3)
// и одинаково работают на сервере (RSC рендерит список) и в клиентских
// компонентах (подсказки ошибок).
//
// Грабли ru-RU, зафиксированные тестами: Intl сам вставляет предлог «в»
// между датой и временем, поэтому день и время форматируются раздельно
// и склеиваются разделителем макета «·».

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

function timeFormatter(timeZone: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat('ru-RU', { timeZone, hour: '2-digit', minute: '2-digit' });
}

/** «вт, 10 ноября · 10:00–10:30»; через полночь — обе даты. */
export function formatInterval(startsAt: string, endsAt: string, timeZone: string): string {
  const day = dayFormatter(timeZone);
  const time = timeFormatter(timeZone);

  const start = new Date(startsAt);
  const end = new Date(endsAt);

  const startDay = day.format(start);
  const endDay = day.format(end);
  if (startDay === endDay) {
    return `${startDay} · ${time.format(start)}–${time.format(end)}`;
  }
  return `${startDay} · ${time.format(start)} – ${endDay} · ${time.format(end)}`;
}

/** «10:00–10:30» в пределах дня; через полночь — полный формат с датами. */
export function formatTimeRange(startsAt: string, endsAt: string, timeZone: string): string {
  const day = dayFormatter(timeZone);
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (day.format(start) === day.format(end)) {
    const time = timeFormatter(timeZone);
    return `${time.format(start)}–${time.format(end)}`;
  }
  return formatInterval(startsAt, endsAt, timeZone);
}

/**
 * День и время одним форматом: «7 ноября в 18:40». Предлог «в» между датой
 * и временем вставляет сам ru-RU Intl (пиннинг-тест в display.test) — на
 * этом держится подпись «создана …» карточек брони (events.html, #57).
 */
export function formatDayTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(instant));
}

/**
 * Человекочитаемое имя зоны из CLDR: первый сегмент длинного имени
 * («Москва, стандартное время» → «Москва»; для регионов — «Индия»,
 * «Восточная Америка»). Fallback — идентификатор зоны.
 */
function tzPlace(timeZone: string, at: Date): string {
  const long = new Intl.DateTimeFormat('ru-RU', { timeZone, timeZoneName: 'long' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  const place = long?.split(',')[0]?.trim();
  return place || timeZone;
}

/** Смещение зоны на данный инстант в форме «+3» / «-4» / «+5:30». */
function tzOffsetLabel(timeZone: string, at: Date): string {
  const offset = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName')?.value;
  // CLDR: «GMT+03:00» / «GMT-04:00» / «GMT+05:30» / «GMT» для нуля
  const match = offset?.match(/GMT([+-])(\d{2}):(\d{2})/);
  if (!match) return 'UTC+0';
  const [, sign, hours, minutes] = match;
  const m = minutes === '00' ? '' : `:${minutes}`;
  return `UTC${sign}${Number(hours)}${m}`;
}

/** Метка зоны страницы: «Москва, UTC+3». Смещение — на момент `at`. */
export function tzLabel(timeZone: string, at: Date): string {
  return `${tzPlace(timeZone, at)}, ${tzOffsetLabel(timeZone, at)}`;
}

/** «5 интервалов» — русская плюрализация для счётчиков списка и успеха. */
export function countIntervals(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let form: string;
  if (mod10 === 1 && mod100 !== 11) form = 'интервал';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) form = 'интервала';
  else form = 'интервалов';
  return `${n} ${form}`;
}

/** «1 активная» — плюрализация счётчика секции «Брони» (макет admin.html). */
export function countActiveBookings(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  let form: string;
  if (mod10 === 1 && mod100 !== 11) form = 'активная';
  else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) form = 'активные';
  else form = 'активных';
  return `${n} ${form}`;
}
