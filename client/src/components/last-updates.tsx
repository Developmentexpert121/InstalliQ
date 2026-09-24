import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Clock, History, User as UserIcon, Loader2 } from "lucide-react";
import { useState } from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type LastUpdatesProps = {
  resourceType: "calendar_event" | "project";
  resourceId: number;
  title?: string;
  defaultOpen?: boolean;
  className?: string;
};

type ActivityChange = {
  field: string;
  before: any;
  after: any;
};

type ActivityEntry = {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  action: string;
  category: string;
  description: string | null;
  resourceId: string | null;
  resourceType: string | null;
  metadata: any;
  createdAt: string;
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Notes",
  date: "Date",
  startTime: "Start time",
  endTime: "End time",
  status: "Status",
  projectId: "Linked project",
  address: "Address",
  hasIssue: "Has issue",
  issueDescription: "Issue notes",
  customerName: "Customer name",
  customerPhone: "Customer phone",
  customerEmail: "Customer email",
  secondaryPocName: "Secondary contact name",
  secondaryPocPhone: "Secondary contact phone",
  secondaryPocEmail: "Secondary contact email",
};

const DATE_FIELDS = new Set(["date", "startTime", "endTime"]);

const ACTION_LABELS: Record<string, string> = {
  CREATE_BOOKING: "Created booking",
  UPDATE_BOOKING: "Updated booking",
  COMPLETE_BOOKING: "Completed booking",
  DELETE_BOOKING: "Deleted booking",
  RESCHEDULE_BOOKING: "Rescheduled booking",
  REPORT_BOOKING_ISSUE: "Reported booking issue",
  CANCEL_BOOKING: "Cancelled booking",
  ASSIGN_USERS: "Updated assignments",
  SEND_BOOKING_NOTIFICATION: "Sent booking notification",
  ESCALATE_BOOKING: "Escalated booking",
  EXPORT_BOOKINGS: "Exported bookings",
};

function endpointFor(resourceType: LastUpdatesProps["resourceType"], resourceId: number) {
  if (resourceType === "calendar_event") {
    return `/api/calendar-events/${resourceId}/activity`;
  }
  return `/api/projects/${resourceId}/activity`;
}

function formatActionLabel(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return action
    .toLowerCase()
    .split("_")
    .map((p) => (p ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}

function actionToneClass(action: string): string {
  if (action === "COMPLETE_BOOKING") return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-800";
  if (action.startsWith("DELETE")) return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800";
  if (action.startsWith("CREATE")) return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800";
  if (action === "REPORT_BOOKING_ISSUE" || action === "ESCALATE_BOOKING") return "bg-amber-100 text-amber-900 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800";
  return "bg-muted text-foreground border-border";
}

function userInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = (name || email || "?").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatChangeValue(field: string, value: any): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (DATE_FIELDS.has(field)) {
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        if (field === "date") return format(d, "PPP");
        return format(d, "PPp");
      }
    } catch {
      /* fall through */
    }
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function safeFormatDate(raw: string): { absolute: string; relative: string } {
  try {
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      return {
        absolute: format(d, "PPp"),
        relative: formatDistanceToNow(d, { addSuffix: true }),
      };
    }
  } catch {
    /* ignore */
  }
  return { absolute: raw, relative: "" };
}

function ChangeList({ changes }: { changes: ActivityChange[] }) {
  if (!changes || changes.length === 0) return null;
  return (
    <ul className="mt-2 space-y-1 text-xs" data-testid="list-update-changes">
      {changes.map((c, idx) => (
        <li
          key={`${c.field}-${idx}`}
          className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5"
          data-testid={`change-${c.field}`}
        >
          <span className="font-medium text-foreground">
            {FIELD_LABELS[c.field] || c.field}:
          </span>
          <span className="text-muted-foreground line-through">
            {formatChangeValue(c.field, c.before)}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="text-foreground font-medium">
            {formatChangeValue(c.field, c.after)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function LastUpdates({
  resourceType,
  resourceId,
  title = "Last Updates",
  defaultOpen = false,
  className,
}: LastUpdatesProps) {
  const [open, setOpen] = useState(defaultOpen);
  const url = endpointFor(resourceType, resourceId);
  const { data, isLoading, error } = useQuery<ActivityEntry[]>({
    queryKey: [url],
    enabled: open && Number.isFinite(resourceId) && resourceId > 0,
    // Update history can change after edits in the same session — keep the
    // panel fresh on every open rather than relying on the global Infinity
    // staleTime default.
    staleTime: 0,
    refetchOnMount: "always",
  });

  const entries = data || [];

  return (
    <div
      className={cn("rounded-md border bg-card", className)}
      data-testid={`section-last-updates-${resourceType}-${resourceId}`}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium hover-elevate active-elevate-2"
            data-testid={`button-toggle-last-updates-${resourceType}-${resourceId}`}
          >
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-left">{title}</span>
            {data && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {data.length}
              </Badge>
            )}
            {open ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t">
            {isLoading && (
              <div
                className="flex items-center justify-center py-6 text-sm text-muted-foreground"
                data-testid="status-last-updates-loading"
              >
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading history...
              </div>
            )}
            {error && !isLoading && (
              <div
                className="px-3 py-4 text-sm text-destructive"
                data-testid="status-last-updates-error"
              >
                Could not load update history.
              </div>
            )}
            {!isLoading && !error && entries.length === 0 && (
              <div
                className="px-3 py-4 text-sm text-muted-foreground"
                data-testid="status-last-updates-empty"
              >
                No updates have been recorded yet.
              </div>
            )}
            {!isLoading && !error && entries.length > 0 && (
              // Render entries in the natural flow of the parent dialog/page.
              // A previous nested ScrollArea wrapper would trap wheel scrolling
              // once it filled (e.g. > ~2 entries), so users could never reach
              // the rest of the history. The parent dialog already scrolls.
              <ul className="divide-y">
                {entries.map((entry) => {
                    const dt = safeFormatDate(entry.createdAt);
                    const meta = entry.metadata || {};
                    const changes: ActivityChange[] = Array.isArray(meta.changes)
                      ? meta.changes
                      : [];
                    return (
                      <li
                        key={entry.id}
                        className="px-3 py-2.5"
                        data-testid={`update-entry-${entry.id}`}
                      >
                        <div className="flex items-start gap-2.5">
                          <Avatar className="h-7 w-7 mt-0.5">
                            <AvatarFallback className="text-[10px]">
                              {userInitials(entry.userName, entry.userEmail)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5">
                              <span
                                className="text-sm font-medium truncate"
                                data-testid={`text-update-user-${entry.id}`}
                              >
                                {entry.userName || entry.userEmail || "System"}
                              </span>
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px] px-1.5 py-0 border",
                                  actionToneClass(entry.action),
                                )}
                                data-testid={`badge-update-action-${entry.id}`}
                              >
                                {formatActionLabel(entry.action)}
                              </Badge>
                            </div>
                            {entry.description && (
                              <div
                                className="text-xs text-muted-foreground mt-0.5"
                                data-testid={`text-update-description-${entry.id}`}
                              >
                                {entry.description}
                              </div>
                            )}
                            <ChangeList changes={changes} />
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              <span title={dt.absolute} data-testid={`text-update-time-${entry.id}`}>
                                {dt.relative ? `${dt.relative} · ${dt.absolute}` : dt.absolute}
                              </span>
                            </div>
                          </div>
                        </div>
                      </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default LastUpdates;
