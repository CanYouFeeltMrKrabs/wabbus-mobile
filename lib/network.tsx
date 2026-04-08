import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

type NetworkState = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
};

const NetworkContext = createContext<NetworkState>({
  isConnected: true,
  isInternetReachable: true,
});

export function useNetwork() {
  return useContext(NetworkContext);
}

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState: NetInfoState) => {
      setState({
        isConnected: netState.isConnected ?? true,
        isInternetReachable: netState.isInternetReachable ?? null,
      });
    });
    return unsubscribe;
  }, []);

  return (
    <NetworkContext.Provider value={state}>
      {children}
    </NetworkContext.Provider>
  );
}
