import { NextResponse, type NextRequest } from 'next/server';

// request-id на каждый HTTP-запрос (NFR-006): генерируется здесь, прокидывается
// в обработчик (его читает withRequestLogging) и наружу в ответе.
// Статика (_next/static, _next/image, favicon) исключена из matcher —
// по аддендуму к #2 она не логируется.

export function middleware(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
