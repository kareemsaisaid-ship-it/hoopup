import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { CourtsPage, FeedPage, ProfilePage } from '../features/discovery';
import { CreateSessionPage, EditSessionPage, MySessionsPage, SessionDetailPage } from '../features/sessions';
import { AuthGuard } from './AuthGuard';
import { LoginPage } from './LoginPage';
import { AppShell } from './shell';

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            path="/"
            element={
              <AuthGuard>
                <FeedPage />
              </AuthGuard>
            }
          />
          <Route
            path="/courts"
            element={
              <AuthGuard>
                <CourtsPage />
              </AuthGuard>
            }
          />
          <Route
            path="/profile"
            element={
              <AuthGuard>
                <ProfilePage />
              </AuthGuard>
            }
          />
          <Route
            path="/profile/:userId"
            element={
              <AuthGuard>
                <ProfilePage />
              </AuthGuard>
            }
          />
          <Route
            path="/sessions/new"
            element={
              <AuthGuard>
                <CreateSessionPage />
              </AuthGuard>
            }
          />
          <Route
            path="/sessions/:sessionId"
            element={
              <AuthGuard>
                <SessionDetailPage />
              </AuthGuard>
            }
          />
          <Route
            path="/sessions/:sessionId/edit"
            element={
              <AuthGuard>
                <EditSessionPage />
              </AuthGuard>
            }
          />
          <Route
            path="/my-sessions"
            element={
              <AuthGuard>
                <MySessionsPage />
              </AuthGuard>
            }
          />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
};
