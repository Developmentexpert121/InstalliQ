import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CheckCircle2, Loader2, Link2, RefreshCw, Eye, EyeOff, Unplug, Folder, Square, Database } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import TabUploadAssets from "./tab-upload-assets";

interface IntegrationStatus {
  status: "not_connected" | "connected";
  provider: string;
}

interface CompanyCamConfig {
  connected: boolean;
  maskedKey: string | null;
  lastSyncedAt: string | null;
}

interface GoogleDriveConfig {
  connected: boolean;
  email: string | null;
  folderId: string | null;
  folderName: string | null;
  lastSyncedAt: string | null;
}

interface SyncProgress {
  synced: number;
  complete?: boolean;
  status?: string;
  message?: string;
  error?: string;
  stopped?: boolean;
}

// ── Module-level singleton so sync state survives tab switches ─────────────
type SyncProgressListener = (p: SyncProgress | null) => void;
let _syncProgress: SyncProgress | null = null;
const _syncListeners = new Set<SyncProgressListener>();

function _emitSyncProgress(p: SyncProgress | null) {
  _syncProgress = p;
  _syncListeners.forEach(l => l(p));
}

/** Subscribe to CompanyCam sync progress from any component outside this tab.
 *  Polls the DB-backed server endpoint every 2 s — works across page refreshes,
 *  server restarts, and any tab regardless of which one started the sync. */
export function useSyncProgress(): SyncProgress | null {
  const [progress, setProgress] = useState<SyncProgress | null>(_syncProgress);

  // Subscribe to module-level emissions (SSE path — for the tab that started sync)
  useEffect(() => {
    const listener: SyncProgressListener = p => setProgress(p);
    _syncListeners.add(listener);
    setProgress(_syncProgress);
    return () => { _syncListeners.delete(listener); };
  }, []);

  // Poll DB-backed endpoint every 2 s — source of truth for all sessions
  const { data: pollData } = useQuery<{ running: boolean; synced?: number }>({
    queryKey: ["/api/asset-manager/companycam/sync-active"],
    refetchInterval: 2000,
    staleTime: 0,
  });

  useEffect(() => {
    if (pollData === undefined) return;

    if (pollData.running) {
      const serverCount = pollData.synced ?? 0;
      // Update banner: if not yet showing, or server has a higher count than local SSE
      if (!_syncProgress || _syncProgress.complete) {
        _emitSyncProgress({ synced: serverCount });
      } else if (serverCount > (_syncProgress.synced ?? 0)) {
        _emitSyncProgress({ ..._syncProgress, synced: serverCount });
      }
    } else {
      // Server confirmed sync is done — mark complete if we were showing in-progress
      if (_syncProgress && !_syncProgress.complete) {
        const final = { ..._syncProgress, complete: true };
        _emitSyncProgress(final);
        setTimeout(() => _emitSyncProgress(null), 4000);
      }
    }
  }, [pollData]);

  return progress;
}

export type { SyncProgress };

interface TenantAccessRow {
  ownerId: number;
  ownerName: string;
  ownerEmail: string | null;
  enabled: boolean;
  totalUploads: number;
}

interface Props {
  onGoToSearch?: () => void;
}

