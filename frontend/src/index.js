import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { loadSettings } from './utils/settings';
import { installTheme, themeOverridesFromSettings } from './utils/theme';

// Paint with the built-in palette immediately, so the page is never unstyled
// while settings.yaml is in flight.
installTheme();

const root = ReactDOM.createRoot(document.getElementById('root'));

// Settings are loaded before the first render rather than alongside it.
// getSetting is synchronous, so rendering first meant every component read its
// fallback value and nothing re-read the real one once the fetch landed.
loadSettings().then((settings) => {
  installTheme(themeOverridesFromSettings(settings));

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
