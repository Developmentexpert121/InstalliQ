import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { queryClient, registerUnauthorizedHandler, clearUnauthorizedHandler } from "@/lib/queryClient";
import type { User } from "@shared/schema";

const TEST_MODE = false;
const TEST_USER: User = {
  id: 1,
  username: "smehta",
  name: "Test User",
  password: "",
  email: null,
  phone: null,
  role: "super_admin",
  isMaster: "true",
  tempPassword: null,
  location: null,
  createdBy: null,
  faceDescriptor: null,
  faceEnabled: false,
  faceRegisteredAt: null,
  facePhoto: null,
  onboardingCompleted: false,
  openaiAssistantId: null,
  googleId: null,
  googleEmail: null,
  googleEnabled: false,
  signsuiteiqUserId: null,
  paymentRequired: false,
  paymentCompleted: false,
  createdAt: new Date(),
  deletedAt: null,
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  signsuiteiqWidgetToken: string | null;
  login: (username: string, password: string, rememberMe?: boolean) => Promise<void>;
  faceLogin: (descriptor: number[]) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [signsuiteiqWidgetToken, setSignsuiteiqWidgetToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  // One call on mount to restore session from server. That's all we need.
  // Session expiry is detected reactively: any API call that returns 401 will
  // trigger the handler below, which clears the user and redirects to login —
  // no polling or navigation-based refreshing required.
  useEffect(() => {
    checkAuth();
  }, []);

  // Register a global 401 handler so the query client can clear auth state
  // when the session expires, without this component needing to poll.
  useEffect(() => {
    registerUnauthorizedHandler(() => {
      queryClient.clear();
      setUser(null);
      setLocation("/");
    });
    return () => clearUnauthorizedHandler();
  }, []);

  async function checkAuth() {
    if (TEST_MODE) {
      setUser(TEST_USER);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSignsuiteiqWidgetToken(data.signsuiteiqWidgetToken ?? null);
      }
    } catch (error) {
      console.error("Auth check failed:", error);
    } finally {
      setIsLoading(false);
    }
  }

  async function login(username: string, password: string, rememberMe: boolean = false): Promise<void> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, rememberMe }),
      credentials: "include",
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Login failed");
    }

    const data = await res.json();
    queryClient.clear();
    setUser(data.user);
    setLocation("/calendar");
  }

  async function faceLogin(descriptor: number[]): Promise<void> {
    const res = await fetch("/api/auth/face-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descriptor }),
      credentials: "include",
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Face login failed");
    }

    const data = await res.json();
    queryClient.clear();
    setUser(data.user);
    setLocation("/calendar");
  }

  async function refreshUser() {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setSignsuiteiqWidgetToken(data.signsuiteiqWidgetToken ?? null);
      }
    } catch (error) {
      console.error("Failed to refresh user:", error);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
    queryClient.clear();
    setUser(null);
    setSignsuiteiqWidgetToken(null);
    setLocation("/");
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, signsuiteiqWidgetToken, login, faceLogin, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
