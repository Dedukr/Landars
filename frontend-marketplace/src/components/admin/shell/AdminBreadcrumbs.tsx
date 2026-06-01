"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/admin/ui/breadcrumb";

function formatSegment(segment: string) {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AdminBreadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const dashboardIndex = segments.indexOf("dashboard");
  const breadcrumbSegments =
    dashboardIndex >= 0 ? segments.slice(dashboardIndex) : ["dashboard"];

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbSegments.map((segment, index) => {
          const href = `/${breadcrumbSegments.slice(0, index + 1).join("/")}`;
          const isLast = index === breadcrumbSegments.length - 1;
          const label = formatSegment(segment);

          return (
            <BreadcrumbItem key={href}>
              {isLast ? (
                <BreadcrumbPage>{label}</BreadcrumbPage>
              ) : (
                <>
                  <BreadcrumbLink render={<Link href={href} />}>
                    {label}
                  </BreadcrumbLink>
                  <BreadcrumbSeparator />
                </>
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
