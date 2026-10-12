import { ApiFailure } from '../online/api';

/** A message for any failed admin call. */
export function failureText(error: unknown): string {
  return error instanceof ApiFailure
    ? `${error.message} (${String(error.status)})`
    : 'The API can’t be reached.';
}
