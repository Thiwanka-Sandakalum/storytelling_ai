import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthenticateWithRedirectCallback, useAuth } from '@clerk/react';
import Layout from './components/Layout';
import TheForge from './views/TheForge';
import TheLibrary from './views/TheLibrary';
import NarratorStudio from './views/NarratorStudio';
import NotificationSystem from './components/ui/NotificationSystem';
import { SignInOrUpFlow } from './components/auth/SignInOrUpFlow';
import { AsyncStatePanel } from './components/ui/AsyncStatePanel';

function App() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <main className="min-h-screen bg-background text-on-background flex items-center justify-center px-6">
        <AsyncStatePanel
          state="initializing"
          title="Initializing Workspace"
          message="Restoring your secure session..."
        />
      </main>
    );
  }

  return (
    <>
      {isSignedIn ? (
        <Layout>
          <NotificationSystem />
          <Routes>
            <Route path="/" element={<TheForge />} />
            <Route path="/library" element={<TheLibrary />} />
            <Route path="/studio/:id" element={<NarratorStudio />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      ) : (
        <Routes>
          <Route
            path="/sso-callback"
            element={
              <AuthenticateWithRedirectCallback
                signInFallbackRedirectUrl="/"
                signUpFallbackRedirectUrl="/"
              />
            }
          />
          <Route
            path="*"
            element={
              <main className="min-h-screen bg-background text-on-background flex items-center justify-center px-6">
                <SignInOrUpFlow />
              </main>
            }
          />
        </Routes>
      )}
    </>
  );
}

export default App;
