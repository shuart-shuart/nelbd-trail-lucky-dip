import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth } from '../firebase/config';
import { checkAdminStatus, registerAdminUser } from '../firebase/firestoreService';
import { postgresAdminLogin, postgresAdminLogout, postgresAdminMe } from '../api/postgresAdminClient';
const postgresMode = import.meta.env.VITE_DATA_BACKEND === 'postgres';

export const BOOTSTRAP_ADMIN_EMAIL = 'work@anotherunit.xyz';

interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (postgresMode) {
      postgresAdminMe().then((admin) => {
        setUser({ uid: admin.id, email: admin.email, displayName: admin.email } as User);
        setIsAdmin(true);
      }).catch(() => { setUser(null); setIsAdmin(false); }).finally(() => setLoading(false));
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const isUserAdmin = await checkAdminStatus(currentUser.uid, currentUser.email);
          setIsAdmin(isUserAdmin);

          // If this is the bootstrapped admin, ensure their admin record is present
          if (currentUser.email && currentUser.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase()) {
            await registerAdminUser({
              id: currentUser.uid,
              email: currentUser.email,
              role: 'super_admin',
              name: currentUser.displayName || 'Lead Admin',
            }).catch(() => {
              // Ignore if already registered
            });
            setIsAdmin(true);
          }
        } catch (err) {
          console.error('Error verifying admin status:', err);
          setIsAdmin(currentUser.email?.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL.toLowerCase());
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithPassword = async (email: string, password: string) => {
    setError(null); setLoading(true);
    try {
      const admin = await postgresAdminLogin(email,password);
      setUser({uid:admin.id,email:admin.email,displayName:admin.email} as User);
      setIsAdmin(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
      setUser(null); setIsAdmin(false);
    } finally {setLoading(false);}
  };

  const signInWithGoogle = async () => {
    if (postgresMode) {setError('Use your admin email and password.'); return;}
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Sign in failed';
      console.error('Sign-in error:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      if (postgresMode) await postgresAdminLogout();
      else await firebaseSignOut(auth);
      setUser(null);
      setIsAdmin(false);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        loading,
        error,
        signInWithGoogle,
        signInWithPassword,
        signOut,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
