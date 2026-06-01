"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useAuth } from "@/contexts/AuthContext";
import { getAuthUrl } from "@/utils/authHelpers";

export function AdminGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(getAuthUrl({ mode: "signin", next: pathname }));
    }
  }, [loading, user, router, pathname]);

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Checking access...</div>;
  }

  if (!user) {
    return null;
  }

  if (!user.is_staff) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-muted-foreground">
          You do not have permission to access the admin dashboard.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
