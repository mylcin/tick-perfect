import { lazy, Suspense } from 'react';

import { App } from './app';

// The admin panel (/admin) and the privacy notice (/privacy) are chunks of
// their own, loaded only there.
const AdminApp = lazy(() => import('./admin/admin-app'));
const PrivacyPage = lazy(() => import('./privacy/privacy-page'));

/** The game; at /admin the admin panel, at /privacy the privacy notice. */
export function Root({ path }: { path: string }) {
  if (/^\/admin(\/|$)/.test(path)) {
    return (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    );
  }
  if (/^\/privacy\/?$/.test(path)) {
    return (
      <Suspense fallback={null}>
        <PrivacyPage />
      </Suspense>
    );
  }
  return <App />;
}
