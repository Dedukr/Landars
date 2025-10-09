"use client";
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
  useCallback,
} from "react";
import { httpClient } from "@/utils/httpClient";

interface User {
  id: number;
  name: string;
  email: string;
}

interface AuthTokens {
  access: string;
  refresh: string;
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
  const [refreshTokenValue, setRefreshTokenValue] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * Validates a JWT token by making a test request to the user endpoint
   */
  const validateToken = useCallback(
    async (tokenToValidate: string): Promise<boolean> => {
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
          return false;
        }

        return true;
      } catch (error) {
        console.error("Token validation error:", error);
        return false;
      }
    },
    []
  );

  /**
   * Refreshes the JWT token using the stored refresh token
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    // Prevent concurrent refresh attempts
    if (refreshing) {
      return false;
    }

    try {
      setRefreshing(true);
      const currentRefreshToken =
        refreshTokenValue || localStorage.getItem("refreshToken");
      if (!currentRefreshToken) {
        return false;
      }

      const data = await httpClient.post<{ access: string; refresh?: string }>(
        "/api/auth/token/refresh/",
        { refresh: currentRefreshToken }
      );

      setToken(data.access);
      localStorage.setItem("authToken", data.access);

      // Update refresh token if provided (token rotation)
      if (data.refresh) {
        setRefreshTokenValue(data.refresh);
        localStorage.setItem("refreshToken", data.refresh);
      }

      return true;
    } catch (error) {
      console.error("Token refresh error:", error);
      return false;
    } finally {
      setRefreshing(false);
    }
  }, [refreshTokenValue, refreshing]);

  /**
   * Logs out the user and clears all authentication data
   */
  const logout = useCallback(async () => {
    try {
      // Call logout endpoint if token exists
      if (token && refreshTokenValue) {
        await httpClient.post("/api/auth/logout/", {
          refresh: refreshTokenValue,
        });
      }
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      // Clear local state regardless of API call result
      setToken(null);
      setRefreshTokenValue(null);
      setUser(null);
      localStorage.removeItem("authToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
      localStorage.removeItem("wishlist");
    }
  }, [token, refreshTokenValue]);

  /**
   * Restores authentication state from localStorage on app initialization
   */
  useEffect(() => {
    const restoreAuth = async () => {
      try {
        const storedToken = localStorage.getItem("authToken");
        const storedRefresh = localStorage.getItem("refreshToken");
        const storedUser = localStorage.getItem("user");

        if (storedToken && storedRefresh && storedUser) {
          const userData = JSON.parse(storedUser);

          // Validate the stored token
          const isValid = await validateToken(storedToken);

          if (isValid) {
            // Token is valid, restore auth state
            setToken(storedToken);
            setRefreshTokenValue(storedRefresh);
            setUser(userData);
          } else {
            // Token is invalid, try to refresh
            const refreshSuccess = await refreshToken();
            if (!refreshSuccess) {
              // Refresh failed, clear auth data
              await logout();
            }
          }
        }
      } catch (error) {
        console.error("Error restoring auth:", error);
        await logout();
      } finally {
        setLoading(false);
      }
    };

    restoreAuth();
  }, [validateToken, refreshToken, logout]);

  /**
   * Handles automatic logout events and tab visibility changes
   */
  useEffect(() => {
    const handleAutoLogout = () => {
      console.log("Automatic logout triggered by HTTP client");
      logout();
    };

    const handleBeforeUnload = () => {
      // Optional: Save any pending state before page unload
      // This is a good place to save cart state, etc.
    };

    const handleVisibilityChange = () => {
      // When user returns to the tab, validate token if we have one
      if (!document.hidden && token) {
        validateToken(token).then((isValid) => {
          if (!isValid) {
            console.log("Token invalid on tab focus, attempting refresh...");
            refreshToken().then((refreshSuccess) => {
              if (!refreshSuccess) {
                logout();
              }
            });
          }
        });
      }
    };

    window.addEventListener("auth:logout", handleAutoLogout);
    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("auth:logout", handleAutoLogout);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [logout, token, refreshToken, validateToken]);

  /**
   * Logs in a user with provided tokens and user data
   */
  const login = useCallback((tokens: AuthTokens, newUser: User) => {
    setToken(tokens.access);
    setRefreshTokenValue(tokens.refresh);
    setUser(newUser);
    localStorage.setItem("authToken", tokens.access);
    localStorage.setItem("refreshToken", tokens.refresh);
    localStorage.setItem("user", JSON.stringify(newUser));
  }, []);

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
