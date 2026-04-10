import { useEffect } from "react";
import { useRouter } from "expo-router";
import { ROUTES } from "@/lib/routes";

/**
 * Legacy route — live chat now lives at /(tabs)/chat.
 * Redirects any deep-links or bookmarks that target this path.
 */
export default function LiveChatRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.chatTab as any);
  }, [router]);

  return null;
}
