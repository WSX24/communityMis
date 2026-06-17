export type RouteSurface = "launcher" | "public" | "userAuth" | "user" | "adminAuth" | "admin";

export type RouteLayout = "entry" | "auth" | "userShell" | "adminAuth" | "adminShell";

export type AppRoute = {
  id: string;
  title: string;
  path: string;
  entryPath: string;
  surface: RouteSurface;
  layout: RouteLayout;
};

export type RuntimeConfig = {
  apiBaseUrl: string;
  appEnv: string;
  buildVersion: string;
  sentryDsn: string;
  sentryTracesSampleRate: number;
  sentryIngestOrigin: string;
};

export type SessionUser = {
  userId: number;
  username: string;
  displayName?: string | null;
  role: "user" | "admin" | "super_admin" | string;
  avatarUrl?: string | null;
  creditScore?: number | null;
  skillTags?: string[];
};

export type AuthSession = {
  user: SessionUser;
  role: string;
};

export type ApiList<T> = {
  items?: T[];
  total?: number;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};
