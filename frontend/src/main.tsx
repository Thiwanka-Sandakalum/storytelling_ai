import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { ClerkProvider } from '@clerk/react';
import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';
import { store } from './store';
import App from './App';
import { TTSProvider } from './context/TTSContext';
import './index.css';

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

if (!clerkPublishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in environment.');
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const hasFirebaseAnalyticsConfig = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
  firebaseConfig.measurementId,
].every(Boolean);

if (hasFirebaseAnalyticsConfig) {
  const firebaseApp = initializeApp(firebaseConfig);
  isSupported()
    .then((supported) => {
      if (!supported) return;
      try {
        getAnalytics(firebaseApp);
      } catch (error) {
        console.warn('Firebase analytics disabled:', error);
      }
    })
    .catch((error) => {
      console.warn('Firebase analytics support check failed:', error);
    });
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
