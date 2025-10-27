import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, UserProfile } from '../models/User';
import * as AuthService from '../services/AuthService';

// Define what the context will provide
interface AuthContextType {
  user: User | null;
  isLoading: boolean;
}

// Create the context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Create the Provider component
export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // This runs once when the app starts
    const loadUser = async () => {
      setIsLoading(true);
      const loadedUser = await AuthService.getLastLoggedInUser();
      if (loadedUser) {
        setUser(loadedUser);
      }
      setIsLoading(false);
    };
    loadUser();
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Create a custom hook to easily use the context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};