import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ClerkProvider } from '@clerk/react';
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { store } from './store';
import App from './App';
import { TTSProvider } from './context/TTSContext';
import './index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment.');
}

const firebaseConfig = {
  apiKey: 'AIzaSyBaUjXIuPVUpsBg2yuQH0a-lxAfbcA44Fc',
  authDomain: 'magictalee.firebaseapp.com',
  projectId: 'magictalee',
  storageBucket: 'magictalee.firebasestorage.app',
  messagingSenderId: '429670098232',
  appId: '1:429670098232:web:c6f012970b0906efcc8dcd',
  measurementId: 'G-K47MWP124H',
};

const firebaseApp = initializeApp(firebaseConfig);
getAnalytics(firebaseApp);

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
