import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

// Шов 3 (unit, чистая функция middleware): observable — заголовки ответа.
// Проброс request-id дальше в обработчик проверяется e2e (#9).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('middleware: request-id', () => {
  it('генерирует x-request-id и отдаёт его в заголовке ответа', async () => {
    const { middleware } = await import('./middleware');

    const response = middleware(new NextRequest('http://localhost:3000/'));

    expect(response.headers.get('x-request-id')).toMatch(UUID_RE);
  });

  it('сохраняет пришедший x-request-id без перегенерации', async () => {
    const { middleware } = await import('./middleware');

    const response = middleware(
      new NextRequest('http://localhost:3000/', {
        headers: { 'x-request-id': 'given-id' },
      }),
    );

    expect(response.headers.get('x-request-id')).toBe('given-id');
  });
});
