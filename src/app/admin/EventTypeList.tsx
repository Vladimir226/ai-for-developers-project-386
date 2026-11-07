// Список типов событий (серверный рендер из RSC self-fetch, ADR-004): карточка
// каждого типа — строка EventTypeRow (клиентская: правка и каскадное удаление
// D4). Деградация без данных — как в прежнем списке интервалов: блок с
// подсказкой обновить страницу, страница остаётся 200.

import { countEventTypes } from './admin-logic';
import { EventTypeRow, type EventTypeRowData } from './EventTypeRow';

interface EventTypeListProps {
  eventTypes: EventTypeRowData[] | null;
}

export function EventTypeList({ eventTypes }: EventTypeListProps) {
  if (!eventTypes) {
    return (
      <section
        aria-label="Типы событий"
        className="rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
      >
        <div className="px-6 py-12 text-center">
          <p className="text-[15px] font-semibold">Не удалось загрузить типы событий</p>
          <p className="mt-1.5 text-[13.5px] text-muted">Обновите страницу и попробуйте ещё раз.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Типы событий"
      className="rounded-2xl border border-line bg-card shadow-[0_1px_3px_rgba(55,53,47,0.04)]"
    >
      <div className="flex items-baseline justify-between px-5 sm:px-7 pt-6 pb-4">
        <h2 className="text-[19px] font-bold tracking-tight">Ваши типы</h2>
        {eventTypes.length > 0 && (
          <span className="text-[12.5px] text-muted">{countEventTypes(eventTypes.length)}</span>
        )}
      </div>

      {eventTypes.length === 0 ? (
        <div className="border-t border-line px-6 py-12 text-center">
          <p className="text-[15px] font-semibold">Типов ещё нет</p>
          <p className="mt-1.5 text-[13.5px] text-muted">
            Создайте первый вид брони — он сразу появится на публичной странице.
          </p>
        </div>
      ) : (
        <ul className="border-t border-line divide-y divide-line">
          {eventTypes.map((eventType) => (
            <EventTypeRow key={eventType.id} eventType={eventType} />
          ))}
        </ul>
      )}
    </section>
  );
}
