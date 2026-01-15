import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { db } from '../lib/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { getActiveSocietyId } from './_layout';

interface Member {
  id: string;
  name: string;
  email: string;
  handicap: number;
  createdAt: Date;
}

export default function MembersScreen() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [handicap, setHandicap] = useState('');
  const [adding, setAdding] = useState(false);

  const societyId = getActiveSocietyId();

  useEffect(() => {
    if (!societyId) {
      setLoading(false);
      return;
    }

    console.log('📋 Loading members for society:', societyId);

    const membersRef = collection(db, 'societies', societyId, 'members');
    const q = query(membersRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const membersList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
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
  }, [societyId]);

  const handleAddMember = async () => {
    if (!societyId) {
      Alert.alert('Error', 'No active society selected');
      return;
    }

    if (!name.trim() || !email.trim() || !handicap.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const handicapNum = parseFloat(handicap);
    if (isNaN(handicapNum) || handicapNum < -10 || handicapNum > 54) {
      Alert.alert('Error', 'Handicap must be between -10 and 54');
      return;
    }

    setAdding(true);

    try {
      const membersRef = collection(db, 'societies', societyId, 'members');
      await addDoc(membersRef, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        handicap: handicapNum,
        createdAt: new Date(),
      });

      console.log('✓ Member added:', name);
      setName('');
      setEmail('');
      setHandicap('');
      Alert.alert('Success', 'Member added successfully');
    } catch (error) {
      console.error('✗ Failed to add member:', error);
      Alert.alert('Error', 'Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteMember = (member: Member) => {
    Alert.alert(
      'Delete Member',
      `Are you sure you want to remove ${member.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'societies', societyId!, 'members', member.id));
              console.log('✓ Member deleted:', member.name);
            } catch (error) {
              console.error('✗ Failed to delete member:', error);
              Alert.alert('Error', 'Failed to delete member');
            }
          },
        },
      ]
    );
  };

  if (!societyId) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No active society selected</Text>
        <Text style={styles.emptySubtext}>Please select or create a society first</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading members...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.form}>
        <Text style={styles.formTitle}>Add New Member</Text>

        <TextInput
          style={styles.input}
          placeholder="Member Name"
          placeholderTextColor="#999999"
          value={name}
          onChangeText={setName}
        />

        <TextInput
          style={styles.input}
          placeholder="Email Address"
          placeholderTextColor="#999999"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <TextInput
          style={styles.input}
          placeholder="Handicap (e.g., 12.5)"
          placeholderTextColor="#999999"
          value={handicap}
          onChangeText={setHandicap}
          keyboardType="decimal-pad"
        />

        <TouchableOpacity
          style={[styles.addButton, adding && styles.addButtonDisabled]}
          onPress={handleAddMember}
          disabled={adding}
        >
          <Text style={styles.addButtonText}>
            {adding ? 'Adding...' : 'Add Member'}
          </Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.listTitle}>
        Members ({members.length})
      </Text>

      {members.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No members yet</Text>
          <Text style={styles.emptySubtext}>Add your first member above</Text>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.memberCard}>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{item.name}</Text>
                <Text style={styles.memberEmail}>{item.email}</Text>
              </View>
              <View style={styles.memberActions}>
                <View style={styles.handicapBadge}>
                  <Text style={styles.handicapText}>HCP: {item.handicap}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteMember(item)}
                  style={styles.deleteButton}
                >
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
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
  form: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 12,
  },
  input: {
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 16,
    color: '#000000',
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#B0B0B0',
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  memberCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  memberEmail: {
    fontSize: 14,
    color: '#666666',
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
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#000000',
  },
});
