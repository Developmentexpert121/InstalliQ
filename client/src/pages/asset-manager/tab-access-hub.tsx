import { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Progress } from "@/components/ui/progress";
import { Users, FolderOpen, Sparkles, Loader2, CheckCircle2, Square } from "lucide-react";
import { emitTagProgress, type TagProgress } from "./tab-search-assets";

interface TenantAccessRow {
  ownerId: number;
  ownerName: string;
  ownerEmail: string | null;
  enabled: boolean;
  totalUploads: number;
}

// Module-level abort controllers keyed by ownerId so tagging can be stopped
const _ownerTagControllers = new Map<number, AbortController>();

export default function TabAccessHub() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [ownerTagStates, setOwnerTagStates] = useState<Map<number, TagProgress>>(new Map());
  const clearTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("all");

  const { data: rows, isLoading } = useQuery<TenantAccessRow[]>({
    queryKey: ["/api/asset-manager/access"],
  });

  const filteredRows = rows && selectedOwnerId !== "all"
    ? rows.filter(r => String(r.ownerId) === selectedOwnerId)
    : rows;

  const toggleMutation = useMutation({
    mutationFn: ({ ownerId, enabled }: { ownerId: number; enabled: boolean }) =>
      apiRequest("PATCH", `/api/asset-manager/access/${ownerId}`, { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/access"] });
      queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/my-access"] });
      toast({ title: "Access updated" });
    },
    onError: () => toast({ title: "Failed to update access", variant: "destructive" }),
  });

  const startTaggingForOwner = useCallback(async (ownerId: number, ownerName: string) => {
    // Abort any existing tagging for this owner
    _ownerTagControllers.get(ownerId)?.abort();
    if (clearTimers.current.has(ownerId)) {
      clearTimeout(clearTimers.current.get(ownerId)!);
      clearTimers.current.delete(ownerId);
    }

    const controller = new AbortController();
    _ownerTagControllers.set(ownerId, controller);

    const initial: TagProgress = { done: 0, total: 0, failed: 0 };
    setOwnerTagStates(prev => new Map(prev).set(ownerId, initial));
    emitTagProgress(initial);

    try {
      const res = await fetch("/api/assets/ai-tag-all-stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
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
            const data: TagProgress = JSON.parse(line.slice(6));
            setOwnerTagStates(prev => new Map(prev).set(ownerId, data));
            emitTagProgress(data);
            if (data.complete || data.error) {
              _ownerTagControllers.delete(ownerId);
              queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
              queryClient.invalidateQueries({ queryKey: ["/api/assets/stats"] });
              queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/access"] });
              if (data.error) {
                toast({ title: "Tagging Failed", description: data.error, variant: "destructive" });
              } else {
                const tagged = data.tagged ?? (data.done - (data.failed ?? 0));
                toast({
                  title: `AI Tagging Complete — ${ownerName}`,
                  description: `Tagged: ${tagged}, Failed: ${data.failed ?? 0}`,
                });
              }
              const t = setTimeout(() => {
                setOwnerTagStates(prev => { const n = new Map(prev); n.delete(ownerId); return n; });
                emitTagProgress(null);
                clearTimers.current.delete(ownerId);
              }, 5000);
              clearTimers.current.set(ownerId, t);
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as { name?: string }).name === "AbortError") return;
      _ownerTagControllers.delete(ownerId);
      setOwnerTagStates(prev => { const n = new Map(prev); n.delete(ownerId); return n; });
      emitTagProgress(null);
      toast({ title: "Tagging connection lost", variant: "destructive" });
    }
  }, [queryClient, toast]);

  const stopTaggingForOwner = useCallback(async (ownerId: number) => {
    // Signal the server to abort its loop
    try {
      await fetch("/api/assets/ai-tag-stop", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      });
    } catch {}
    // Also abort the local SSE stream so the client stops reading
    _ownerTagControllers.get(ownerId)?.abort();
    _ownerTagControllers.delete(ownerId);
  }, []);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <div className="space-y-5" data-testid="section-access-hub">
      <div>
        <h2 className="text-lg font-semibold">Access Hub</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {isAdmin
            ? "Manage Asset Manager access and AI tagging per owner."
            : "View your Asset Manager access status."}
        </p>
      </div>

      {/* Owner picker — super_admin only */}
      {isSuperAdmin && rows && rows.length > 0 && (
        <div className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
          <span className="text-sm text-muted-foreground shrink-0">Managing owner:</span>
          <Select
            value={selectedOwnerId}
            onValueChange={setSelectedOwnerId}
          >
            <SelectTrigger className="w-64 h-8 text-sm" data-testid="select-owner-access-hub">
              <SelectValue placeholder="Select one owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-access-hub-owner-all">Select one owner</SelectItem>
              {rows.map(o => (
                <SelectItem key={o.ownerId} value={String(o.ownerId)} data-testid={`select-access-hub-owner-${o.ownerId}`}>
                  {o.ownerName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-11 rounded-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !filteredRows || filteredRows.length === 0 ? (
        <Card>
          <CardContent className="p-8 flex flex-col items-center gap-3 text-center text-muted-foreground">
            <Users className="h-10 w-10" />
            <p className="font-medium">{selectedOwnerId !== "all" ? "Owner not found" : "No admins found"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3" data-testid="list-access-rows">
          {filteredRows.map((row) => {
            const tagState = ownerTagStates.get(row.ownerId);
            const isTagging = tagState !== undefined && !tagState.complete && !tagState.error;
            const tagDone = tagState?.complete || tagState?.error;

            return (
              <Card key={row.ownerId} data-testid={`card-access-${row.ownerId}`}>
                <CardContent className="p-4 space-y-3">
                  {/* Top row: owner info + action buttons */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                        <FolderOpen className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate" data-testid={`text-owner-name-${row.ownerId}`}>
                          {row.ownerName}
                        </p>
                        {row.ownerEmail && (
                          <p className="text-sm text-muted-foreground truncate">{row.ownerEmail}</p>
                        )}
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <Badge
                            variant={row.enabled ? "default" : "secondary"}
                            className="text-xs"
                            data-testid={`badge-access-status-${row.ownerId}`}
                          >
                            {row.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {row.totalUploads} asset{row.totalUploads !== 1 ? "s" : ""}
                          </span>

                          {/* Inline status text */}
                          {isTagging && tagState && (
                            <span className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400" data-testid={`text-tag-progress-${row.ownerId}`}>
                              <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                              {tagState.total > 0
                                ? `${tagState.done} / ${tagState.total} tagged…`
                                : "Starting…"}
                            </span>
                          )}
                          {tagDone && tagState && (
                            <span
                              className={`flex items-center gap-1 text-xs ${
                                tagState.error
                                  ? "text-destructive"
                                  : tagState.stopped
                                  ? "text-orange-600 dark:text-orange-400"
                                  : "text-green-700 dark:text-green-400"
                              }`}
                              data-testid={`text-tag-done-${row.ownerId}`}
                            >
                              {!tagState.error && !tagState.stopped && <CheckCircle2 className="h-3 w-3 shrink-0" />}
                              {tagState.error
                                ? "Tagging failed"
                                : tagState.stopped
                                ? `Stopped · ${tagState.tagged ?? tagState.done - (tagState.failed ?? 0)} tagged`
                                : `${tagState.tagged ?? tagState.done - (tagState.failed ?? 0)} tagged`}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {/* Stop button — visible while tagging is in progress */}
                      {isSuperAdmin && isTagging && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-red-300 text-red-700 hover:bg-red-50 dark:text-red-400 dark:border-red-700"
                          onClick={() => stopTaggingForOwner(row.ownerId)}
                          data-testid={`button-stop-tagging-${row.ownerId}`}
                        >
                          <Square className="h-3 w-3 mr-1.5 fill-current" />
                          Stop
                        </Button>
                      )}

                      {/* Tag Assets button — super_admin only, all owner rows */}
                      {isSuperAdmin && !isTagging && !tagDone && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 border-orange-300 text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:border-orange-700"
                              data-testid={`button-tag-assets-${row.ownerId}`}
                            >
                              <Sparkles className="h-3 w-3 mr-1.5" />
                              Tag Assets
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Run AI Batch Tagging?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will tag all untagged assets for <strong>{row.ownerName}</strong> using OpenAI Vision.
                                Each image will be analysed and tagged based on your Tag Library.
                                InstalliQ project photos are excluded — their tags come from the dashboard tagging workflow.
                                This may take a few minutes depending on the number of assets.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => startTaggingForOwner(row.ownerId, row.ownerName)}
                                data-testid={`button-confirm-tag-assets-${row.ownerId}`}
                              >
                                Start Tagging
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      {isAdmin && (
                        <Switch
                          checked={row.enabled}
                          onCheckedChange={(enabled) =>
                            toggleMutation.mutate({ ownerId: row.ownerId, enabled })
                          }
                          disabled={toggleMutation.isPending}
                          data-testid={`switch-access-${row.ownerId}`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Progress bar — shown while tagging is in progress and total is known */}
                  {isTagging && tagState && tagState.total > 0 && (
                    <div className="space-y-1" data-testid={`progress-bar-${row.ownerId}`}>
                      <Progress
                        value={Math.round((tagState.done / tagState.total) * 100)}
                        className="h-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{Math.round((tagState.done / tagState.total) * 100)}% complete</span>
                        {tagState.failed > 0 && (
                          <span className="text-destructive">{tagState.failed} failed</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Completed progress bar — stays visible briefly after done */}
                  {tagDone && tagState && !tagState.error && tagState.total > 0 && (
                    <div className="space-y-1" data-testid={`progress-bar-done-${row.ownerId}`}>
                      <Progress
                        value={tagState.stopped
                          ? Math.round((tagState.done / tagState.total) * 100)
                          : 100}
                        className={`h-2 ${tagState.stopped ? "[&>div]:bg-orange-400" : "[&>div]:bg-green-500"}`}
                      />
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {tagState.stopped
                            ? `Stopped at ${Math.round((tagState.done / tagState.total) * 100)}%`
                            : "100% complete"}
                        </span>
                        {(tagState.failed ?? 0) > 0 && (
                          <span className="text-destructive">{tagState.failed} failed</span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
