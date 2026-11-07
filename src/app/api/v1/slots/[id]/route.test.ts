import { beforeEach, describe, expect, it } from 'vitest';
import { schemas } from '@/generated/zod';
import {
  createSlotViaApi,
  deleteSlot,
  getSlots,
  silenceRequestLogs,
} from '@/lib/testing/slots-api';
import { clearSlots, setupTestDatabase } from '@/lib/testing/test-db';

// Шов 1 (integration, ADR-004): DELETE /api/v1/slots/{id}. Проверка эффекта
// удаления — через публичный интерфейс (GET списка), не чтением БД.

setupTestDatabase();

describe('DELETE /api/v1/slots/{id}', () => {
  beforeEach(async () => {
    silenceRequestLogs();
    await clearSlots();
  });

  it('удаляет слот: 204, слот исчезает из списка', async () => {
    const id = await createSlotViaApi();

    const response = await deleteSlot(id);

    expect(response.status).toBe(204);
    expect(response.headers.get('x-request-id')).toEqual(expect.any(String));

    const list = schemas.SlotList.parse(await (await getSlots('?view=all')).json());
    expect(list.slots.map((slot) => slot.id)).not.toContain(id);
  });

  it('повторное удаление того же слота → 404 NOT_FOUND', async () => {
    const id = await createSlotViaApi();
    await deleteSlot(id);

    const response = await deleteSlot(id);

    expect(response.status).toBe(404);
    const body = schemas.ErrorEnvelope.parse(await response.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toEqual(expect.any(String));
  });

  it('несуществующий id → 404 NOT_FOUND', async () => {
    const response = await deleteSlot('0ea3a3f5-6d21-4e5a-8f3e-91d3b1a4c22e');

    expect(response.status).toBe(404);
    expect(schemas.ErrorEnvelope.parse(await response.json()).error.code).toBe('NOT_FOUND');
  });
});
