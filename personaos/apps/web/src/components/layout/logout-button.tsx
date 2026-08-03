"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/sign-in");
    router.refresh();
  }

  return (
    <Button variant="outline" size="sm" onClick={logout}>
      Выйти
    </Button>
  );
}
