import { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { getUserRole, type Role } from '../lib/permissions';

interface ActiveSociety {
  id: string;
  name: string;
  role: Role | null;
}

interface UseActiveSocietyResult {
  societyId: string | null;
  society: ActiveSociety | null;
  userRole: Role | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to get the active society and user's role
 * This is the single source of truth for "which society am I in?"
 */
export function useActiveSociety(): UseActiveSocietyResult {
  const [societyId, setSocietyId] = useState<string | null>(null);
  const [society, setSociety] = useState<ActiveSociety | null>(null);
  const [userRole, setUserRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    // Subscribe to user document to get activeSocietyId
    const userRef = doc(db, 'users', auth.currentUser.uid);
    
    const unsubscribeUser = onSnapshot(
      userRef,
      async (userSnap) => {
        if (!userSnap.exists()) {
          setLoading(false);
          return;
        }

        const userData = userSnap.data();
        const activeSocietyId = userData.activeSocietyId;

        if (!activeSocietyId) {
          setSocietyId(null);
          setSociety(null);
          setUserRole(null);
          setLoading(false);
          return;
        }

        // Set society ID
        setSocietyId(activeSocietyId);

        // Get user's role
        try {
          const role = await getUserRole(activeSocietyId);
          setUserRole(role);
        } catch (err) {
          console.error('Failed to get user role:', err);
          setUserRole(null);
        }

        // Subscribe to society document
        const societyRef = doc(db, 'societies', activeSocietyId);
        
        const unsubscribeSociety = onSnapshot(
          societyRef,
          (societySnap) => {
            if (societySnap.exists()) {
              setSociety({
                id: activeSocietyId,
                name: societySnap.data().name,
                role: userRole,
              });
              setError(null);
            } else {
              setError('Society not found');
              setSociety(null);
            }
            setLoading(false);
          },
          (err) => {
            console.error('Failed to load society:', err);
            setError('Failed to load society');
            setLoading(false);
          }
        );

        return () => unsubscribeSociety();
      },
      (err) => {
        console.error('Failed to load user:', err);
        setError('Failed to load user data');
        setLoading(false);
      }
    );

    return () => unsubscribeUser();
  }, [auth.currentUser?.uid]);

  return { societyId, society, userRole, loading, error };
}

/**
 * Hook to check if user has a specific permission
 */
export function usePermission(
  checkPermission: (role: Role | null) => boolean
): { hasPermission: boolean; loading: boolean } {
  const { userRole, loading } = useActiveSociety();
  
  return {
    hasPermission: checkPermission(userRole),
    loading,
  };
}
