import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { ONLINE } from './online/config';
import {
  createPageErrors,
  listenForErrors,
  sendReport,
} from './online/page-errors';
import { Root } from './root';
import { encodeChallenge } from './state/challenge';
import { sessionStore } from './state/session';
import { safeStorage } from './utils/safe-storage';
import { reloadOnStaleBuild } from './utils/stale-build';
import './index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element in index.html');

const VERSION = String(import.meta.env['VITE_APP_VERSION'] ?? 'dev');
/** A stale chunk's reload is on its way, and will fix what failed. */
let reloading = false;

// A deployed build with an online side reports its errors to it.
const pageErrors =
  ONLINE && import.meta.env.PROD
    ? createPageErrors({
        send: sendReport,
        version: VERSION,
        origin: location.origin,
        path: () => location.pathname,
        paused: () => reloading,
      })
    : null;
if (pageErrors) listenForErrors(window, pageErrors);

// A chunk a deploy replaced: a reload brings in the current build.
window.addEventListener(
  'vite:preloadError',
  reloadOnStaleBuild({
    storage: safeStorage(() => window.sessionStorage),
    version: VERSION,
    reload: () => {
      // The session took a link's challenge out of the address; put it
      // back, so the reloaded page still shows it.
      const { challenge } = sessionStore.getState();
      if (challenge) {
        const url = new URL(location.href);
        url.searchParams.set('c', encodeChallenge(challenge));
        history.replaceState(history.state, '', url);
      }
      location.reload();
    },
    willReload: () => {
      reloading = true;
    },
    inRound: () => sessionStore.getState().screen === 'game',
    onTitle: then => {
      const stop = sessionStore.subscribe(({ screen }) => {
        if (screen !== 'title') return;
        stop();
        then();
      });
    },
  })
);

createRoot(
  container,
  pageErrors
    ? {
        // What an error boundary caught (the 3D scene's, mostly) never
        // reaches the window.
        onCaughtError: error => {
          console.error(error);
          pageErrors.report('render', error);
        },
      }
    : {}
).render(
  <StrictMode>
    <Root path={location.pathname} />
  </StrictMode>
);
