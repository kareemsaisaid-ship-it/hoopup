import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAppServices, type UserProfile } from '../services';
import { LoadingSpinner } from '../shared';

export interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { auth } = useAppServices();
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => auth.getCurrentUser());
  const [checking, setChecking] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const unsub = auth.subscribe((user) => {
      setCurrentUser(user);
      setChecking(false);
    });
    return () => unsub();
  }, [auth]);

  if (checking) {
    return <LoadingSpinner message="กำลังตรวจสอบสิทธิ์การใช้งาน..." />;
  }

  if (!currentUser) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
