import type { ReactNode } from "react";

import { adminDesign } from "@/lib/admin-design";
import { cn } from "@/lib/utils";

type AdminPageProps = {
  children: ReactNode;
  className?: string;
};

export function AdminPage({ children, className }: AdminPageProps) {
  return <div className={cn(adminDesign.pageSection, className)}>{children}</div>;
}
