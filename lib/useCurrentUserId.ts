"use client";

import { useEffect, useState } from "react";

// TEMPORARY: until the auth/session module is merged in, every page needs
// to know "who am I" some other way. We store a userId in localStorage so
// you can test the flow end-to-end. Replace this hook's internals with a
// real session read (e.g. useSession()) once auth lands.
export function useCurrentUserId() {
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    const stored = window.localStorage.getItem("mess_current_user_id");
    if (stored) setUserId(stored);
  }, []);

  const updateUserId = (value: string) => {
    setUserId(value);
    window.localStorage.setItem("mess_current_user_id", value);
  };

  return { userId, setUserId: updateUserId };
}
