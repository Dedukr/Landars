"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import { httpClient, refreshAuthTokens } from "@/utils/httpClient";
import { clearCartStorage } from "@/utils/cartStorage";
import { clearWishlistStorage } from "@/utils/wishlistStorage";
import { formatUserDisplayName } from "@/lib/userName";
import {
  authTokensUnchanged,
  createAuthGeneration,
  hasReplacementSession,
} from "@/utils/authSessionGuard";
import {
  clearAccessToken,
  clearLegacyTokenStorage,
  getAccessToken,
  setAccessToken,
} from "@/utils/authTokenStore";

/** Clear token-only half-session without cart/wishlist side effects. */
function clearHalfSessionAccess(): void {
  clearAccessToken();
  localStorage.removeItem("user");
}

interface User {
  id: number;
  name: string;
  first_name?: string | null;
  surname?: string | null;
  email: string;
  is_staff?: boolean;
  can_use_festival?: boolean;
}

interface AuthTokens {
  access: string;
  /** @deprecated Refresh is httpOnly-cookie only; ignored if present. */
  refresh?: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (tokens: AuthTokens, user: User) => void;
  logout: () => void;
  loading: boolean;
  refreshToken: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Detects login/logout that completes while async restore/refresh is in flight
  const authGeneration = useRef(createAuthGeneration()).current;
  const logoutRef = useRef<() => Promise<void>>(async () => {});
  const refreshTokenRef = useRef<() => Promise<boolean>>(async () => false);
  const tokenRef = useRef<string | null>(null);

  tokenRef.current = token;

