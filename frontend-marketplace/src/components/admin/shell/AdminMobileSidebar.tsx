"use client";

import { Menu } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/admin/ui/sheet";
import { Button } from "@/components/admin/ui/button";
import { AdminSidebar } from "./AdminSidebar";

type AdminMobileSidebarProps = {
  isSuperuser?: boolean;
};

export function AdminMobileSidebar({ isSuperuser = false }: AdminMobileSidebarProps) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" size="icon-sm" />}>
        <Menu className="size-4" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[18rem] p-0">
        <SheetHeader className="px-4 py-3">
          <SheetTitle>LandarsFood Admin</SheetTitle>
        </SheetHeader>
        <AdminSidebar isSuperuser={isSuperuser} className="border-0" />
      </SheetContent>
    </Sheet>
  );
}
