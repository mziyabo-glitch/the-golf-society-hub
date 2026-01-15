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
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useActiveSociety } from '../../hooks/useActiveSociety';
import { canManageFinances, canViewFinances } from '../../lib/permissions';

interface Transaction {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  description: string;
  category: string;
  date: string;
  createdBy: string;
  createdAt: Date;
}

export default function FinancesScreen() {
  const router = useRouter();
  const { societyId, userRole, loading: societyLoading } = useActiveSociety();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const canManage = canManageFinances(userRole);
  const canView = canViewFinances(userRole);

  useEffect(() => {
    if (societyLoading) return;
    
    if (!societyId) {
      setLoading(false);
      return;
    }

    if (!canView) {
      setLoading(false);
      return;
    }

    console.log('💰 Loading finances for society:', societyId);

    const transactionsRef = collection(db, 'societies', societyId, 'transactions');
    const q = query(transactionsRef, orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const transactionsList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
        })) as Transaction[];

        console.log('✓ Transactions loaded:', transactionsList.length);
        setTransactions(transactionsList);
        setLoading(false);
      },
      (error) => {
        console.error('✗ Failed to load transactions:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [societyId, societyLoading, canView]);

  const balance = transactions.reduce((acc, t) => {
    return acc + (t.type === 'income' ? t.amount : -t.amount);
  }, 0);

  const totalIncome = transactions
    .filter(t => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);

  const totalExpenses = transactions
    .filter(t => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  if (societyLoading || loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Loading finances...</Text>
      </View>
    );
  }

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

  if (!canView) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.emptyIcon}>🔒</Text>
        <Text style={styles.emptyText}>Access Restricted</Text>
        <Text style={styles.emptySubtext}>
          Only Captain, Treasurer, and Secretary can view finances
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.primaryButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Finances</Text>
        {canManage && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => Alert.alert('Coming Soon', 'Add transaction feature coming soon')}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Balance</Text>
          <Text style={[
            styles.summaryAmount,
            balance >= 0 ? styles.positive : styles.negative
          ]}>
            £{balance.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryCardSmall}>
          <Text style={styles.summaryLabel}>Income</Text>
          <Text style={[styles.summaryAmountSmall, styles.positive]}>
            £{totalIncome.toFixed(2)}
          </Text>
        </View>
        <View style={styles.summaryCardSmall}>
          <Text style={styles.summaryLabel}>Expenses</Text>
          <Text style={[styles.summaryAmountSmall, styles.negative]}>
            £{totalExpenses.toFixed(2)}
          </Text>
        </View>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💰</Text>
          <Text style={styles.emptyText}>No Transactions Yet</Text>
          <Text style={styles.emptySubtext}>
            {canManage
              ? 'Start tracking your society finances'
              : 'No financial activity has been recorded'}
          </Text>
          {canManage && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => Alert.alert('Coming Soon', 'Add transaction feature coming soon')}
            >
              <Text style={styles.primaryButtonText}>Add First Transaction</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.transactionCard}>
              <View style={styles.transactionHeader}>
                <View style={[
                  styles.typeBadge,
                  item.type === 'income' ? styles.incomeBadge : styles.expenseBadge
                ]}>
                  <Text style={styles.typeBadgeText}>
                    {item.type === 'income' ? '📈 Income' : '📉 Expense'}
                  </Text>
                </View>
                <Text style={styles.transactionDate}>
                  {new Date(item.date).toLocaleDateString()}
                </Text>
              </View>
              
              <Text style={styles.transactionDescription}>{item.description}</Text>
              <Text style={styles.transactionCategory}>{item.category}</Text>
              
              <Text style={[
                styles.transactionAmount,
                item.type === 'income' ? styles.positive : styles.negative
              ]}>
                {item.type === 'income' ? '+' : '-'}£{item.amount.toFixed(2)}
              </Text>
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
  summaryContainer: {
    padding: 16,
    flexDirection: 'row',
    gap: 12,
  },
  summaryCard: {
    flex: 2,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  summaryCardSmall: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  summaryAmountSmall: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  positive: {
    color: '#34C759',
  },
  negative: {
    color: '#FF3B30',
  },
  listContent: {
    padding: 16,
  },
  transactionCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginBottom: 12,
  },
  transactionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  typeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  incomeBadge: {
    backgroundColor: '#E8F5E9',
  },
  expenseBadge: {
    backgroundColor: '#FFEBEE',
  },
  typeBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  transactionDate: {
    fontSize: 12,
    color: '#666666',
  },
  transactionDescription: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  transactionCategory: {
    fontSize: 12,
    color: '#666666',
    marginBottom: 8,
  },
  transactionAmount: {
    fontSize: 24,
    fontWeight: 'bold',
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
