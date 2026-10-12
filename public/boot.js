// Runs before the first paint (index.html loads it ahead of the stylesheet)
// and dresses the page from the saved settings, so a load or a reload
// paints the studio it stays in: the theme, night mode, animations off and
// the language. The app keeps them up to date from then on (src/app.tsx,
// src/hooks/use-studio.ts).
//
// A classic script of its own, not inline: the content security policy
// allows only the site's own files. Plain ES5 that never throws, for any
// browser and any saved value; where it can't read the settings, the
// stylesheet's defaults (the system's scheme and motion) stand.
(function () {
  var root = document.documentElement;
  // The browser's colour round the page in each studio: its backdrop's edge
  // (src/index.css; THEME_COLORS in src/screens/studio.ts).
  var COLORS = { light: '#E2DED6', dark: '#0C0D0E', night: '#050506' };
  var settings = null;
  try {
    var saved = JSON.parse(window.localStorage.getItem('tick-perfect'));
    settings = saved && saved.state && saved.state.settings;
  } catch (error) {
    // No storage, or nothing usable in it.
  }
  if (!settings || typeof settings !== 'object') settings = {};

  var theme =
    settings.theme === 'light' || settings.theme === 'dark'
      ? settings.theme
      : null;
  // The admin panel stays in the dark studio whatever the game's setting.
  if (/^\/admin(\/|$)/.test(window.location.pathname)) theme = 'dark';
  var night = settings.night === true;
  if (theme) root.setAttribute('data-theme', theme);
  if (night) root.setAttribute('data-night', '');
  if (typeof settings.reducedMotion === 'boolean') {
    root.setAttribute(
      'data-motion',
      settings.reducedMotion ? 'reduced' : 'full'
    );
  }
  if (
    typeof settings.language === 'string' &&
    /^[a-z]{2,3}$/.test(settings.language)
  ) {
    root.lang = settings.language;
  }

  var systemDark = false;
  try {
    systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch (error) {
    // An old browser: its light default stands.
  }
  var dark = night || (theme ? theme === 'dark' : systemDark);

  // A theme of its own, or night, wears its colour whatever the system's
  // scheme; otherwise each meta keeps its own scheme's (index.html).
  var metas = document.getElementsByTagName('meta');
  for (var i = 0; i < metas.length; i++) {
    var meta = metas[i];
    if (meta.name === 'theme-color' && (theme || night)) {
      meta.content = COLORS[night ? 'night' : theme];
    }
    // An installed app on iOS reads its status bar's style as it starts:
    // dark text on the light studio, white text over the dark ones. (Only
    // at launch, and only on a device can this be checked.)
    if (meta.name === 'apple-mobile-web-app-status-bar-style') {
      meta.content = dark ? 'black-translucent' : 'default';
    }
  }
})();
