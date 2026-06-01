import { httpClient } from "@/utils/httpClient";

export type CurrentUser = {
  id: number;
  name: string;
  email: string | null;
  is_staff: boolean;
  is_superuser: boolean;
  is_authenticated: boolean;
};

type ProfileResponse = {
  user?: {
    id: number;
    name: string;
    email: string | null;
    is_staff?: boolean;
    is_superuser?: boolean;
    is_authenticated?: boolean;
  };
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const data = await httpClient.get<ProfileResponse>("/api/auth/profile/");
    if (!data?.user) return null;
    return {
      id: data.user.id,
      name: data.user.name,
      email: data.user.email ?? null,
      is_staff: Boolean(data.user.is_staff),
      is_superuser: Boolean(data.user.is_superuser),
      is_authenticated: Boolean(data.user.is_authenticated ?? true),
    };
  } catch {
    return null;
  }
}
