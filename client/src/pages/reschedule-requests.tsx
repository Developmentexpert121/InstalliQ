import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { splitContactPhone } from "@/lib/utils";
import {
  Bell, Calendar, Clock, MapPin, User, Mail, Phone, MessageSquare,
  Loader2, ChevronRight, ChevronLeft, CalendarClock, CalendarRange,
  Archive, ArchiveRestore, Trash2, X, Inbox, CheckCheck
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { usePageHeader } from "@/lib/page-header";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface RescheduleRequestWithEvent {
  id: number;
  calendarEventId: number;
  confirmationToken: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  reason: string;
  status: string;
  archivedAt: string | null;
  createdAt: string;
  calendarEvent: {
    id: number;
    title: string;
    date: string;
    startTime: string | null;
    endTime: string | null;
    address: string | null;
    workJobNumber: string | null;
    status: string | null;
  } | null;
}

export default function NotificationsPage() {
  const { setHeaderInfo } = usePageHeader();
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedRequest, setSelectedRequest] = useState<RescheduleRequestWithEvent | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showBulkArchiveConfirm, setShowBulkArchiveConfirm] = useState(false);
  const [showBulkRestoreConfirm, setShowBulkRestoreConfirm] = useState(false);
  const [showBulkPermanentDeleteConfirm, setShowBulkPermanentDeleteConfirm] = useState(false);
  const [showSinglePermanentDeleteConfirm, setShowSinglePermanentDeleteConfirm] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const ITEMS_PER_PAGE = 10;
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const { data: requests = [], isLoading } = useQuery<RescheduleRequestWithEvent[]>({
    queryKey: ["/api/reschedule-requests"],
    enabled: isAdmin,
  });

  const { data: archivedRequests = [], isLoading: isLoadingArchived } = useQuery<RescheduleRequestWithEvent[]>({
    queryKey: ["/api/reschedule-requests", "archived"],
    queryFn: async () => {
      const res = await fetch("/api/reschedule-requests?archived=only", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch archived requests");
      return res.json();
    },
    enabled: isAdmin && activeTab === "archived",
  });

  const totalPending = requests.filter(r => r.status === "pending").length;

  useEffect(() => {
    setHeaderInfo({
      title: "Notifications",
      description: "Reschedule requests and alerts",
      icon: <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
      actions: (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "archived")} data-testid="tabs-notifications">
          <TabsList className="h-9">
            <TabsTrigger value="active" className="px-3 sm:px-4 text-xs sm:text-sm gap-1.5" data-testid="tab-active">
              Active
              {totalPending > 0 && (
                <Badge variant="destructive" className="h-5 min-w-5 px-1.5 text-[10px] font-bold rounded-full">
                  {totalPending}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="archived" className="px-3 sm:px-4 text-xs sm:text-sm gap-1.5" data-testid="tab-archived">
              <Archive className="h-3.5 w-3.5" />
              Archived
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ),
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo, activeTab, totalPending]);

  useEffect(() => {
    setSelectedIds(new Set());
    setCurrentPage(1);
  }, [activeTab]);

  const markReviewedMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/reschedule-requests/${id}`, { status: "reviewed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reschedule-requests"] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reschedule-requests"] });
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/reschedule-requests/archive", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reschedule-requests"] });
      setSelectedIds(new Set());
      toast({ title: "Archived successfully" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/reschedule-requests/restore", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reschedule-requests"] });
      setSelectedIds(new Set());
      toast({ title: "Restored successfully" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/reschedule-requests/permanent-delete", { ids });
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/reschedule-requests"] });
      setSelectedIds(new Set());
      toast({
        title: ids.length === 1 ? "Request permanently deleted" : `${ids.length} requests permanently deleted`,
        description: "This action cannot be undone.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to permanently delete",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleOpenRequest = (request: RescheduleRequestWithEvent) => {
    setSelectedRequest(request);
    if (request.status === "pending") {
      markReviewedMutation.mutate(request.id);
      setSelectedRequest({ ...request, status: "reviewed" });
    }
  };

  const handleArchiveSingle = () => {
    if (selectedRequest) {
      archiveMutation.mutate([selectedRequest.id]);
      setSelectedRequest(null);
    }
    setShowArchiveConfirm(false);
  };

  const handleBulkArchive = () => {
    archiveMutation.mutate(Array.from(selectedIds));
    setShowBulkArchiveConfirm(false);
  };

  const handleBulkRestore = () => {
    restoreMutation.mutate(Array.from(selectedIds));
    setShowBulkRestoreConfirm(false);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        weekday: "short", year: "numeric", month: "short", day: "numeric",
      });
    } catch { return dateStr; }
  };

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit",
      });
    } catch { return dateStr; }
  };

  const timeAgo = (dateStr: string) => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const minutes = Math.floor(diff / 60000);
      if (minutes < 1) return "Just now";
      if (minutes < 60) return `${minutes}m ago`;
      const hours = Math.floor(minutes / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      if (days < 7) return `${days}d ago`;
      return formatDate(dateStr);
    } catch { return dateStr; }
  };

  const currentData = activeTab === "active" ? requests : archivedRequests;
  const currentLoading = activeTab === "active" ? isLoading : isLoadingArchived;

  const allSorted = [...currentData].sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") return -1;
    if (a.status !== "pending" && b.status === "pending") return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
  const totalPages = Math.ceil(allSorted.length / ITEMS_PER_PAGE);
  const paginatedRequests = allSorted.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  const pendingRequests = activeTab === "active" ? paginatedRequests.filter(r => r.status === "pending") : [];
  const reviewedRequests = activeTab === "active" ? paginatedRequests.filter(r => r.status !== "pending") : paginatedRequests;
  const totalReviewed = activeTab === "active" ? requests.filter(r => r.status !== "pending").length : archivedRequests.length;

  const allVisibleIds = paginatedRequests.map(r => r.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card className="max-w-sm w-full">
          <CardContent className="flex flex-col items-center justify-center py-16 px-6">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold">Access Restricted</h3>
            <p className="text-muted-foreground text-sm text-center mt-2">
              Notifications are only available to administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 sm:px-6 py-2 bg-primary/5 border-b border-border">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-1.5 ml-auto">
            {activeTab === "active" ? (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setShowBulkArchiveConfirm(true)}
                disabled={archiveMutation.isPending}
                data-testid="button-bulk-archive"
              >
                <Archive className="h-3 w-3 mr-1" />
                Archive
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowBulkRestoreConfirm(true)}
                  disabled={restoreMutation.isPending}
                  data-testid="button-bulk-restore"
                >
                  <ArchiveRestore className="h-3 w-3 mr-1" />
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setShowBulkPermanentDeleteConfirm(true)}
                  disabled={permanentDeleteMutation.isPending}
                  data-testid="button-bulk-permanent-delete"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete Permanently
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setSelectedIds(new Set())}
              data-testid="button-clear-selection"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {currentLoading ? (
          <div className="flex flex-col items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Loading notifications...</p>
          </div>
        ) : currentData.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-6">
            <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mb-5">
              {activeTab === "active" ? (
                <Inbox className="h-10 w-10 text-muted-foreground/50" />
              ) : (
                <Archive className="h-10 w-10 text-muted-foreground/50" />
              )}
            </div>
            <h3 className="text-lg font-semibold" data-testid={activeTab === "active" ? "text-no-notifications" : "text-no-archived"}>
              {activeTab === "active" ? "All caught up!" : "No archived notifications"}
            </h3>
            <p className="text-muted-foreground text-sm text-center mt-2 max-w-sm">
              {activeTab === "active"
                ? "When customers request to reschedule a booking, notifications will appear here."
                : "Archived notifications will appear here."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {pendingRequests.length > 0 && (
              <>
                <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5 bg-destructive/[0.04]">
                  <span className="w-2 h-2 rounded-full bg-destructive animate-pulse flex-shrink-0" />
                  <span className="text-xs font-semibold text-destructive uppercase tracking-wider" data-testid="text-new-heading">
                    New ({totalPending})
                  </span>
                  {paginatedRequests.length > 0 && (
                    <div className="ml-auto">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 rounded-full ${allSelected ? "text-primary" : "text-muted-foreground"}`}
                            onClick={toggleSelectAll}
                            data-testid="checkbox-select-all"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{allSelected ? "Deselect all" : "Select all"}</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
                {pendingRequests.map((request) => {
                  const overallIndex = paginatedRequests.indexOf(request);
                  return (
                    <NotificationRow
                      key={request.id}
                      request={request}
                      serialNo={((currentPage - 1) * ITEMS_PER_PAGE) + overallIndex + 1}
                      timeAgo={timeAgo}
                      onClick={() => handleOpenRequest(request)}
                      selected={selectedIds.has(request.id)}
                      onToggleSelect={() => toggleSelect(request.id)}
                    />
                  );
                })}
              </>
            )}

            {reviewedRequests.length > 0 && (
              <>
                <div className="flex items-center gap-3 px-4 sm:px-6 py-2.5 bg-muted/30">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider" data-testid="text-reviewed-heading">
                    {activeTab === "active" ? `Reviewed (${totalReviewed})` : `Archived (${totalReviewed})`}
                  </span>
                  {pendingRequests.length === 0 && paginatedRequests.length > 0 && (
                    <div className="ml-auto">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-7 w-7 rounded-full ${allSelected ? "text-primary" : "text-muted-foreground"}`}
                            onClick={toggleSelectAll}
                            data-testid="checkbox-select-all"
                          >
                            <CheckCheck className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{allSelected ? "Deselect all" : "Select all"}</TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
                {reviewedRequests.map((request) => {
                  const overallIndex = paginatedRequests.indexOf(request);
                  return (
                    <NotificationRow
                      key={request.id}
                      request={request}
                      serialNo={((currentPage - 1) * ITEMS_PER_PAGE) + overallIndex + 1}
                      timeAgo={timeAgo}
                      onClick={() => setSelectedRequest(request)}
                      selected={selectedIds.has(request.id)}
                      onToggleSelect={() => toggleSelect(request.id)}
                      isArchived={activeTab === "archived"}
                    />
                  );
                })}
              </>
            )}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border bg-muted/20">
            <p className="text-xs text-muted-foreground" data-testid="text-pagination-info">
              {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, allSorted.length)} of {allSorted.length}
            </p>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "ghost"}
                  size="sm"
                  className="h-8 w-8 p-0 text-xs"
                  onClick={() => setCurrentPage(page)}
                  data-testid={`button-page-${page}`}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={!!selectedRequest} onOpenChange={(open) => !open && setSelectedRequest(null)}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pr-8">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <CalendarClock className="h-4 w-4 text-primary" />
              </div>
              Reschedule Request
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && !(selectedRequest.archivedAt || (selectedRequest as any).archived_at) && (
            <div className="flex justify-end -mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowArchiveConfirm(true)}
                className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10 h-8 text-xs gap-1"
                data-testid="button-archive-single"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}
          {selectedRequest && (selectedRequest.archivedAt || (selectedRequest as any).archived_at) && (
            <div className="flex justify-end gap-2 -mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (selectedRequest) {
                    restoreMutation.mutate([selectedRequest.id]);
                    setSelectedRequest(null);
                  }
                }}
                className="text-primary hover:text-primary border-primary/30 hover:bg-primary/10 h-8 text-xs gap-1"
                data-testid="button-restore-single"
              >
                <ArchiveRestore className="h-3.5 w-3.5" />
                Restore
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowSinglePermanentDeleteConfirm(true)}
                disabled={permanentDeleteMutation.isPending}
                className="h-8 text-xs gap-1"
                data-testid="button-permanent-delete-single"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Permanently
              </Button>
            </div>
          )}

          {selectedRequest && (() => {
            const r = selectedRequest;
            const ra = r as any;
            const evt = r.calendarEvent;
            const evtA = evt as any;
            const custName = r.customerName || ra.customer_name || "Unknown";
            const custEmail = r.customerEmail || ra.customer_email;
            const custPhone = r.customerPhone || ra.customer_phone;
            const reason = r.reason || ra.reason || "";
            const createdAt = r.createdAt || ra.created_at;
            const evtTitle = evt?.title || evtA?.title || "Unknown Event";
            const evtJobNumber = evt?.workJobNumber || evtA?.work_job_number;
            const evtDate = evt?.date || evtA?.date;
            const evtStartTime = evt?.startTime || evtA?.start_time;
            const evtEndTime = evt?.endTime || evtA?.end_time;
            const evtAddress = evt?.address || evtA?.address;
            const evtId = r.calendarEventId || ra.calendar_event_id;
            const isArchived = r.archivedAt || ra.archived_at;

            return (
            <div className="space-y-4 sm:space-y-5 pt-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm sm:text-base leading-tight" data-testid="detail-event-title">
                    {evtTitle}
                  </h3>
                  {evtJobNumber && (
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid="detail-job-number">
                      Job #{evtJobNumber}
                    </p>
                  )}
                </div>
                <Badge
                  variant={r.status === "pending" ? "destructive" : "secondary"}
                  className="flex-shrink-0"
                  data-testid="detail-status"
                >
                  {r.status === "pending" ? "Pending" : "Reviewed"}
                </Badge>
              </div>

              {evt && (
                <div className="rounded-xl border border-border bg-muted/30 p-3 sm:p-4 space-y-2.5 sm:space-y-3">
                  <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Original Booking</p>
                  <div className="space-y-2.5">
                    {evtDate && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-background flex items-center justify-center flex-shrink-0 border border-border">
                          <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                        </div>
                        <span className="text-xs sm:text-sm" data-testid="detail-event-date">{formatDate(evtDate)}</span>
                      </div>
                    )}
                    {evtStartTime && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-background flex items-center justify-center flex-shrink-0 border border-border">
                          <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                        </div>
                        <span className="text-xs sm:text-sm" data-testid="detail-event-time">
                          {formatTime(evtStartTime)}
                          {evtEndTime && ` – ${formatTime(evtEndTime)}`}
                        </span>
                      </div>
                    )}
                    {evtAddress && (
                      <div className="flex items-center gap-2.5 text-sm">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-background flex items-center justify-center flex-shrink-0 border border-border">
                          <MapPin className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                        </div>
                        <span className="break-words text-xs sm:text-sm" data-testid="detail-event-address">{evtAddress}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2.5 sm:space-y-3">
                <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2.5 text-sm">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                    </div>
                    <span className="font-medium text-xs sm:text-sm" data-testid="detail-customer-name">{custName}</span>
                  </div>
                  {custEmail && (
                    <div className="flex items-center gap-2.5 text-sm">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                      </div>
                      <a href={`mailto:${custEmail}`} className="text-primary hover:underline text-xs sm:text-sm break-all" data-testid="detail-customer-email">
                        {custEmail}
                      </a>
                    </div>
                  )}
                  {custPhone && (() => {
                    const { display, tel } = splitContactPhone(custPhone);
                    return (
                      <div className="flex items-center gap-2.5 text-sm">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-muted-foreground" />
                        </div>
                        <a href={`tel:${tel}`} className="text-primary hover:underline text-xs sm:text-sm" data-testid="detail-customer-phone">
                          {display}
                        </a>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="space-y-2.5 sm:space-y-3">
                <p className="text-[11px] sm:text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reason</p>
                <div className="rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
                  <div className="flex items-start gap-2 sm:gap-2.5 text-sm">
                    <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 text-muted-foreground mt-0.5" />
                    <p className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm" data-testid="detail-reason">{reason}</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-3">
                {createdAt && (
                  <p className="text-[11px] sm:text-xs text-muted-foreground" data-testid="detail-requested-at">
                    Requested {formatDate(createdAt)} at {formatTime(createdAt)}
                  </p>
                )}
                {!isArchived && evtId && (
                  <Button
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setSelectedRequest(null);
                      navigate(`/calendar?openEvent=${evtId}&edit=true`);
                    }}
                    data-testid="button-reschedule-meeting"
                  >
                    <CalendarRange className="h-4 w-4 mr-2" />
                    Reschedule Meeting
                  </Button>
                )}
              </div>
            </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showArchiveConfirm}
        onOpenChange={setShowArchiveConfirm}
        onConfirm={handleArchiveSingle}
        title="Archive Notification?"
        description="This notification will be moved to the archive. You can restore it later."
        confirmLabel="Archive"
      />

      <ConfirmDialog
        open={showBulkArchiveConfirm}
        onOpenChange={setShowBulkArchiveConfirm}
        onConfirm={handleBulkArchive}
        title="Archive Selected?"
        description={`Archive ${selectedIds.size} selected notification${selectedIds.size > 1 ? "s" : ""}?`}
        confirmLabel="Archive All"
      />

      <ConfirmDialog
        open={showBulkRestoreConfirm}
        onOpenChange={setShowBulkRestoreConfirm}
        onConfirm={handleBulkRestore}
        title="Restore Selected?"
        description={`Restore ${selectedIds.size} selected notification${selectedIds.size > 1 ? "s" : ""}?`}
        confirmLabel="Restore All"
      />

      <ConfirmDialog
        open={showBulkPermanentDeleteConfirm}
        onOpenChange={setShowBulkPermanentDeleteConfirm}
        onConfirm={() => {
          permanentDeleteMutation.mutate(Array.from(selectedIds));
          setShowBulkPermanentDeleteConfirm(false);
        }}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "request" : "requests"} permanently?`}
        description="The selected archived notifications will be removed from the database forever. This cannot be undone."
        confirmLabel="Delete Permanently"
        variant="destructive"
      />

      <ConfirmDialog
        open={showSinglePermanentDeleteConfirm}
        onOpenChange={setShowSinglePermanentDeleteConfirm}
        onConfirm={() => {
          if (selectedRequest) {
            permanentDeleteMutation.mutate([selectedRequest.id]);
            setSelectedRequest(null);
          }
          setShowSinglePermanentDeleteConfirm(false);
        }}
        title="Delete request permanently?"
        description="This archived notification will be removed from the database forever. This cannot be undone."
        confirmLabel="Delete Permanently"
        variant="destructive"
      />
    </div>
  );
}

function NotificationRow({
  request,
  serialNo,
  timeAgo,
  onClick,
  selected,
  onToggleSelect,
  isArchived,
}: {
  request: RescheduleRequestWithEvent;
  serialNo: number;
  timeAgo: (d: string) => string;
  onClick: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  isArchived?: boolean;
}) {
  const isPending = request.status === "pending" && !isArchived;
  const eventTitle = request.calendarEvent?.title || (request as any).calendarEvent?.title || "Unknown Event";
  const jobNumber = request.calendarEvent?.workJobNumber || (request as any).calendarEvent?.work_job_number;
  const eventDate = request.calendarEvent?.date || (request as any).calendarEvent?.date;
  const eventAddress = request.calendarEvent?.address || (request as any).calendarEvent?.address;

  return (
    <>
      <div
        className={`hidden sm:flex items-center gap-4 px-6 py-3.5 transition-colors cursor-pointer group ${
          isPending
            ? "bg-destructive/[0.03] hover:bg-destructive/[0.06]"
            : "hover:bg-muted/30"
        } ${selected ? "bg-primary/[0.04]" : ""}`}
        onClick={onClick}
        data-testid={`notification-row-${request.id}`}
      >
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelect}
          data-testid={`checkbox-notification-${request.id}`}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0 rounded-full"
        />

        <span className="flex-shrink-0 w-6 text-center text-sm text-muted-foreground font-medium" data-testid={`text-sno-${request.id}`}>
          {serialNo}
        </span>

        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
          isPending ? "bg-destructive/10" : isArchived ? "bg-muted/60" : "bg-muted"
        }`}>
          {isArchived ? (
            <Archive className="h-4 w-4 text-muted-foreground" />
          ) : (
            <CalendarClock className={`h-4 w-4 ${isPending ? "text-destructive" : "text-muted-foreground"}`} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium truncate ${isPending ? "text-foreground" : "text-muted-foreground"}`}>
              {request.customerName}
            </span>
            {isPending && (
              <Badge variant="destructive" className="h-[18px] text-[10px] px-1.5 font-semibold flex-shrink-0 rounded-full">
                NEW
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {eventTitle}
            {jobNumber && ` · Job #${jobNumber}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo(request.createdAt)}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>

      <div
        className={`sm:hidden px-3 py-3 transition-colors cursor-pointer ${
          isPending
            ? "bg-destructive/[0.03] active:bg-destructive/[0.08]"
            : "active:bg-muted/40"
        } ${selected ? "bg-primary/[0.06]" : ""}`}
        onClick={onClick}
        data-testid={`notification-row-mobile-${request.id}`}
      >
        <div className="flex items-start gap-2.5">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggleSelect}
            data-testid={`checkbox-notification-mobile-${request.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex-shrink-0 rounded-full mt-1"
          />

          <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5 ${
            isPending ? "bg-destructive/10" : isArchived ? "bg-muted/60" : "bg-muted"
          }`}>
            {isArchived ? (
              <Archive className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <CalendarClock className={`h-3.5 w-3.5 ${isPending ? "text-destructive" : "text-muted-foreground"}`} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`text-sm font-semibold truncate ${isPending ? "text-foreground" : "text-muted-foreground"}`}>
                  {request.customerName}
                </span>
                {isPending && (
                  <Badge variant="destructive" className="h-[16px] text-[9px] px-1 font-bold flex-shrink-0 rounded-full">
                    NEW
                  </Badge>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                {timeAgo(request.createdAt)}
              </span>
            </div>

            <p className="text-xs text-foreground/80 truncate mt-0.5 font-medium">
              {eventTitle}
            </p>

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              {jobNumber && (
                <span className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                  Job #{jobNumber}
                </span>
              )}
              {eventDate && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {(() => {
                    try { return new Date(eventDate).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
                    catch { return eventDate; }
                  })()}
                </span>
              )}
              {eventAddress && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate max-w-[140px]">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{eventAddress}</span>
                </span>
              )}
            </div>
          </div>

          <ChevronRight className="h-4 w-4 text-muted-foreground/30 flex-shrink-0 mt-1" />
        </div>
      </div>
    </>
  );
}
