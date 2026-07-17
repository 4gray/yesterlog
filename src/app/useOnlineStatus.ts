import { useEffect, useState } from "react";

const readOnline = () => {
  if (typeof navigator === "undefined") {
    return true;
  }
  // `onLine` only reports whether the OS has a network interface up, so it
  // catches "laptop is on a plane" but not "Jira is unreachable". Treat a
  // missing value as online — a false offline badge is worse than none.
  return navigator.onLine !== false;
};

/** Tracks browser connectivity so sync status can show an offline dot. */
export const useOnlineStatus = () => {
  const [isOnline, setIsOnline] = useState(readOnline);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    setIsOnline(readOnline());

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  return isOnline;
};
