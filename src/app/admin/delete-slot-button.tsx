'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createApiClient } from '@/lib/sdk/client';

// Удаление интервала (FR-002): SDK → router.refresh() (ADR-004). Список —
// серверная истина, локальное состояние не ведём; 404 (уже удалён) и любые
// сбои сводятся к тому же refresh — страница покажет фактическое состояние.

export function DeleteSlotButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const api = createApiClient();

  return (
    <button
      type="button"
      title="Удалить интервал"
      aria-label="Удалить интервал"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api.DELETE('/api/v1/slots/{id}', { params: { path: { id } } });
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
      className="shrink-0 grid place-items-center size-9 rounded-lg text-faint hover:text-clay hover:bg-clay-soft transition disabled:opacity-50"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </svg>
    </button>
  );
}
