import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

export type NetworkContextValue = {
  /** True when device has no connection or internet is explicitly unreachable. */
  isOffline: boolean;
  /** From NetInfo; null when unknown (e.g. some web cases). */
  isInternetReachable: boolean | null;
};

const defaultValue: NetworkContextValue = {
  isOffline: false,
  isInternetReachable: true,
};

const NetworkContext = createContext<NetworkContextValue>(defaultValue);

function deriveOffline(s: NetInfoState): boolean {
  if (s.isConnected === false) return true;
  if (s.isInternetReachable === false) return true;
  return false;
}

function deriveReachable(s: NetInfoState): boolean | null {
  if (typeof s.isInternetReachable === "boolean") return s.isInternetReachable;
  if (s.isConnected === true) return true;
  if (s.isConnected === false) return false;
  return null;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<NetworkContextValue>(defaultValue);

  useEffect(() => {
    let cancelled = false;
    void NetInfo.fetch().then((s) => {
      if (cancelled) return;
      setValue({
        isOffline: deriveOffline(s),
        isInternetReachable: deriveReachable(s),
      });
    });
    const unsubscribe = NetInfo.addEventListener((s) => {
      setValue({
        isOffline: deriveOffline(s),
        isInternetReachable: deriveReachable(s),
      });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const memo = useMemo(() => value, [value]);
  return <NetworkContext.Provider value={memo}>{children}</NetworkContext.Provider>;
}

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}
