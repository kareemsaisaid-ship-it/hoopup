import { useLocation, useNavigate } from 'react-router-dom';

export function useAppNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  return {
    currentPath: location.pathname,
    goToFeed: () => navigate('/'),
    goToCourts: (courtId?: string) => navigate(courtId ? `/courts?court=${courtId}` : '/courts'),
    goToProfile: () => navigate('/profile'),
    goToCreateSession: (courtId?: string) =>
      navigate(courtId ? `/sessions/new?court=${courtId}` : '/sessions/new'),
    goToSession: (sessionId: string) => navigate(`/sessions/${sessionId}`),
    goToEditSession: (sessionId: string) => navigate(`/sessions/${sessionId}/edit`),
    goToMySessions: () => navigate('/my-sessions'),
    goToLogin: () => navigate('/login'),
  };
}
