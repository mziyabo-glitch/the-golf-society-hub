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
import { collection, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
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

  // Permission checks
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
      Alert.alert('Permission Denied', 'Only Captain and Treasurer can remove members');
      return;
    }

    Alert.alert(
      'Remove Member',
      `Are you sure you want to remove ${member.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'societies', societyId!, 'members', member.id));
              console.log('✓ Member removed:', member.displayName);
            } catch (error) {
              console.error('✗ Failed to remove member:', error);
              Alert.alert('Error', 'Failed to remove member');
            }
          },
        },
      ]
    );
  };

  const handleEditMember = (member: Member) => {
    if (!canEditMember(userRole, member.id)) {
      Alert.alert('Permission Denied', 'You can only edit your own profile');
      return;
    }
    
    router.push(`/members/edit?id=${member.id}`);
  };

  // Loading state
  if (societyLoading || loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading members...</Text>
      </View>
    );
  }

  // No active society
  if (!societyId) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>⛳</Text>
        <Text style={styles.emptyText}>No Active Society</Text>
        <Text style={styles.emptySubtext}>Please select or create a society first</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/society/create')}
        >
          <Text style={styles.primaryButtonText}>Create Society</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with Add Button */}
      <View style={styles.header}>
        <Text style={styles.headerText}>Members ({members.length})</Text>
        {canAdd && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/members/add')}
          >
            <Text style={styles.addButtonText}>+ Add Member</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Members List */}
      {members.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyText}>No Members Yet</Text>
          <Text style={styles.emptySubtext}>
            {canAdd
              ? 'Add your first member to get started'
              : 'No members have joined this society yet'}
          </Text>
          {canAdd && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push('/members/add')}
            >
              <Text style={styles.primaryButtonText}>Add First Member</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.memberCard}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{item.displayName}</Text>
                {item.email && (
                  <Text style={styles.memberEmail}>{item.email}</Text>
                )}
                <Text style={styles.memberRole}>{item.role}</Text>
              </View>
              
              <View style={styles.memberActions}>
                <View style={styles.handicapBadge}>
                  <Text style={styles.handicapText}>HCP: {item.handicap}</Text>
                </View>
                
                <View style={styles.actionButtons}>
                  {canEditMember(userRole, item.id) && (
                    <TouchableOpacity
                      onPress={() => handleEditMember(item)}
                      style={styles.editButton}
                    >
                      <Text style={styles.editButtonText}>Edit</Text>
                    </TouchableOpacity>
                  )}
                  
                  {canRemove && (
                    <TouchableOpacity
                      onPress={() => handleDeleteMember(item)}
                      style={styles.deleteButton}
                    >
                      <Text style={styles.deleteButtonText}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#000000',
  },
  listContent: {
    padding: 16,
  },
  memberCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 4,
  },
  memberRole: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '600',
  },
  memberActions: {
    alignItems: 'flex-end',
  },
  handicapBadge: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  handicapText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    padding: 6,
  },
  editButtonText: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    padding: 6,
  },
  deleteButtonText: {
    color: '#FF3B30',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