  /**
   * Validates a JWT token by making a test request to the user endpoint
   * Also fetches and returns the full user profile including is_staff
   */
  const validateToken = useCallback(
    async (tokenToValidate: string): Promise<User | null> => {
      try {
        const response = await fetch(`/api/auth/profile/`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${tokenToValidate}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        });

        if (!response.ok) {
          console.warn(
            `Token validation failed with status: ${response.status}`
          );
          return null;
        }

        const data = await response.json();
        if (data.user) {
          return {
            id: data.user.id,
            name: formatUserDisplayName(data.user),
            first_name: data.user.first_name ?? null,
            surname: data.user.surname ?? null,
            email: data.user.email,
            is_staff: data.user.is_staff || false,
            can_use_festival: Boolean(data.user.can_use_festival),
          };
        }

        return null;
      } catch (error) {
        console.error("Token validation error:", error);
        return null;
      }
    },
    []
  );

  /**
   * Sync React auth state from the access-token store after a shared refresh.
   * Requires a successful profile load — token-only half-sessions are cleared.
   */
  const syncAuthStateFromStore = useCallback(
    async (generationSnapshot: number): Promise<boolean> => {
      if (!authGeneration.isCurrent(generationSnapshot)) {
        return true;
      }

      const access = getAccessToken();
      if (!access) {
        return false;
      }

      const updatedUser = await validateToken(access);
      if (!authGeneration.isCurrent(generationSnapshot)) {
        return true;
      }

      if (!updatedUser) {
        // Access exists but profile failed — do not leave token-only state.
        // Do not refresh again here (avoids loops); callers handle false.
        clearHalfSessionAccess();
        setToken(null);
        setUser(null);
        return false;
      }

      setToken(access);
      setUser(updatedUser);
      localStorage.setItem("user", JSON.stringify(updatedUser));
      return true;
    },
    [authGeneration, validateToken]
  );

  /**
   * Refreshes the access JWT via httpOnly cookie (shared single-flight in httpClient).
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    const generationSnapshot = authGeneration.snapshot();
    const accessAtStart = getAccessToken();

    try {
      const success = await refreshAuthTokens();

      if (!authGeneration.isCurrent(generationSnapshot)) {
        return true;
      }

      if (!success) {
        if (hasReplacementSession(accessAtStart, getAccessToken)) {
          return syncAuthStateFromStore(generationSnapshot);
        }
        return false;
      }

      return syncAuthStateFromStore(generationSnapshot);
    } catch (error) {
      console.error("Token refresh error:", error);
      if (!authGeneration.isCurrent(generationSnapshot)) {
        return true;
      }
      if (hasReplacementSession(accessAtStart, getAccessToken)) {
        return syncAuthStateFromStore(generationSnapshot);
      }
      return false;
    }
  }, [authGeneration, syncAuthStateFromStore]);

  refreshTokenRef.current = refreshToken;

  /**
   * Logs out the user and clears all authentication data
   */
  const logout = useCallback(async () => {
    authGeneration.bump();
    const access = tokenRef.current || getAccessToken();

    try {
      await httpClient.post(
        "/api/auth/logout/",
        {},
        { skipAuth: !access }
      );
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      clearWishlistStorage();
      clearCartStorage();
      clearAccessToken();
      clearLegacyTokenStorage();
      localStorage.removeItem("user");

      window.dispatchEvent(new CustomEvent("user:logout"));

      setToken(null);
      setUser(null);
    }
  }, [authGeneration]);

  logoutRef.current = logout;

  /**
   * Restores auth from sessionStorage access and/or httpOnly refresh cookie.
   * When no access token exists, probes the refresh cookie once (cookie-only sessions).
   */
  useEffect(() => {
    let cancelled = false;
    const restoreGeneration = authGeneration.snapshot();
    clearLegacyTokenStorage();
    const accessAtStart = getAccessToken();

    const restoreAuth = async () => {
      try {
        const storedToken = accessAtStart;

        if (storedToken) {
          const validatedUser = await validateToken(storedToken);

          if (cancelled || !authGeneration.isCurrent(restoreGeneration)) {
            return;
          }

          if (!authTokensUnchanged(accessAtStart, getAccessToken)) {
            if (hasReplacementSession(accessAtStart, getAccessToken)) {
              await syncAuthStateFromStore(restoreGeneration);
            }
            return;
          }

          if (validatedUser) {
            setToken(storedToken);
            setAccessToken(storedToken);
            setUser(validatedUser);
            localStorage.setItem("user", JSON.stringify(validatedUser));
          } else {
            const refreshSuccess = await refreshTokenRef.current();

            if (
              cancelled ||
              !authGeneration.isCurrent(restoreGeneration) ||
              hasReplacementSession(accessAtStart, getAccessToken)
            ) {
              return;
            }

            if (!refreshSuccess) {
              await logoutRef.current();
            }
          }
        } else {
          // No access in this tab — probe httpOnly refresh cookie once.
          // Failure is expected when logged out; do not run full logout side effects.
          const refreshSuccess = await refreshTokenRef.current();

          if (
            cancelled ||
            !authGeneration.isCurrent(restoreGeneration) ||
            hasReplacementSession(accessAtStart, getAccessToken)
          ) {
            return;
          }

          if (!refreshSuccess) {
            localStorage.removeItem("user");
          }
        }
      } catch (error) {
        console.error("Error restoring auth:", error);
        if (
          !cancelled &&
          authGeneration.isCurrent(restoreGeneration) &&
          !hasReplacementSession(accessAtStart, getAccessToken)
        ) {
          // Only full-logout when we started with an access token (had a session).
          if (accessAtStart) {
            await logoutRef.current();
          } else {
            localStorage.removeItem("user");
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    restoreAuth();

    return () => {
      cancelled = true;
    };
    // Mount-only: restore must not re-run when login/logout change callback identities
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Handles automatic logout events and tab visibility changes
   */
  useEffect(() => {
    const handleAutoLogout = () => {
      console.log("Automatic logout triggered by HTTP client");
      logout();
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && token) {
        const generationAtCheck = authGeneration.snapshot();
        const accessAtCheck = getAccessToken();

        validateToken(token).then((validatedUser) => {
          if (!authGeneration.isCurrent(generationAtCheck)) {
            return;
          }

          if (!validatedUser) {
            console.log("Token invalid on tab focus, attempting refresh...");
            refreshToken().then((refreshSuccess) => {
              if (refreshSuccess) {
                return;
              }
              if (
                authGeneration.isCurrent(generationAtCheck) &&
                !hasReplacementSession(accessAtCheck, getAccessToken)
              ) {
                logout();
              }
            });
          } else {
            setUser(validatedUser);
            localStorage.setItem("user", JSON.stringify(validatedUser));
          }
        });
      }
    };

    window.addEventListener("auth:logout", handleAutoLogout);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("auth:logout", handleAutoLogout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [logout, token, refreshToken, validateToken, authGeneration]);

  /**
   * Logs in a user with provided access token and user data.
   * Refresh is expected to already be set as an httpOnly cookie by the API.
   */
  const login = useCallback(
    (tokens: AuthTokens, newUser: User) => {
      authGeneration.bump();
      const normalized: User = {
        ...newUser,
        name: formatUserDisplayName(newUser),
      };
      setAccessToken(tokens.access);
      setToken(tokens.access);
      setUser(normalized);
      localStorage.setItem("user", JSON.stringify(normalized));
      clearLegacyTokenStorage();
      setLoading(false);
    },
    [authGeneration]
  );

  const contextValue: AuthContextType = {
    user,
    token,
    login,
    logout,
    loading,
    refreshToken,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
