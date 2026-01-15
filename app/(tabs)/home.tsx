import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '../../lib/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { useActiveSociety } from '../../hooks/useActiveSociety';
import { canCreateEvent, canAddMember, canManageFinances } from '../../lib/permissions';

interface DashboardStats {
  membersCount: number;
  upcomingEventsCount: number;
  recentEventsCount: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const { societyId, society, userRole, loading: societyLoading } = useActiveSociety();
  
  const [stats, setStats] = useState<DashboardStats>({
    membersCount: 0,
    upcomingEventsCount: 0,
    recentEventsCount: 0,
  });
  const [loading, setLoading] = useState(true);

  const canCreate = canCreateEvent(userRole);
  const canAdd = canAddMember(userRole);
  const canFinances = canManageFinances(userRole);

  useEffect(() => {
    if (societyLoading) return;
    
    if (!societyId) {
      setLoading(false);
      return;
    }

    async function loadStats() {
      try {
        const membersRef = collection(db, 'societies', societyId, 'members');
        const membersSnap = await getDocs(membersRef);
        
        const now = new Date();
        const eventsRef = collection(db, 'societies', societyId, 'events');
        const upcomingQuery = query(
          eventsRef,
          where('date', '>=', now.toISOString().split('T')[0]),
          orderBy('date', 'asc'),
          limit(10)
        );
        const upcomingSnap = await getDocs(upcomingQuery);
        
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentQuery = query(
          eventsRef,
          where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0]),
          where('date', '<', now.toISOString().split('T')[0]),
          orderBy('date', 'desc'),
          limit(5)
        );
        const recentSnap = await getDocs(recentQuery);

        setStats({
          membersCount: membersSnap.size,
          upcomingEventsCount: upcomingSnap.size,
          recentEventsCount: recentSnap.size,
        });
        
        console.log('✓ Dashboard stats loaded');
      } catch (error) {
        console.error('✗ Failed to load dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [societyId, societyLoading]);

  if (
