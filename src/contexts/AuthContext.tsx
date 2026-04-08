import React, { createContext, useContext, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const ADMIN_EMAILS = ['managallment@gmail.com', 'naserf355@gmail.com', 'alkhoryaa@gmail.com', 'admin@enara.com'];

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
}

interface AuthContextType {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        try {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDoc = await getDoc(userDocRef);
          const normalizedEmail = currentUser.email?.toLowerCase() || '';
          const isAdminEmail = ADMIN_EMAILS.includes(normalizedEmail);
          
          if (userDoc.exists()) {
            const existingProfile = userDoc.data() as UserProfile;

            if (isAdminEmail && existingProfile.role !== 'admin') {
              const elevatedProfile: UserProfile = {
                ...existingProfile,
                uid: currentUser.uid,
                email: currentUser.email || existingProfile.email || '',
                name: existingProfile.name || currentUser.displayName || currentUser.email?.split('@')[0] || 'مدير النظام',
                role: 'admin',
              };
              await setDoc(userDocRef, elevatedProfile);
              setProfile(elevatedProfile);
            } else {
              setProfile(existingProfile);
            }
          } else {
            // Create new user profile, default to 'user' role
            // If it's the specific admin email, they get admin role (handled by rules, but we set it here too)
            const newProfile: UserProfile = {
              uid: currentUser.uid,
              email: currentUser.email || '',
              name: currentUser.displayName || currentUser.email?.split('@')[0] || 'مستخدم جديد',
              role: isAdminEmail ? 'admin' : 'user',
              createdAt: new Date().toISOString(),
            };
            await setDoc(userDocRef, newProfile);
            setProfile(newProfile);
          }
        } catch (error) {
          console.error("Error fetching user profile:", error);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
