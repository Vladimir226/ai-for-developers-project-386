import { z } from 'zod';

const BookingEventType = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(100),
    durationMinutes: z.number().int().gte(15).lte(180),
  })
  .passthrough();
const Booking = z
  .object({
    id: z.string().uuid(),
    eventType: BookingEventType,
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
    bookerName: z.string().min(1).max(100),
    bookerContact: z.string().min(5).max(200),
    comment: z.string().max(500).optional(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .passthrough();
const BookingList = z.object({ bookings: z.array(Booking) }).passthrough();
const CreateBookingRequest = z
  .object({
    eventTypeId: z.string().uuid(),
    startsAt: z.string().datetime({ offset: true }),
    bookerName: z.string().min(1).max(100),
    bookerContact: z.string().min(5).max(200),
    comment: z.string().max(500).optional(),
  })
  .passthrough();
const BookingCreated = Booking;
const ErrorCode = z.enum(['VALIDATION_ERROR', 'NOT_FOUND', 'SLOT_ALREADY_BOOKED', 'SLOT_IN_PAST']);
const ValidationErrorItem = z.object({ field: z.string(), message: z.string() }).passthrough();
const ErrorBody = z
  .object({
    code: ErrorCode,
    message: z.string(),
    details: z.array(ValidationErrorItem).optional(),
  })
  .passthrough();
const ErrorEnvelope = z.object({ error: ErrorBody }).passthrough();
const EventType = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    durationMinutes: z.number().int().gte(15).lte(180),
  })
  .passthrough();
const EventTypeList = z.object({ eventTypes: z.array(EventType) }).passthrough();
const EventTypeDraft = z
  .object({
    title: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    durationMinutes: z.number().int().gte(15).lte(180),
  })
  .passthrough();
const CreateEventTypeRequest = EventTypeDraft;
const EventTypeCreated = EventType;
const UpdateEventTypeRequest = EventTypeDraft;
const Slot = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .passthrough();
const SlotList = z.object({ slots: z.array(Slot) }).passthrough();
const WorkingHoursDay = z
  .object({
    weekday: z.number().int().gte(0).lte(6),
    isDayOff: z.boolean(),
    startMinutes: z.number().int().gte(0).lte(1440).optional(),
    endMinutes: z.number().int().gte(0).lte(1440).optional(),
  })
  .passthrough();
const WorkingHours = z.object({ days: z.array(WorkingHoursDay) }).passthrough();

export const schemas = {
  BookingEventType,
  Booking,
  BookingList,
  CreateBookingRequest,
  BookingCreated,
  ErrorCode,
  ValidationErrorItem,
  ErrorBody,
  ErrorEnvelope,
  EventType,
  EventTypeList,
  EventTypeDraft,
  CreateEventTypeRequest,
  EventTypeCreated,
  UpdateEventTypeRequest,
  Slot,
  SlotList,
  WorkingHoursDay,
  WorkingHours,
};
