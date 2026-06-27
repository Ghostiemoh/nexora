import { useEffect, useState } from "react";

export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Canonical "has mounted" flag for hydration-safe rendering.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  return mounted;
}
