import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User } from '../types';
import { storage } from '../utils/storage';

interface AuthContextType {
  currentUser: User | null;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAuthenticated: boolean;
  updateCurrentUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    storage.init();
    const user = storage.getCurrentUser();
    if (user) {
      setCurrentUser(user);
    }
  }, []);

  const login = async (identifier: string, password: string): Promise<{ success: boolean; error?: string }> => {
    const users = storage.getUsers();
    const idLower = identifier.toLowerCase().trim();
    if (!idLower) return { success: false, error: 'Please enter your User ID or Email' };
    const user = users.find(
      u => ((u.email && u.email.toLowerCase() === idLower) || (u.userId && u.userId.toLowerCase() === idLower))
        && u.password === password && u.isActive
    );
    if (user) {
      setCurrentUser(user);
      storage.setCurrentUser(user);
      return { success: true };
    }
    return { success: false, error: 'Invalid user ID/email or password' };
  };

  const logout = () => {
    setCurrentUser(null);
    storage.setCurrentUser(null);
  };

  /** Called after a user edits their own profile (email, password, signature,
   *  photo) so the rest of the app reflects the change immediately without
   *  requiring a re-login. */
  const updateCurrentUser = (user: User) => {
    setCurrentUser(user);
    storage.setCurrentUser(user);
  };

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, isAuthenticated: !!currentUser, updateCurrentUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
