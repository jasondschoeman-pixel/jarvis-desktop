import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/app.css';

// In dev mode (browser without Electron preload), load the shim before rendering
async function bootstrap() {
  if (typeof (window as any).jarvis === 'undefined') {
    await import('./dev-shim');
  }
  const App = (await import('./App')).default;
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

bootstrap();