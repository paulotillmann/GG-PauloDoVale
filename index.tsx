import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { TEMPLATE_CONFIG } from './src/config/template.config';

// Injeta configurações de SEO dinamicamente
document.title = TEMPLATE_CONFIG.pageTitle;
const metaDescription = document.querySelector('meta[name="description"]');
if (metaDescription) {
  metaDescription.setAttribute('content', TEMPLATE_CONFIG.metaDescription);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);