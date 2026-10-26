import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { KioskProvider } from './context/KioskContext';
import { KioskLayout } from './components/kiosk/KioskLayout';
import { AdminAuthGuard } from './components/admin/AdminAuthGuard';

// Kiosk Screens
import { WelcomePage } from './pages/kiosk/WelcomePage';
import { DetailsPage } from './pages/kiosk/DetailsPage';
import { DrawPage } from './pages/kiosk/DrawPage';
import { ResultPage } from './pages/kiosk/ResultPage';

// Admin Screens
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { AdminInventory } from './pages/admin/AdminInventory';
import { AdminHistory } from './pages/admin/AdminHistory';
import { AdminSettings } from './pages/admin/AdminSettings';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <KioskProvider>
          <Routes>
            {/* Public Kiosk Routes */}
            <Route
              path="/"
              element={
                <KioskLayout>
                  <WelcomePage />
                </KioskLayout>
              }
            />
            <Route
              path="/details"
              element={
                <KioskLayout>
                  <DetailsPage />
                </KioskLayout>
              }
            />
            <Route
              path="/draw"
              element={
                <KioskLayout>
                  <DrawPage />
                </KioskLayout>
              }
            />
            <Route
              path="/result"
              element={
                <KioskLayout>
                  <ResultPage />
                </KioskLayout>
              }
            />

            {/* Protected Admin Routes */}
            <Route
              path="/admin"
              element={
                <AdminAuthGuard>
                  <AdminDashboard />
                </AdminAuthGuard>
              }
            />
            <Route
              path="/admin/inventory"
              element={
                <AdminAuthGuard>
                  <AdminInventory />
                </AdminAuthGuard>
              }
            />
            <Route
              path="/admin/history"
              element={
                <AdminAuthGuard>
                  <AdminHistory />
                </AdminAuthGuard>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <AdminAuthGuard>
                  <AdminSettings />
                </AdminAuthGuard>
              }
            />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </KioskProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
