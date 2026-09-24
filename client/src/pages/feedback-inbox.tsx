import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  MessageSquarePlus, Bug, Lightbulb, Loader2, ExternalLink,
  Download, CheckCircle2, XCircle, Search, X, User, Globe, Calendar, Tag,
} from "lucide-react";
// ExternalLink + Download kept for the Sheets/CSV export buttons in the page header
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { usePageHeader } from "@/lib/page-header";
import { useLocation } from "wouter";

type FeedbackItemRow = {
  id: number;
  feedbackType: string;
  status: string;
  notes: string | null;
  pageUrl: string;
  pageTitle: string | null;
  screenshotUrl: string | null;
  createdAt: string;
  userName?: string;
  userEmail?: string;
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "accepted", label: "Accepted" },
  { key: "ignored", label: "Ignored" },
] as const;

function StatusBadge({ status }: { status: string }) {
  if (status === "new")
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">New</span>;
  if (status === "accepted")
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">Accepted</span>;
  if (status === "ignored")
    return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">Ignored</span>;
  return null;
}

function TypeBadge({ type }: { type: string }) {
  if (type === "bug")
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
        <Bug className="h-3 w-3" /> Bug Report
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
      <Lightbulb className="h-3 w-3" /> Enhancement
    </span>
  );
}

