import { DeviceEventEmitter } from "react-native";

export type ToastVariant = "success" | "info" | "error";

export type ToastPayload = {
  message: string;
  variant: ToastVariant;
};

const EVENT_NAME = "wabbus-toast";

export function showToast(message: string, variant: ToastVariant = "success") {
  DeviceEventEmitter.emit(EVENT_NAME, { message, variant });
}

export { EVENT_NAME };
