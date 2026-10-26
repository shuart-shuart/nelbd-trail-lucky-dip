import React from 'react';
import { useAuth, BOOTSTRAP_ADMIN_EMAIL } from '../../context/AuthContext';
import { ShieldAlert, LogIn, Compass, ArrowLeft, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';

interface AdminAuthGuardProps {
  children: React.ReactNode;
}

export const AdminAuthGuard: React.FC<AdminAuthGuardProps> = ({ children }) => {
  const { user, isAdmin, loading, error, signInWithGoogle, signOut, clearError } = useAuth();

  if (loading) {
    return (
      <div className="nel-staff-root min-h-screen bg-nel-violet flex flex-col items-center justify-center p-6 text-white font-dm">
        <div className="w-14 h-14 border-4 border-nel-pink border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-white/70 font-medium tracking-wide text-sm">Verifying administrator credentials...</p>
      </div>
    );
  }

  // Not signed in
  if (!user) {
    return (
      <div className="nel-staff-root min-h-screen bg-nel-violet text-white flex flex-col justify-center items-center p-3.5 sm:p-6 font-dm selection:bg-nel-pink selection:text-nel-violet">
        <div className="max-w-md w-full bg-nel-surface border border-nel-purple/50 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-nel-pink/10 rounded-full blur-3xl pointer-events-none" />

          <div className="flex items-center space-x-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-nel-purple border border-nel-pink/30 flex items-center justify-center text-nel-pink shadow-lg shadow-nel-violet">
              <Compass className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-nel font-semibold text-white tracking-tight">Staff & Admin Portal</h2>
              <p className="text-xs text-nel-pink font-dm font-bold">NELBD Trail Lucky Dip Management</p>
            </div>
          </div>

          <p className="text-white/80 text-sm mb-6 leading-relaxed font-dm">
            This protected console is restricted to authorized festival personnel. Sign in with your registered Google account to manage prize inventory, review draw history, and configure kiosk parameters.
          </p>

          <div className="mb-6 p-3.5 rounded-2xl bg-nel-input border border-nel-purple/50 text-xs text-white/80 space-y-1 font-dm">
            <div className="font-bold text-nel-pink flex items-center gap-1.5">
              <span>Authorized Administrator:</span>
            </div>
            <code className="text-nel-pink font-mono block bg-nel-surface p-2 rounded-xl text-center border border-nel-purple/40">
              {BOOTSTRAP_ADMIN_EMAIL}
            </code>
            <p className="text-[11px] text-white/60 pt-1 font-dm">
              Sign in with this Google account or another assigned festival staff account.
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-2xl bg-red-950/80 border border-red-700 text-xs text-red-200 flex items-start gap-2 font-dm">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span>{error}</span>
                <button
                  onClick={clearError}
                  className="block text-red-300 underline font-semibold mt-1 cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            className="w-full py-3.5 px-5 rounded-2xl bg-nel-pink hover:brightness-105 text-nel-violet font-nel font-semibold text-sm shadow-xl shadow-nel-purple/40 flex items-center justify-center gap-3 transition-all transform active:scale-98 cursor-pointer"
          >
            <LogIn className="w-5 h-5 text-nel-violet" />
            <span>Sign in with Google</span>
          </button>

          <div className="mt-6 pt-5 border-t border-nel-purple/30 flex items-center justify-between text-xs text-white/60 font-dm">
            <Link
              to="/"
              className="flex items-center gap-1 hover:text-nel-pink transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Public Kiosk</span>
            </Link>
            <span>NEL, By Design</span>
          </div>
        </div>
      </div>
    );
  }

  // Signed in but not an authorized admin
  if (!isAdmin) {
    return (
      <div className="nel-staff-root min-h-screen bg-nel-violet text-white flex flex-col justify-center items-center p-3.5 sm:p-6 font-dm">
        <div className="max-w-md w-full bg-nel-surface border border-red-500/40 rounded-2xl sm:rounded-3xl p-5 sm:p-8 shadow-2xl text-center">
          <div className="w-16 h-16 rounded-full bg-red-950/70 border border-red-700/60 text-red-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-nel font-semibold text-white mb-2">Access Restricted</h2>
          <p className="text-white/80 text-sm mb-4 leading-relaxed font-dm">
            The account <strong className="text-nel-pink font-semibold">{user.email}</strong> is not listed as an authorized administrator.
          </p>
          <div className="space-y-3">
            <button
              onClick={signOut}
              className="w-full py-3 px-4 rounded-xl bg-nel-purple hover:bg-nel-purple/80 text-white font-dm font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sign out / Switch Account</span>
            </button>
            <Link
              to="/"
              className="block text-xs text-white/60 hover:text-nel-pink transition font-dm py-1"
            >
              Return to Public Kiosk
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
