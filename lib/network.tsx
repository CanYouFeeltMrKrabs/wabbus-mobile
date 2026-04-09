import React, { createContext, useContext, useEffect, useState } from "react";

type NetInfoModule = typeof import("@react-native-community/netinfo");
let NetInfo: NetInfoModule["default"] | null = null;

try {
  NetInfo = require("@react-native-community/netinfo").default;
} catch {
  if (__DEV__) console.warn("@react-native-community/netinfo unavailable — assuming online");
}

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
    if (!NetInfo) return;

    const unsubscribe = NetInfo.addEventListener((netState) => {
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
