import { canonicalJson } from '../src/utils/canonical.js';

export { canonicalJson };

/** SHA-256 of a value's canonical JSON, in hex. */
export async function hashOf(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonicalJson(value))
  );
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}
