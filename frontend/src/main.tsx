import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ClerkProvider } from '@clerk/react';
import { store } from './store';
import App from './App';
import { TTSProvider } from './context/TTSContext';
import './index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment.');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey} afterSignOutUrl="/">
      <Provider store={store}>
        <BrowserRouter>
          <TTSProvider>
            <App />
          </TTSProvider>
        </BrowserRouter>
      </Provider>
    </ClerkProvider>
  </React.StrictMode>
);
