import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { onDisconnect, onValue, ref as databaseRef, serverTimestamp as databaseServerTimestamp, set as setDatabaseValue } from 'firebase/database';
import { auth, db, presenceDb, signInWithGoogle as firebaseSignIn } from '../lib/firebase';
import { registerPushNotifications, unregisterPushNotifications } from '../lib/pushNotifications';
import { UserProfile, UserRole } from '../types';

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: {
    userId: string | null;
    email: string | null;
  }
}

/**
 * Normalizes Firestore errors and emits a structured security log for permission failures.
 */
export function handleFirestoreError(error: any, operationType: FirestoreErrorInfo['operationType'], path: string | null = null) {
  if (error.code === 'permission-denied') {
    const errorInfo: FirestoreErrorInfo = {
      error: error.message,
      operationType,
      path,
      authInfo: {
        userId: auth.currentUser?.uid || null,
        email: auth.currentUser?.email || null,
      }
    };
    console.error("Firestore Permission Denied:", JSON.stringify(errorInfo, null, 2));
    return errorInfo;
  }
  console.error(`Firestore Error (${operationType}):`, error);
  return null;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Pick<UserProfile, 'displayName' | 'state'>) => Promise<void>;
  isInitial: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitial, setIsInitial] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      setUser(user);
      if (user) {
        try {
          const publicDoc = await getDoc(doc(db, 'users', user.uid));
          if (publicDoc.exists()) {
            setProfile({ ...publicDoc.data() as UserProfile, uid: user.uid });
          } else {
            setProfile(null);
          }
        } catch (err) {
          handleFirestoreError(err, 'get', `users/${user.uid}`);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
      setIsInitial(false);
    });
  }, []);

  useEffect(() => {
    if (!user || !presenceDb) return;

    const statusRef = databaseRef(presenceDb, `status/${user.uid}`);
    const connectedRef = databaseRef(presenceDb, '.info/connected');
    const offlineStatus = {
      state: 'offline',
      lastChanged: databaseServerTimestamp(),
    };
    const onlineStatus = {
      state: 'online',
      lastChanged: databaseServerTimestamp(),
    };

    const unsubscribe = onValue(connectedRef, async (snapshot) => {
      if (snapshot.val() !== true) {
        return;
      }

      try {
        await onDisconnect(statusRef).set(offlineStatus);
        await setDatabaseValue(statusRef, onlineStatus);
      } catch (err) {
        console.error('Realtime presence setup failed:', err);
      }
    });

    return () => {
      unsubscribe();
      onDisconnect(statusRef).cancel().catch(() => {});
      setDatabaseValue(statusRef, offlineStatus).catch(() => {});
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      void unregisterPushNotifications();
      return;
    }

    void registerPushNotifications(user.uid);
  }, [user]);

  /**
   * Signs in with Google and bootstraps the user's public/private profile documents.
   */
  const login = async () => {
    try {
      const user = await firebaseSignIn();
      const publicDoc = await getDoc(doc(db, 'users', user.uid));
      if (!publicDoc.exists()) {
        const defaultProfile = {
          role: 'donor' as UserRole,
          state: 'Selangor', // Default to Selangor
          displayName: user.displayName || 'Eco Hero',
          photoURL: user.photoURL || '',
        };
        const privateData = {
          uid: user.uid,
          email: user.email,
          createdAt: serverTimestamp(),
        };
        
        try {
          await setDoc(doc(db, 'users', user.uid), defaultProfile);
          await setDoc(doc(db, 'users', user.uid, 'private', 'data'), privateData);
        } catch (err) {
          handleFirestoreError(err, 'write', `users/${user.uid}`);
        }
        setProfile({ ...defaultProfile, uid: user.uid });
      }
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  /**
   * Signs out the current Firebase user.
   */
  const logout = async () => {
    await unregisterPushNotifications();
    await signOut(auth);
  };

  const updateProfile = async (updates: Pick<UserProfile, 'displayName' | 'state'>) => {
    if (!user) {
      throw new Error('You must be signed in to update your profile.');
    }

    await updateDoc(doc(db, 'users', user.uid), updates);
    setProfile((current) => current ? { ...current, ...updates } : current);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, login, logout, updateProfile, isInitial }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
