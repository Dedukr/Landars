import { httpClient } from "@/utils/httpClient";

export type CurrentUser = {
  id: number;
  email: string;
  is_staff: boolean;
  is_superuser: boolean;
};

type ProfileResponse = {
  user?: {
    id: number;
    email: string | null;
    is_staff?: boolean;
    is_superuser?: boolean;
  };
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    const data = await httpClient.get<ProfileResponse>("/api/auth/profile/");
    if (!data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      is_staff: Boolean(data.user.is_staff),
      is_superuser: Boolean(data.user.is_superuser),
    };
  } catch {
    return null;
  }
}
