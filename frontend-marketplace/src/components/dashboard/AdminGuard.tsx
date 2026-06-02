"use client";

import { ReactNode, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

import { adminDesign } from "@/lib/admin-design";
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
    return <p className={adminDesign.description}>Checking access...</p>;
  }

  if (!user) {
    return null;
  }

  if (!user.is_staff) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="max-w-md text-center">
          <h1 className={adminDesign.pageTitle}>Access denied</h1>
          <p className={`mt-2 ${adminDesign.description}`}>
            You do not have permission to access the admin dashboard.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
