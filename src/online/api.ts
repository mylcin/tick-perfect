// Calls to the game's own API (/api, see server/), with the player's
// token when they are signed in.

export class ApiFailure extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ApiOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: unknown;
  readonly token?: string | null;
}

/** Calls `route` (e.g. `/rounds`) and returns its JSON, or throws. */
export async function api<T>(
  route: string,
  { method = 'GET', body, token }: ApiOptions = {}
): Promise<T> {
  const response = await fetch(`/api${route}`, {
    method,
    headers: {
      ...(token && { authorization: `Bearer ${token}` }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return undefined as T;
  const json = (await response.json().catch(() => null)) as
    (T & { error?: { code: string; message: string } }) | null;
  if (!response.ok || json === null) {
    throw new ApiFailure(
      response.status,
      json?.error?.code ?? 'unknown',
      json?.error?.message ?? response.statusText
    );
  }
  return json;
}
