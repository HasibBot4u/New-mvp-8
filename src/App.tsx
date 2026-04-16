import React, { Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { CatalogProvider } from './contexts/CatalogContext';
import { ToastProvider } from './components/ui/Toast';
import { SystemSettingsProvider, useSystemSettings } from './contexts/SystemSettingsContext';
import BottomNav from './components/layout/BottomNav';
import { LoadingSpinner } from './components/shared/LoadingSpinner';
import MaintenancePage from './pages/MaintenancePage';
import { AdminLayout } from './pages/admin/AdminLayout';

// Lazy load pages
const LandingPage = React.lazy(() => import('./pages/LandingPage').then(m => ({ default: m.LandingPage })));
const LoginPage = React.lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));
const SignupPage = React.lazy(() => import('./pages/SignupPage'));
const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const CoursesPage = React.lazy(() => import('./pages/CoursesPage').then(m => ({ default: m.CoursesPage })));
const SubjectPage = React.lazy(() => import('./pages/SubjectPage').then(m => ({ default: m.SubjectPage })));
const ChaptersPage = React.lazy(() => import('./pages/ChaptersPage').then(m => ({ default: m.ChaptersPage })));
const VideoListPage = React.lazy(() => import('./pages/VideoListPage').then(m => ({ default: m.VideoListPage })));
const PlayerPage = React.lazy(() => import('./pages/PlayerPage').then(m => ({ default: m.PlayerPage })));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage').then(m => ({ default: m.ProfilePage })));
const NotesPage = React.lazy(() => import('./pages/NotesPage').then(m => ({ default: m.NotesPage })));
const SearchPage = React.lazy(() => import('./pages/SearchPage').then(m => ({ default: m.SearchPage })));
const NotificationsPage = React.lazy(() => import('./pages/NotificationsPage'));
const LiveClassPage = React.lazy(() => import('./pages/LiveClassPage').then(m => ({ default: m.LiveClassPage })));

const ProgressPage = React.lazy(() => import('./pages/ProgressPage'));
const SuccessStoriesPage = React.lazy(() => import('./pages/SuccessStoriesPage').then(m => ({ default: m.SuccessStoriesPage })));
const AboutPage = React.lazy(() => import('./pages/AboutPage'));
const ContactPage = React.lazy(() => import('./pages/ContactPage'));
const PrivacyPage = React.lazy(() => import('./pages/PrivacyPage'));
const TermsPage = React.lazy(() => import('./pages/TermsPage'));
const RefundPolicyPage = React.lazy(() => import('./pages/RefundPolicyPage'));

// Admin Pages
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard').then(m => ({ default: m.AdminDashboard })));
const AdminUsers = React.lazy(() => import('./pages/admin/AdminUsers').then(m => ({ default: m.AdminUsers })));
const AdminContent = React.lazy(() => import('./pages/admin/AdminContent').then(m => ({ default: m.AdminContent })));
const AdminSystem = React.lazy(() => import('./pages/admin/AdminSystem').then(m => ({ default: m.AdminSystem })));
const AdminLogs = React.lazy(() => import('./pages/admin/AdminLogs').then(m => ({ default: m.AdminLogs })));
const AdminEnrollment = React.lazy(() => import('./pages/admin/AdminEnrollment').then(m => ({ default: m.AdminEnrollment })));

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode, requireAdmin?: boolean }) {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { settings } = useSystemSettings();

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-indigo-600/20 border-t-indigo-600 rounded-full animate-spin" />
        <p className="mt-4 text-gray-500 bangla text-sm">লোড হচ্ছে...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  if (settings?.maintenance_mode && profile?.role !== 'admin') return <MaintenancePage />;
  if (profile?.is_blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow p-8 text-center max-w-sm">
          <p className="bangla text-xl font-bold text-red-600 mb-2">অ্যাকাউন্ট স্থগিত</p>
          <p className="bangla text-gray-600">অ্যাডমিনের সাথে যোগাযোগ করুন।</p>
        </div>
      </div>
    );
  }
  if (requireAdmin && profile?.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50 pb-16 md:pb-0">
      <Outlet />
      {user && <BottomNav />}
    </div>
  );
}

function App() {
  return (
    <SystemSettingsProvider>
      <AuthProvider>
        <CatalogProvider>
          <ToastProvider>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Suspense fallback={
                <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                  <LoadingSpinner />
                  <p className="mt-4 text-gray-500 bangla">লোড হচ্ছে...</p>
                </div>
              }>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />

                  <Route path="/about" element={<AboutPage />} />
                  <Route path="/contact" element={<ContactPage />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/success-stories" element={<SuccessStoriesPage />} />
                  <Route path="/refund-policy" element={<RefundPolicyPage />} />

                  <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/courses" element={<CoursesPage />} />
                    <Route path="/subject/:slug" element={<SubjectPage />} />
                    <Route path="/cycle/:cycleId" element={<ChaptersPage />} />
                    <Route path="/chapter/:chapterId" element={<VideoListPage />} />
                    <Route path="/watch/:videoId" element={<PlayerPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/notes" element={<NotesPage />} />
                    <Route path="/search" element={<SearchPage />} />
                    <Route path="/notifications" element={<NotificationsPage />} />
                    <Route path="/live" element={<LiveClassPage />} />
                    <Route path="/progress" element={<ProgressPage />} />
                  </Route>

                  <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
                    <Route index element={<Navigate to="/admin/dashboard" replace />} />
                    <Route path="dashboard" element={<AdminDashboard />} />
                    <Route path="users" element={<AdminUsers />} />
                    <Route path="content" element={<AdminContent />} />
                    <Route path="enrollment" element={<AdminEnrollment />} />
                    <Route path="system" element={<AdminSystem />} />
                    <Route path="logs" element={<AdminLogs />} />
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </ToastProvider>
        </CatalogProvider>
      </AuthProvider>
    </SystemSettingsProvider>
  );
}

export default App;
