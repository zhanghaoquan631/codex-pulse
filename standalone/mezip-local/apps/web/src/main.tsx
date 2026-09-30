import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@me-zip/design-system/tokens.css';
import { App } from './App.js';
import './styles.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('ME.zip root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
