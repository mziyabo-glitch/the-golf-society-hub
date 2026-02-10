// lib/billing/purchaseService.ts
// Purchase service abstraction for in-app licence purchases.
// Currently uses a dev stub; swap implementation for RevenueCat / StoreKit when ready.

export type PurchaseResult = {
  success: boolean;
  transactionId?: string;
  error?: string;
};

export type RestoreResult = {
  success: boolean;
  restoredQuantity?: number;
  error?: string;
};

export interface PurchaseService {
  purchaseSocietyLicences(quantity: number): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
}

// ---------------------------------------------------------------------------
// Dev stub – simulates a successful purchase after a short delay.
// Enabled when __DEV__ is true (React Native dev mode).
// In production builds this will still be used until a real provider is wired.
// ---------------------------------------------------------------------------

const DEV_PURCHASE_DELAY_MS = 1500;

class DevPurchaseService implements PurchaseService {
  async purchaseSocietyLicences(quantity: number): Promise<PurchaseResult> {
    if (quantity < 1 || quantity > 100) {
      return { success: false, error: "Quantity must be between 1 and 100." };
    }

    // Simulate network / store latency
    await new Promise((r) => setTimeout(r, DEV_PURCHASE_DELAY_MS));

    const transactionId = `dev_txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    console.log(`[PurchaseService:DEV] Simulated purchase of ${quantity} licences. txn=${transactionId}`);
    return { success: true, transactionId };
  }

  async restorePurchases(): Promise<RestoreResult> {
    await new Promise((r) => setTimeout(r, 800));
    console.log("[PurchaseService:DEV] Simulated restore (no-op in dev).");
    return { success: true, restoredQuantity: 0 };
  }
}

// ---------------------------------------------------------------------------
// Singleton export – replace `new DevPurchaseService()` with a real
// implementation (e.g. RevenueCatPurchaseService) when IAP is integrated.
// ---------------------------------------------------------------------------

export const purchaseService: PurchaseService = new DevPurchaseService();
