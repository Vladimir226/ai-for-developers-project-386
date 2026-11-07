import { z } from 'zod';

const Booking = z
  .object({
    id: z.string().uuid(),
    slotId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    bookerName: z.string(),
    bookerContact: z.string(),
    comment: z.string().optional(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .passthrough();
const BookingList = z.object({ bookings: z.array(Booking) }).passthrough();
const CreateBookingRequest = z
  .object({
    slotId: z.string().uuid(),
    bookerName: z.string(),
    bookerContact: z.string(),
    comment: z.string().optional(),
  })
  .passthrough();
const BookingCreated = Booking;
const ErrorCode = z.enum([
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'SLOT_OVERLAP',
  'SLOT_ALREADY_BOOKED',
  'SLOT_IN_PAST',
]);
const ValidationErrorItem = z.object({ field: z.string(), message: z.string() }).passthrough();
const ErrorBody = z
  .object({
    code: ErrorCode,
    message: z.string(),
    details: z.array(ValidationErrorItem).optional(),
  })
  .passthrough();
const ErrorEnvelope = z.object({ error: ErrorBody }).passthrough();
const SlotView = z.enum(['free', 'all']);
const view = SlotView.optional().default('free');
const Slot = z
  .object({
    id: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .passthrough();
const SlotList = z.object({ slots: z.array(Slot) }).passthrough();
const CreateSlotRequest = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .passthrough();
const SlotCreated = Slot;

export const schemas = {
  Booking,
  BookingList,
  CreateBookingRequest,
  BookingCreated,
  ErrorCode,
  ValidationErrorItem,
  ErrorBody,
  ErrorEnvelope,
  SlotView,
  view,
  Slot,
  SlotList,
  CreateSlotRequest,
  SlotCreated,
};
