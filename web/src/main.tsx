import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './platform';
import './theme.css';
import './polish.css';

const el = document.getElementById('root');
if (!el) throw new Error('#root missing');

registerServiceWorker();

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
