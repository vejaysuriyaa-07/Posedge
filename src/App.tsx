import { MotionConfig } from 'motion/react';
import { HashRouter } from 'react-router';
import { AppRoutes } from './app/router';
import { ToastProvider } from './app/Toasts';
import { UiProvider } from './app/ui';

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <UiProvider>
          <HashRouter>
            <AppRoutes />
          </HashRouter>
        </UiProvider>
      </ToastProvider>
    </MotionConfig>
  );
}
