import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import './index.css';
import App from './App';
import { projectColorCss } from './domain/colors';

// Project color variables (--pc, --pc-tint, --pc-fg) generated from the single palette source.
const style = document.createElement('style');
style.id = 'project-colors';
style.textContent = projectColorCss();
document.head.appendChild(style);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
