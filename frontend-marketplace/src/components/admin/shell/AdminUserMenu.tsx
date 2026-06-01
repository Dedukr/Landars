"use client";

import { useRouter } from "next/navigation";
import { LogOut, Shield } from "lucide-react";

import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback } from "@/components/admin/ui/avatar";
import { Button } from "@/components/admin/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/admin/ui/dropdown-menu";

function getInitials(name?: string | null) {
  if (!name) return "AD";
  const words = name.split(" ").filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
}

export function AdminUserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/auth?mode=signin&next=%2Fdashboard");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Avatar className="size-7">
          <AvatarFallback className="text-xs">
            {getInitials(user?.name)}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="text-sm font-medium">{user?.name ?? "Admin User"}</p>
          <p className="text-xs text-muted-foreground">
            {user?.email ?? "No email"}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <Shield className="mr-2 size-4" />
          {user?.is_staff ? "Staff access" : "User access"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="mr-2 size-4" />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