export default function TabAssetSetup({ onGoToSearch }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [driveUrlInput, setDriveUrlInput] = useState("");
  const [driveUrlError, setDriveUrlError] = useState<string | null>(null);
  const [changingLink, setChangingLink] = useState(false);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("all");

  const isSuperAdmin = user?.role === "super_admin";

  const syncAbortRef = useRef<AbortController | null>(null);
  const driveAbortRef = useRef<AbortController | null>(null);
  const syncClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driveClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
  const [driveSyncProgress, setDriveSyncProgress] = useState<SyncProgress | null>(null);
  const [installiqSyncResult, setInstalliqSyncResult] = useState<{ synced: number; skipped: number; total: number } | null>(null);

  // Global DB-backed sync state — picks up syncs started from other sessions/tabs
  const globalSyncProgress = useSyncProgress();

  const isSyncing = syncProgress !== null && !syncProgress.complete && !syncProgress.error;
  // When this tab didn't start the sync, fall back to the global DB-polled state
  const effectiveSyncProgress: SyncProgress | null =
    isSyncing ? syncProgress
    : (globalSyncProgress !== null && !globalSyncProgress.complete) ? globalSyncProgress
    : syncProgress;
  const effectiveIsSyncing =
    effectiveSyncProgress !== null && !effectiveSyncProgress.complete && !effectiveSyncProgress.error;

  const isDriveSyncing = driveSyncProgress !== null && !driveSyncProgress.complete && !driveSyncProgress.error;

  // Derived: the owner whose integrations we're managing
  const ownerIdNum = isSuperAdmin
    ? (selectedOwnerId && selectedOwnerId !== "all" ? parseInt(selectedOwnerId, 10) : undefined)
    : undefined;
  const ownerQs = ownerIdNum ? `?ownerId=${ownerIdNum}` : "";
  const ownerBody = ownerIdNum ? { ownerId: ownerIdNum } : {};

  useEffect(() => {
    return () => {
      syncAbortRef.current?.abort();
      driveAbortRef.current?.abort();
      if (syncClearRef.current !== null) clearTimeout(syncClearRef.current);
      if (driveClearRef.current !== null) clearTimeout(driveClearRef.current);
    };
  }, []);

  // Owner list (super_admin only)
  const { data: owners } = useQuery<TenantAccessRow[]>({
    queryKey: ["/api/asset-manager/access"],
    enabled: isSuperAdmin,
  });

  const { data: companycamStatus } = useQuery<IntegrationStatus>({
    queryKey: ["/api/asset-manager/integrations/companycam", ownerIdNum],
    queryFn: async () => {
      const res = await fetch(`/api/asset-manager/integrations/companycam${ownerQs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isSuperAdmin || !!ownerIdNum,
  });

  const { data: companycamConfig, isLoading: configLoading } = useQuery<CompanyCamConfig>({
    queryKey: ["/api/asset-manager/integrations/companycam/config", ownerIdNum],
    queryFn: async () => {
      const res = await fetch(`/api/asset-manager/integrations/companycam/config${ownerQs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isSuperAdmin || !!ownerIdNum,
  });

  const { data: driveStatus } = useQuery<IntegrationStatus>({
    queryKey: ["/api/asset-manager/integrations/google-drive", ownerIdNum],
    queryFn: async () => {
      const res = await fetch(`/api/asset-manager/integrations/google-drive${ownerQs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isSuperAdmin || !!ownerIdNum,
  });

  const { data: driveConfig, isLoading: driveConfigLoading } = useQuery<GoogleDriveConfig>({
    queryKey: ["/api/asset-manager/integrations/google-drive/config", ownerIdNum],
    queryFn: async () => {
      const res = await fetch(`/api/asset-manager/integrations/google-drive/config${ownerQs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !isSuperAdmin || !!ownerIdNum,
  });

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
    queryClient.invalidateQueries({ queryKey: ["/api/assets/stats"] });
    queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/setup"] });
  }, [queryClient]);

  const invalidateCompanyCam = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/integrations/companycam"] });
    queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/integrations/companycam/config"] });
  }, [queryClient]);

  const invalidateDrive = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/integrations/google-drive"] });
    queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/integrations/google-drive/config"] });
  }, [queryClient]);

  const startSync = useCallback(async (resync = false) => {
    syncAbortRef.current?.abort();
    if (syncClearRef.current !== null) { clearTimeout(syncClearRef.current); syncClearRef.current = null; }
    const controller = new AbortController();
    syncAbortRef.current = controller;
    setSyncProgress({ synced: 0 });
    _emitSyncProgress({ synced: 0 });

    try {
      const res = await fetch("/api/asset-manager/companycam/sync-stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resync, ...ownerBody }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data: SyncProgress = JSON.parse(line.slice(6));
            setSyncProgress(data);
            _emitSyncProgress(data);
            if (data.complete || data.error) {
              syncAbortRef.current = null;
              invalidateAll();
              invalidateCompanyCam();
              const msg = data.message ?? (data.error ? data.error : `Synced ${data.synced} photo(s)`);
              toast({ title: "CompanyCam Sync", description: msg, variant: data.error ? "destructive" : "default" });
              syncClearRef.current = setTimeout(() => { setSyncProgress(null); _emitSyncProgress(null); syncClearRef.current = null; }, 4000);
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      syncAbortRef.current = null;
      setSyncProgress(null);
      _emitSyncProgress(null);
      toast({ title: "Sync connection lost", variant: "destructive" });
    }
  }, [invalidateAll, invalidateCompanyCam, toast, ownerIdNum]);

  const stopSync = useCallback(async () => {
    syncAbortRef.current?.abort();
    syncAbortRef.current = null;
    try {
      await fetch("/api/asset-manager/companycam/sync-stop", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ownerBody }),
      });
    } catch {}
    const stoppedProg = _syncProgress ? { ..._syncProgress, complete: true, stopped: true, message: "Sync stopped." } : null;
    setSyncProgress(stoppedProg);
    _emitSyncProgress(stoppedProg);
    if (syncClearRef.current !== null) clearTimeout(syncClearRef.current);
    syncClearRef.current = setTimeout(() => { setSyncProgress(null); _emitSyncProgress(null); syncClearRef.current = null; }, 4000);
    invalidateAll();
    invalidateCompanyCam();
  }, [invalidateAll, invalidateCompanyCam, ownerIdNum]);

  const startDriveSync = useCallback(async () => {
    driveAbortRef.current?.abort();
    if (driveClearRef.current !== null) { clearTimeout(driveClearRef.current); driveClearRef.current = null; }
    const controller = new AbortController();
    driveAbortRef.current = controller;
    setDriveSyncProgress({ synced: 0 });

    try {
      const res = await fetch("/api/asset-manager/google-drive/sync-stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ownerBody }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data: SyncProgress = JSON.parse(line.slice(6));
            setDriveSyncProgress(data);
            if (data.complete || data.error) {
              driveAbortRef.current = null;
              invalidateAll();
              const msg = data.message ?? (data.error ? data.error : `Synced ${data.synced} photo(s)`);
              toast({ title: "Google Drive Sync", description: msg, variant: data.error ? "destructive" : "default" });
              driveClearRef.current = setTimeout(() => { setDriveSyncProgress(null); driveClearRef.current = null; }, 4000);
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      driveAbortRef.current = null;
      setDriveSyncProgress(null);
      toast({ title: "Google Drive sync connection lost", variant: "destructive" });
    }
  }, [invalidateAll, toast, ownerIdNum]);

  const saveTokenMutation = useMutation({
    mutationFn: async (apiKey: string) => {
      const res = await apiRequest("PUT", "/api/asset-manager/integrations/companycam/config", { apiKey, ...ownerBody });
      return res.json() as Promise<CompanyCamConfig>;
    },
    onSuccess: (data) => {
      if (data.connected) {
        invalidateCompanyCam();
        toast({ title: "CompanyCam Connected", description: `Token saved (${data.maskedKey})` });
        setTokenInput("");
      } else {
        toast({ title: "Connection Failed", description: "Token was not accepted", variant: "destructive" });
      }
    },
    onError: () => toast({ title: "Failed to save token", variant: "destructive" }),
  });

  const disconnectCompanyCamMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/asset-manager/integrations/companycam/config", { ...ownerBody });
      return res.json();
    },
    onSuccess: () => {
      invalidateCompanyCam();
      toast({ title: "CompanyCam Disconnected" });
    },
    onError: () => toast({ title: "Failed to disconnect", variant: "destructive" }),
  });

  const disconnectDriveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/asset-manager/integrations/google-drive/config", { ...ownerBody });
      return res.json();
    },
    onSuccess: () => {
      invalidateDrive();
      invalidateAll();
      toast({ title: "Google Drive Disconnected" });
    },
    onError: () => toast({ title: "Failed to disconnect Google Drive", variant: "destructive" }),
  });

  const installiqSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sync-installiq-assets", { ...ownerBody });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Sync failed");
      }
      return res.json() as Promise<{ synced: number; skipped: number; total: number; errors: string[] }>;
    },
    onSuccess: (data) => {
      setInstalliqSyncResult({ synced: data.synced, skipped: data.skipped, total: data.total });
      invalidateAll();
      toast({
        title: "InstalliQ Sync Complete",
        description: `${data.synced} photo${data.synced !== 1 ? "s" : ""} synced from ${data.total} project${data.total !== 1 ? "s" : ""}`,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Sync failed";
      toast({ title: "InstalliQ Sync Failed", description: msg, variant: "destructive" });
    },
  });

  function validateDriveUrl(url: string): string | null {
    if (!url.trim()) return "Please paste a Google Drive folder link.";
    if (!url.includes("drive.google.com")) return "This doesn't look like a Google Drive link.";
    if (!url.includes("/drive/folders/") && !url.includes("?id=") && !url.includes("&id=")) {
      return "Please use a folder link, e.g. https://drive.google.com/drive/folders/…";
    }
    return null;
  }

  const saveDriveLinkMutation = useMutation({
    mutationFn: async (folderUrl: string) => {
      const res = await apiRequest("PUT", "/api/asset-manager/integrations/google-drive/config", { folderUrl, ...ownerBody });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to connect folder");
      }
      return res.json() as Promise<GoogleDriveConfig>;
    },
    onSuccess: (data) => {
      invalidateDrive();
      setDriveUrlInput("");
      setDriveUrlError(null);
      setChangingLink(false);
      toast({ title: "Google Drive Connected", description: `Syncing from: ${data.folderName}` });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Failed to connect Google Drive folder";
      toast({ title: "Connection Failed", description: msg, variant: "destructive" });
    },
  });

  function handleDriveLinkSubmit() {
    const err = validateDriveUrl(driveUrlInput);
    if (err) { setDriveUrlError(err); return; }
    setDriveUrlError(null);
    saveDriveLinkMutation.mutate(driveUrlInput.trim());
  }

  const companycamConnected = companycamStatus?.status === "connected";
  const driveConnected = driveStatus?.status === "connected";

  const DisconnectCompanyCamDialog = () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
          data-testid="button-companycam-disconnect"
        >
          <Unplug className="h-3.5 w-3.5 mr-1.5" /> Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect CompanyCam?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove your CompanyCam API token. You can reconnect at any time by entering a new token.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => disconnectCompanyCamMutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-disconnect"
          >
            {disconnectCompanyCamMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const DisconnectDriveDialog = () => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive"
          data-testid="button-google-drive-disconnect"
        >
          <Unplug className="h-3.5 w-3.5 mr-1.5" /> Disconnect
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Disconnect Google Drive?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove your Google Drive folder link. Previously synced photos will remain in your asset library. You can reconnect at any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => disconnectDriveMutation.mutate()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            data-testid="button-confirm-drive-disconnect"
          >
            {disconnectDriveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Disconnect
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const selectedOwnerName = owners?.find(o => String(o.ownerId) === selectedOwnerId)?.ownerName;

  return (
    <TooltipProvider>
      <div className="space-y-6" data-testid="section-asset-setup">
        <div>
          <h2 className="text-lg font-semibold">Asset Setup</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Connect external sources and manage your asset library configuration.
          </p>
        </div>

        {/* Owner picker — super_admin only */}
        {isSuperAdmin && owners && owners.length > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
            <span className="text-sm text-muted-foreground shrink-0">Managing owner:</span>
            <Select
              value={selectedOwnerId}
              onValueChange={(val) => {
                setSelectedOwnerId(val);
                setSyncProgress(null);
                _emitSyncProgress(null);
                setDriveSyncProgress(null);
                setTokenInput("");
                setChangingLink(false);
              }}
            >
              <SelectTrigger className="w-64 h-8 text-sm" data-testid="select-owner-setup">
                <SelectValue placeholder="Select one owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="select-setup-owner-all">Select one owner</SelectItem>
                {owners.map(o => (
                  <SelectItem key={o.ownerId} value={String(o.ownerId)} data-testid={`select-setup-owner-${o.ownerId}`}>
                    {o.ownerName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Gate: super_admin must select an owner before seeing integration cards */}
        {isSuperAdmin && !ownerIdNum ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border-2 border-dashed rounded-xl">
            <p className="text-sm font-medium">Select an owner above to manage their integrations and uploads.</p>
          </div>
        ) : (
        <>

        {/* Integration Cards */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Integrations
          </h3>
          <div className="flex flex-col gap-4">

            {/* CompanyCam */}
            <Card data-testid="card-integration-companycam">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" /> CompanyCam
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={companycamConnected ? "default" : "secondary"}
                      data-testid="badge-companycam-status"
                    >
                      {companycamConnected ? "Connected" : "Not Connected"}
                    </Badge>
                    {companycamConnected && <DisconnectCompanyCamDialog />}
                  </div>
                </div>
                <CardDescription>
                  Import job-site photos directly from CompanyCam into your asset library.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {configLoading ? (
                  <Skeleton className="h-9 w-full" />
                ) : companycamConnected ? (
                  <>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                      <span className="text-sm font-mono text-muted-foreground" data-testid="text-companycam-masked-key">
                        {companycamConfig?.maskedKey ?? "••••••••••••"}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground" data-testid="text-companycam-last-synced">
                      {companycamConfig?.lastSyncedAt
                        ? <>Last synced: <span className="font-medium text-foreground">{new Date(companycamConfig.lastSyncedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></>
                        : "Never synced"}
                    </p>

                    {effectiveIsSyncing && effectiveSyncProgress && (
                      <div className="flex items-center gap-2 text-sm rounded-md border bg-muted/30 px-3 py-2" data-testid="section-sync-progress">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                        <span className="text-muted-foreground">
                          Syncing… <span className="font-medium text-foreground">{effectiveSyncProgress.synced}</span> imported so far
                        </span>
                      </div>
                    )}
                    {syncProgress?.complete && (
                      <div
                        className={`flex items-center gap-2 text-sm rounded-md border px-3 py-2 ${
                          syncProgress.error
                            ? "text-destructive border-destructive/30 bg-destructive/10"
                            : "text-green-700 dark:text-green-400 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20"
                        }`}
                        data-testid="text-sync-complete"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        {syncProgress.error ?? syncProgress.message ?? `Synced ${syncProgress.synced} photo(s)`}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      {effectiveIsSyncing ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled
                            data-testid="button-companycam-sync"
                          >
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Syncing…
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={stopSync}
                            data-testid="button-companycam-sync-stop"
                          >
                            <Square className="h-3 w-3 mr-1.5 fill-current" />Stop
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => startSync(false)}
                          data-testid="button-companycam-sync"
                        >
                          <RefreshCw className="h-3.5 w-3.5 mr-2" />Sync Now
                        </Button>
                      )}

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={effectiveIsSyncing}
                            data-testid="button-companycam-resync-all"
                          >
                            Re-sync All
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Re-sync all CompanyCam photos?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This checks every photo in CompanyCam from the beginning, not just new ones since the last sync. Photos already in your library won't be duplicated, but this may take longer than a normal sync.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => startSync(true)} data-testid="button-companycam-resync-confirm">
                              Re-sync All
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="companycam-token" className="text-xs text-muted-foreground">
                        API Token
                      </Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            id="companycam-token"
                            type={showToken ? "text" : "password"}
                            value={tokenInput}
                            onChange={(e) => setTokenInput(e.target.value)}
                            placeholder="Paste your CompanyCam API token"
                            className="pr-9 text-sm"
                            data-testid="input-companycam-token"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && tokenInput.trim()) {
                                saveTokenMutation.mutate(tokenInput.trim());
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => setShowToken(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            data-testid="button-toggle-token-visibility"
                          >
                            {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        <Button
                          size="sm"
                          disabled={!tokenInput.trim() || saveTokenMutation.isPending}
                          onClick={() => saveTokenMutation.mutate(tokenInput.trim())}
                          data-testid="button-companycam-connect"
                        >
                          {saveTokenMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : "Connect"}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Find your token in CompanyCam → Settings → API &amp; Integrations.
                      </p>
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" size="sm" disabled data-testid="button-companycam-sync">
                            <RefreshCw className="h-3.5 w-3.5 mr-2" />Sync Now
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Connect CompanyCam first to enable sync</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Google Drive */}
            <Card data-testid="card-integration-google-drive">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <SiGoogle className="h-4 w-4 text-blue-500" /> Google Drive
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={driveConnected ? "default" : "secondary"}
                      data-testid="badge-google-drive-status"
                    >
                      {driveConnected ? "Connected" : "Not Connected"}
                    </Badge>
                    {driveConnected && <DisconnectDriveDialog />}
                  </div>
                </div>
                <CardDescription>
                  Sync installation photos from a shared Google Drive folder into your asset library.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {driveConnected ? (
                  <>
                    {/* Connected folder info */}
                    {driveConfigLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : driveConfig ? (
                      <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center gap-2">
                        <Folder className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                        <span className="text-sm font-medium truncate flex-1" data-testid="text-drive-folder">
                          {driveConfig.folderName ?? driveConfig.folderId}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs shrink-0"
                          onClick={() => { setChangingLink(v => !v); setDriveUrlInput(""); setDriveUrlError(null); }}
                          data-testid="button-change-drive-link"
                        >
                          Change Link
                        </Button>
                      </div>
                    ) : null}

                    {/* Inline change-link input — toggled by Change Link button */}
                    {changingLink && (
                      <div className="space-y-1.5">
                        <div className="flex gap-2">
                          <Input
                            id="drive-url-change"
                            type="url"
                            value={driveUrlInput}
                            onChange={(e) => { setDriveUrlInput(e.target.value); setDriveUrlError(null); }}
                            placeholder="https://drive.google.com/drive/folders/…"
                            className={`text-sm flex-1 ${driveUrlError ? "border-destructive" : ""}`}
                            data-testid="input-drive-url-change"
                            onKeyDown={(e) => { if (e.key === "Enter") handleDriveLinkSubmit(); }}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            disabled={saveDriveLinkMutation.isPending}
                            onClick={handleDriveLinkSubmit}
                            data-testid="button-drive-url-update"
                          >
                            {saveDriveLinkMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Update"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setChangingLink(false); setDriveUrlInput(""); setDriveUrlError(null); }}
                            data-testid="button-drive-url-cancel"
                          >
                            Cancel
                          </Button>
                        </div>
                        {driveUrlError && (
                          <p className="text-xs text-destructive" data-testid="text-drive-url-error">{driveUrlError}</p>
                        )}
                      </div>
                    )}

                    {/* Sync progress / result */}
                    {isDriveSyncing && driveSyncProgress && (
                      <div className="flex items-center gap-2 text-sm rounded-md border bg-muted/30 px-3 py-2" data-testid="section-drive-sync-progress">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                        <span className="text-muted-foreground">
                          Syncing… <span className="font-medium text-foreground">{driveSyncProgress.synced}</span> imported so far
                        </span>
                      </div>
                    )}
                    {driveSyncProgress?.complete && (
                      <div
                        className={`flex items-center gap-2 text-sm rounded-md border px-3 py-2 ${
                          driveSyncProgress.error
                            ? "text-destructive border-destructive/30 bg-destructive/10"
                            : "text-green-700 dark:text-green-400 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20"
                        }`}
                        data-testid="text-drive-sync-complete"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        {driveSyncProgress.error ?? driveSyncProgress.message ?? `Synced ${driveSyncProgress.synced} photo(s)`}
                      </div>
                    )}

                    <Button
                      size="sm"
                      disabled={isDriveSyncing}
                      onClick={startDriveSync}
                      data-testid="button-google-drive-sync"
                    >
                      {isDriveSyncing ? (
                        <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Syncing…</>
                      ) : (
                        <><RefreshCw className="h-3.5 w-3.5 mr-2" />Sync Now</>
                      )}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* Step-by-step guide */}
                    <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1">
                      <p className="text-xs font-medium text-foreground">How to connect your Drive folder:</p>
                      <ol className="text-xs text-muted-foreground space-y-0.5 list-none">
                        <li className="flex items-start gap-1.5">
                          <span className="font-semibold text-primary shrink-0">1.</span>
                          Open Google Drive and right-click your photos folder
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="font-semibold text-primary shrink-0">2.</span>
                          Choose <strong className="text-foreground">Share</strong> → set access to <strong className="text-foreground">Anyone with the link</strong>
                        </li>
                        <li className="flex items-start gap-1.5">
                          <span className="font-semibold text-primary shrink-0">3.</span>
                          Click <strong className="text-foreground">Copy link</strong>, then paste it below and click Connect
                        </li>
                      </ol>
                    </div>

                    {/* URL input + connect */}
                    <div className="space-y-1.5">
                      <Label htmlFor="drive-folder-url" className="text-xs text-muted-foreground">
                        Folder link
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id="drive-folder-url"
                          type="url"
                          value={driveUrlInput}
                          onChange={(e) => { setDriveUrlInput(e.target.value); setDriveUrlError(null); }}
                          placeholder="https://drive.google.com/drive/folders/…"
                          className={`text-sm flex-1 ${driveUrlError ? "border-destructive" : ""}`}
                          data-testid="input-drive-folder-url"
                          onKeyDown={(e) => { if (e.key === "Enter") handleDriveLinkSubmit(); }}
                        />
                        <Button
                          size="sm"
                          disabled={saveDriveLinkMutation.isPending}
                          onClick={handleDriveLinkSubmit}
                          data-testid="button-google-drive-connect"
                        >
                          {saveDriveLinkMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : "Connect"}
                        </Button>
                      </div>
                      {driveUrlError && (
                        <p className="text-xs text-destructive" data-testid="text-drive-url-error-connect">{driveUrlError}</p>
                      )}
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="outline" size="sm" disabled data-testid="button-google-drive-sync">
                            <RefreshCw className="h-3.5 w-3.5 mr-2" />Sync Now
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Connect a Drive folder first to enable sync</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </CardContent>
            </Card>

          </div>
        </div>

        {/* InstalliQ Projects — backfill section */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            InstalliQ Projects
          </h3>
          <Card data-testid="card-installiq-sync">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" /> Project Photos
              </CardTitle>
              <CardDescription>
                Pull all existing project photos from InstalliQ into your asset library in one click. Photos already synced won't be duplicated — this is safe to run at any time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {installiqSyncMutation.isPending && (
                <div className="flex items-center gap-2 text-sm rounded-md border bg-muted/30 px-3 py-2" data-testid="section-installiq-sync-progress">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0" />
                  <span className="text-muted-foreground">Syncing project photos… this may take a moment</span>
                </div>
              )}
              {installiqSyncResult && !installiqSyncMutation.isPending && (
                <div
                  className="flex items-center gap-2 text-sm rounded-md border px-3 py-2 text-green-700 dark:text-green-400 border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20"
                  data-testid="text-installiq-sync-result"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  {installiqSyncResult.synced} photo{installiqSyncResult.synced !== 1 ? "s" : ""} synced from {installiqSyncResult.total} project{installiqSyncResult.total !== 1 ? "s" : ""}
                  {installiqSyncResult.skipped > 0 && (
                    <span className="text-muted-foreground ml-1">({installiqSyncResult.skipped} skipped)</span>
                  )}
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={installiqSyncMutation.isPending}
                onClick={() => { setInstalliqSyncResult(null); installiqSyncMutation.mutate(); }}
                data-testid="button-installiq-sync"
              >
                {installiqSyncMutation.isPending ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />Syncing…</>
                ) : (
                  <><RefreshCw className="h-3.5 w-3.5 mr-2" />Sync Now</>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Upload Assets — last section after integration cards */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Upload Assets
            {selectedOwnerName && (
              <span className="ml-2 text-xs font-normal normal-case text-muted-foreground">
                — uploading for {selectedOwnerName}
              </span>
            )}
          </h3>
          <TabUploadAssets onGoToSearch={onGoToSearch} ownerId={ownerIdNum} />
        </div>

        </>
        )}

      </div>
    </TooltipProvider>
  );
}
