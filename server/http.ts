// Small helpers for the API's requests and responses, all in the web
// platform's Request and Response, as Vercel Functions take them.

/** An error the API answers with, by status and a stable code. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string = code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json(
  body: unknown,
  { status = 200, cache = 'no-store' }: { status?: number; cache?: string } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cache,
    },
  });
}

export function errorResponse(error: ApiError): Response {
  return json(
    { error: { code: error.code, message: error.message } },
    { status: error.status }
  );
}

/** The request's JSON body, refused past `limit` bytes. */
export async function readJson(
  request: Request,
  limit: number
): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > limit) throw new ApiError(413, 'tooLarge');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > limit) {
    throw new ApiError(413, 'tooLarge');
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(400, 'badJson', 'The body is not valid JSON');
  }
}

/** The caller's address, as the platform's proxy reports it. */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return (
    forwarded?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

/** A plain object's fields, or an error naming what it should have been. */
export function objectBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError(400, 'badBody', 'The body must be a JSON object');
  }
  return value as Record<string, unknown>;
}
