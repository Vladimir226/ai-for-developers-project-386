// Структурные JSON-логи (NFR-006): одна строка = один объект.
// Единая точка сериализации, чтобы формат не расползался по модулю.

export type RequestLogLine = {
  time: string;
  level: 'info';
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
};

export function logRequestLine(line: RequestLogLine): void {
  console.log(JSON.stringify(line));
}
