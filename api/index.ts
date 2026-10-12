import { depsFromEnv, isConfigured, type Deps } from '../server/deps.js';
import { handle } from '../server/router.js';

// The API as one Vercel Function. vercel.json sends every /api/* path here.
// Its dependencies are made once per instance and reused between requests.

let deps: Deps | null = null;

async function serve(request: Request): Promise<Response> {
  const env = process.env;
  if (!isConfigured(env)) {
    return Response.json(
      { error: { code: 'offline', message: 'The online features are off' } },
      { status: 503 }
    );
  }
  deps ??= depsFromEnv(env);
  return handle(request, deps);
}

export const GET = serve;
export const POST = serve;
export const PUT = serve;
export const PATCH = serve;
export const DELETE = serve;
