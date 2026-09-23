import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { migrateLegacyStorage } from './constants/brand';

// Carry over locally stored progress/preferences saved under the previous
// product name before anything reads from storage.
migrateLegacyStorage();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