function FeedbackDetailDialog({
  item,
  updatingId,
  onClose,
  onUpdateStatus,
}: {
  item: FeedbackItemRow | null;
  updatingId: number | null;
  onClose: () => void;
  onUpdateStatus: (id: number, status: "accepted" | "ignored") => Promise<void>;
}) {
  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
        data-testid="dialog-feedback-detail"
      >
        <DialogHeader className="px-5 py-4 border-b border-border flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <TypeBadge type={item.feedbackType} />
            <StatusBadge status={item.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">
            {/* Notes */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Notes</p>
              {item.notes ? (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap" data-testid="text-detail-notes">
                  {item.notes}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No notes provided.</p>
              )}
            </div>

            {/* Metadata grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
              {(item.userName || item.userEmail) && (
                <div className="flex items-start gap-2">
                  <User className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Submitted by</p>
                    {item.userName && <p className="text-sm font-medium" data-testid="text-detail-username">{item.userName}</p>}
                    {item.userEmail && <p className="text-xs text-muted-foreground" data-testid="text-detail-useremail">{item.userEmail}</p>}
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Submitted</p>
                  <p className="text-sm" data-testid="text-detail-date">
                    {item.createdAt ? format(new Date(item.createdAt), "MMM d, yyyy 'at' h:mm a") : "—"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2 sm:col-span-2">
                <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Page</p>
                  <p className="text-sm font-mono truncate" data-testid="text-detail-pageurl">{item.pageUrl}</p>
                  {item.pageTitle && <p className="text-xs text-muted-foreground truncate">{item.pageTitle}</p>}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <Tag className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Status</p>
                  <div className="mt-0.5"><StatusBadge status={item.status} /></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="px-5 py-4 border-t border-border flex-shrink-0 flex items-center justify-end gap-3 bg-muted/10">
          <div className="flex items-center gap-2">
            {item.status === "new" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  data-testid="button-detail-ignore"
                  disabled={updatingId === item.id}
                  onClick={() => onUpdateStatus(item.id, "ignored")}
                  className="text-muted-foreground"
                >
                  {updatingId === item.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 mr-1.5" />}
                  Ignore
                </Button>
                <Button
                  size="sm"
                  data-testid="button-detail-accept"
                  disabled={updatingId === item.id}
                  onClick={() => onUpdateStatus(item.id, "accepted")}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  {updatingId === item.id ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                  Accept
                </Button>
              </>
            )}
            {item.status !== "new" && (
              <Button size="sm" variant="outline" onClick={onClose} data-testid="button-detail-close">
                Close
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FeedbackInboxPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, setLocation] = useLocation();
  const { setHeaderInfo } = usePageHeader();

  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "accepted" | "ignored">("all");
  const [userSearch, setUserSearch] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedItem, setSelectedItem] = useState<FeedbackItemRow | null>(null);

  useEffect(() => {
    setHeaderInfo({
      title: "Feedback Inbox",
      description: "Review and act on bug reports and enhancement suggestions",
      icon: <MessageSquarePlus className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
      actions: (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            data-testid="button-export-feedback-sheets"
            onClick={handleExportSheets}
          >
            <ExternalLink className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Export to Sheets</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-testid="button-export-feedback-csv"
            onClick={() => window.open("/api/feedback/export-csv", "_blank")}
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      ),
    });
    return () => setHeaderInfo(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHeaderInfo]);

  if (user?.role !== "super_admin") {
    setLocation("/dashboard");
    return null;
  }

  const { data: items = [], isLoading } = useQuery<FeedbackItemRow[]>({
    queryKey: ["/api/feedback", statusFilter],
    queryFn: async () => {
      const res = await fetch(`/api/feedback${statusFilter !== "all" ? `?status=${statusFilter}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load feedback");
      return res.json();
    },
  });

  const filteredItems = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item =>
      (item.userName?.toLowerCase().includes(q)) ||
      (item.userEmail?.toLowerCase().includes(q))
    );
  }, [items, userSearch]);

  async function handleExportSheets() {
    try {
      const res = await fetch("/api/feedback/export-sheets", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "NO_GOOGLE_TOKEN") {
          toast({ title: "Google not connected", description: "Connect Google Drive in Asset Manager → Setup tab first.", variant: "destructive" });
        } else if (data.code === "NO_GOOGLE_CONFIG") {
          toast({ title: "Google OAuth not configured", description: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.", variant: "destructive" });
        } else {
          toast({ title: "Export failed", description: data.error || "Unknown error", variant: "destructive" });
        }
        return;
      }
      toast({ title: "Google Sheet created", description: "Opening your spreadsheet…" });
      window.open(data.url, "_blank");
    } catch {
      toast({ title: "Export failed", description: "Could not connect to the server.", variant: "destructive" });
    }
  }

  async function handleUpdateStatus(id: number, status: "accepted" | "ignored") {
    setUpdatingId(id);
    try {
      await apiRequest("PATCH", `/api/feedback/${id}`, { status });
      qc.invalidateQueries({ queryKey: ["/api/feedback"] });
      // Update the selected item's status in place so the dialog reflects the change
      setSelectedItem(prev => prev && prev.id === id ? { ...prev, status } : prev);
    } catch {
      toast({ title: "Failed to update", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Detail dialog */}
      <FeedbackDetailDialog
        item={selectedItem}
        updatingId={updatingId}
        onClose={() => setSelectedItem(null)}
        onUpdateStatus={handleUpdateStatus}
      />

      {/* Toolbar */}
      <div className="px-4 sm:px-6 py-3 border-b border-border bg-background flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              data-testid={`button-feedback-filter-${f.key}`}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${statusFilter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Filter by user name or email…"
            data-testid="input-feedback-user-filter"
            className="pl-8 pr-8 h-8 text-xs"
          />
          {userSearch && (
            <button
              onClick={() => setUserSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              data-testid="button-clear-user-filter"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <span className="text-xs text-muted-foreground ml-auto">
          {isLoading ? "Loading…" : `${filteredItems.length} item${filteredItems.length !== 1 ? "s" : ""}`}
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageSquarePlus className="h-10 w-10 mb-3 opacity-40" />
            <p className="text-sm">{userSearch ? "No feedback matches that user." : "No feedback found."}</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-4xl">
            {filteredItems.map(item => (
              <div
                key={item.id}
                data-testid={`card-feedback-${item.id}`}
                onClick={() => setSelectedItem(item)}
                className="border border-border rounded-xl bg-card overflow-hidden cursor-pointer hover:border-primary/40 hover:shadow-sm transition-all"
              >
                <div className="flex gap-0">
                  <div className="flex-shrink-0 w-10 flex items-center justify-center border-r border-border bg-muted/30">
                    {item.feedbackType === "bug"
                      ? <Bug className="h-4 w-4 text-destructive/50" />
                      : <Lightbulb className="h-4 w-4 text-primary/50" />}
                  </div>

                  <div className="flex-1 min-w-0 p-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      {item.feedbackType === "bug" ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-destructive/10 text-destructive">
                          <Bug className="h-3 w-3" />Bug
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                          <Lightbulb className="h-3 w-3" />Enhancement
                        </span>
                      )}
                      <StatusBadge status={item.status} />
                      <span className="text-xs text-muted-foreground ml-auto">
                        {item.createdAt ? format(new Date(item.createdAt), "MMM d, yyyy h:mm a") : ""}
                      </span>
                    </div>

                    {item.notes && (
                      <p className="text-sm text-foreground mb-1.5 line-clamp-2">{item.notes}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {(item.userName || item.userEmail) && (
                        <span className="font-medium text-foreground/70">
                          {item.userName}{item.userEmail ? ` (${item.userEmail})` : ""}
                        </span>
                      )}
                      <span className="font-mono truncate max-w-[180px]">{item.pageUrl}</span>
                    </div>
                  </div>

                  {item.status === "new" && (
                    <div className="flex flex-col justify-center gap-1.5 px-2 border-l border-border bg-muted/20">
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`button-accept-feedback-${item.id}`}
                        disabled={updatingId === item.id}
                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(item.id, "accepted"); }}
                        className="h-8 text-xs text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20"
                      >
                        {updatingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        data-testid={`button-ignore-feedback-${item.id}`}
                        disabled={updatingId === item.id}
                        onClick={(e) => { e.stopPropagation(); handleUpdateStatus(item.id, "ignored"); }}
                        className="h-8 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {updatingId === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3 mr-1" />}
                        Ignore
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
