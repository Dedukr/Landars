import type { AdminNavGroup } from "./admin-nav-items";

type User = {
  is_staff: boolean;
  is_superuser: boolean;
};

export function filterAdminNavGroups(
  groups: AdminNavGroup[],
  user: User | null
): AdminNavGroup[] {
  if (!user || !user.is_staff) {
    return [];
  }

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.permission === "superuser") {
          return user.is_superuser;
        }

        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
