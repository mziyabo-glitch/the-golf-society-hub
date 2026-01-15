import { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { useActiveSociety } from '../../hooks/useActiveSociety';
import { canAddMember, canRemoveMember, canEditMember } from '../../lib/permissions';

interface Member {
  id: string;
  displayName: string;
  email?: string;
  handicap: number;
  role: string;
  joinedAt: Date;
}

export default function MembersScreen() {
  const router = useRouter();
  const { societyId, userRole, loading: societyLoading } = useActiveSociety();
  
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  const canAdd = canAddMember(userRole);
  const canRemove = canRemoveMember(userRole);

  useEffect(() => {
    if (societyLoading) return;
    
    if (!societyId) {
      setLoading(false);
      return;
    }

    console.log('📋 Loading members for society:', societyId);

    const membersRef = collection(db, 'societies', societyId, 'members');
    const q = query(membersRef, orderBy('joinedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const membersList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          joinedAt: doc.data().joinedAt?.toDate() || new Date(),
        })) as Member[];

        console.log('✓ Members loaded:', membersList.length);
        setMembers(membersList);
        setLoading(false);
      },
      (error) => {
        console.error('✗ Failed to load members:', error);
        Alert.alert('Error', 'Failed to load members');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [societyId, societyLoading]);

  const handleDeleteMember = (member: Member) => {
    if (!canRemove) {
      Alert.alert('
