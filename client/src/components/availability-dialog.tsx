import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
} from "@/components/ui/alert-dialog";
import {
  CalendarOff,
  Plus,
  Trash2,
  Pencil,
  Loader2,
  X,
  Check,
  Clock,
  Users,
} from "lucide-react";
import { format } from "date-fns";
import { fromZonedTime, formatInTimeZone } from "date-fns-tz";

interface AvailabilityBlock {
  id: number;
  userId: number;
  createdBy: number;
  category: string;
  reason: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  displayName?: string | null;
  user?: { id: number; name: string | null; email: string; role?: string; jobTitle?: string | null };
}

function positionLabel(role?: string | null, jobTitle?: string | null): string {
  if (role === "super_admin") return "Super Admin";
  if (role === "admin") return "Admin (Owner)";
  if (role === "user" && jobTitle === "Install Manager") return "Install Manager";
  return "User";
}

const CATEGORIES = [
  { value: "holiday", label: "Holiday" },
  { value: "leave", label: "Leave" },
  { value: "meeting", label: "Meeting" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other" },
];

const CATEGORY_STYLES: Record<string, string> = {
  holiday: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  leave: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200",
  meeting: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  personal: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200",
};

// Left accent bar color per category — reinforces the category at a glance.
const CATEGORY_ACCENT: Record<string, string> = {
  holiday: "bg-amber-400",
  leave: "bg-rose-400",
  meeting: "bg-sky-400",
  personal: "bg-violet-400",
  other: "bg-slate-400",
};

function initials(name?: string | null, email?: string | null): string {
  const src = (name || email || "").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

interface AvailabilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  assignableUsers?: { id: number; name: string }[];
}

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

// Half-day time off can only fall within office hours (6:00 AM – 8:00 PM).
const OFFICE_OPEN_MIN = 6 * 60;
const OFFICE_CLOSE_MIN = 20 * 60;
const OFFICE_OPEN_STR = "06:00";
const OFFICE_CLOSE_STR = "20:00";
const minOfDay = (hhmm: string) => {
  const [h, m] = (hhmm || "00:00").split(":").map((n) => parseInt(n, 10));
  return (h || 0) * 60 + (m || 0);
};

// The whole calendar treats Central as the business timezone, so half-day
// times the user types are interpreted as Central wall-clock time. This keeps
// client checks, what the user sees on the calendar, and the server's
// office-hours validation (also Central) perfectly aligned.
const BUSINESS_TIMEZONE = "America/Chicago";
const fromBusinessTz = (dateStr: string, timeStr: string) =>
  fromZonedTime(new Date(`${dateStr}T${timeStr}:00`), BUSINESS_TIMEZONE);
const businessToday = () =>
  formatInTimeZone(new Date(), BUSINESS_TIMEZONE, "yyyy-MM-dd");

function defaultForm() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    category: "leave",
    reason: "",
    allDay: true,
    startAt: toLocalInput(start),
    endAt: toLocalInput(end),
    displayName: "",
  };
}

export function AvailabilityDialog({
  open,
  onOpenChange,
  isAdmin,
  assignableUsers,
}: AvailabilityDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  // "self" = current user; a number = a specific team member (admins only)
  const [selectedUser, setSelectedUser] = useState<string>("self");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState(defaultForm());
  // Inline display-name editing in the Team time off list (Install Manager only)
  const [editingNameId, setEditingNameId] = useState<number | null>(null);
  const [nameValue, setNameValue] = useState("");

  // Only an Install Manager may relabel the name shown on a team member's entry.
  const isInstallManager =
    user?.role === "user" && user?.jobTitle === "Install Manager";

  // Clear any pending delete confirmation when the dialog is closed so it can't
  // resurface orphaned the next time the dialog opens.
  useEffect(() => {
    if (!open) {
      setDeleteId(null);
      setSelectedUser("self");
      setShowForm(false);
      setEditingId(null);
    }
  }, [open]);

  const targetUserId =
    selectedUser === "self" ? user?.id : parseInt(selectedUser);

  // Admins and Install Managers can manage other team members' time off.
  const canManageOthers = isAdmin && (assignableUsers?.length ?? 0) > 0;
  const managingSelf = selectedUser === "self" || targetUserId === user?.id;
  const selectedUserName =
    selectedUser === "self"
      ? user?.name || user?.email || "My availability"
      : assignableUsers?.find((u) => String(u.id) === selectedUser)?.name ||
        "Team member";

  const { data: blocks, isLoading } = useQuery<AvailabilityBlock[]>({
    queryKey: ["/api/availability-blocks?userId=" + targetUserId],
    enabled: open && !!targetUserId,
  });

  // Team-wide blocks (backend scopes to the current user's team). Admins see
  // every team member; regular users see their admin & teammates. Read-only.
  const { data: teamBlocks } = useQuery<AvailabilityBlock[]>({
    queryKey: ["/api/availability-blocks"],
    enabled: open,
  });

  const invalidate = () => {
    // Match every availability-blocks query, including the calendar's key which
    // is a single URL string carrying from/to (and scope) params. Exact-key
    // invalidation wouldn't reach it, so the calendar wouldn't auto-refresh.
    queryClient.invalidateQueries({
      predicate: (q) => {
        const key = q.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/availability-blocks");
      },
    });
  };

  const resetForm = () => {
    setForm(defaultForm());
    setEditingId(null);
    setShowForm(false);
  };

  const buildPayload = () => {
    let startAt: Date;
    let endAt: Date;
    if (form.allDay) {
      // All-day blocks are pure calendar dates. Anchor both ends at noon UTC so
      // the stored instant maps to the intended day regardless of the viewer's
      // timezone (the calendar reads these in EST, the list reads them locally).
      // This also honors the chosen end date so multi-day blocks span correctly.
      const startDay = form.startAt.slice(0, 10);
      const endDay = (form.endAt || form.startAt).slice(0, 10);
      startAt = new Date(`${startDay}T12:00:00.000Z`);
      endAt = new Date(`${endDay}T12:00:00.000Z`);
      // A single-day all-day block has start === end; nudge the end so it stays
      // strictly after the start (the backend requires endAt > startAt).
      if (endAt <= startAt) {
        endAt = new Date(startAt.getTime() + 60 * 1000);
      }
    } else {
      // Half-day: interpret the typed date + times as Central wall-clock time.
      startAt = fromBusinessTz(form.startAt.slice(0, 10), form.startAt.slice(11, 16));
      endAt = fromBusinessTz(form.endAt.slice(0, 10), form.endAt.slice(11, 16));
    }
    return {
      category: form.category,
      reason: form.reason.trim(),
      allDay: form.allDay,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      ...(selectedUser !== "self" ? { userId: targetUserId } : {}),
      // Only an Install Manager may set/override the display label.
      ...(isInstallManager
        ? { displayName: form.displayName.trim() || null }
        : {}),
    };
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest(
        "POST",
        "/api/availability-blocks",
        buildPayload(),
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      resetForm();
      toast({ title: "Availability block added" });
    },
    onError: (e: any) => {
      toast({
        title: "Could not add block",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest(
        "PATCH",
        `/api/availability-blocks/${id}`,
        buildPayload(),
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      resetForm();
      toast({ title: "Availability updated" });
    },
    onError: (e: any) => {
      toast({
        title: "Could not update block",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/availability-blocks/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Availability block removed" });
    },
    onError: (e: any) => {
      toast({
        title: "Could not remove block",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateNameMutation = useMutation({
    mutationFn: async (vars: { id: number; displayName: string | null }) => {
      const res = await apiRequest(
        "PATCH",
        `/api/availability-blocks/${vars.id}`,
        { displayName: vars.displayName },
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setEditingNameId(null);
      setNameValue("");
      toast({ title: "Name updated" });
    },
    onError: (e: any) => {
      toast({
        title: "Could not update name",
        description: e?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const startNameEdit = (b: AvailabilityBlock) => {
    setEditingNameId(b.id);
    setNameValue(b.displayName || b.user?.name || b.user?.email || "");
  };

  const saveNameEdit = (b: AvailabilityBlock) => {
    const trimmed = nameValue.trim();
    // Send null to clear an override and fall back to the account name.
    const fallback = b.user?.name || b.user?.email || "";
    updateNameMutation.mutate({
      id: b.id,
      displayName: !trimmed || trimmed === fallback ? null : trimmed,
    });
  };

  const startEdit = (b: AvailabilityBlock) => {
    setEditingId(b.id);
    // Pre-fill in Central wall-clock time to match how the form is read back on
    // submit (buildPayload interprets typed times as Central). Using browser
    // time here would drift the stored instant for non-Central viewers.
    const toBusinessInput = (iso: string) =>
      formatInTimeZone(new Date(iso), BUSINESS_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
    setForm({
      category: b.category,
      reason: b.reason || "",
      allDay: b.allDay,
      startAt: toBusinessInput(b.startAt),
      endAt: toBusinessInput(b.endAt),
      displayName: b.displayName || "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    const now = new Date();
    if (!form.reason.trim()) {
      toast({
        title: "Reason is required",
        description: "Please enter a reason for the unavailable time.",
        variant: "destructive",
      });
      return;
    }
    if (form.allDay) {
      // Full-day blocks: just guard against past dates (new blocks only —
      // editing an already-started block shouldn't be forced to move forward).
      const startDay = form.startAt.slice(0, 10);
      const endDay = (form.endAt || form.startAt).slice(0, 10);
      if (!editingId && startDay < businessToday()) {
        toast({
          title: "Date is in the past",
          description: "Please pick today or a future date.",
          variant: "destructive",
        });
        return;
      }
      if (!editingId && endDay < businessToday()) {
        toast({
          title: "End date is in the past",
          description: "Please pick today or a future end date.",
          variant: "destructive",
        });
        return;
      }
      if (endDay < startDay) {
        toast({
          title: "Invalid date range",
          description: "The end date must be on or after the start date.",
          variant: "destructive",
        });
        return;
      }
    } else {
      // Half-day blocks: stay within office hours, on a single day, end after
      // start, and never in the past (for new blocks).
      const startTime = form.startAt.slice(11, 16);
      const endTime = form.endAt.slice(11, 16);
      if (
        minOfDay(startTime) < OFFICE_OPEN_MIN ||
        minOfDay(endTime) > OFFICE_CLOSE_MIN
      ) {
        toast({
          title: "Outside office hours",
          description: "Half-day time off must be between 6:00 AM and 8:00 PM.",
          variant: "destructive",
        });
        return;
      }
      if (form.startAt.slice(0, 10) !== form.endAt.slice(0, 10)) {
        toast({
          title: "Same day only",
          description: "A half-day block must start and end on the same day.",
          variant: "destructive",
        });
        return;
      }
      const start = fromBusinessTz(form.startAt.slice(0, 10), startTime);
      const end = fromBusinessTz(form.endAt.slice(0, 10), endTime);
      if (end <= start) {
        toast({
          title: "Invalid time range",
          description: "End time must be after the start time.",
          variant: "destructive",
        });
        return;
      }
      if (!editingId && start < now) {
        toast({
          title: "Time is in the past",
          description: "Please pick a date and time in the future.",
          variant: "destructive",
        });
        return;
      }
    }
    if (editingId) updateMutation.mutate(editingId);
    else createMutation.mutate();
  };

  const sorted = (blocks || [])
    .slice()
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
  const now = Date.now();
  const upcoming = sorted.filter((b) => new Date(b.endAt).getTime() >= now);
  const past = sorted.filter((b) => new Date(b.endAt).getTime() < now);

  // Minimum selectable date (in business time) so past dates can't be picked.
  const minDate = businessToday();

  // Upcoming unavailability for everyone else on the team (read-only).
  const teamUpcoming = (teamBlocks || [])
    .filter((b) => b.userId !== user?.id)
    .filter((b) => new Date(b.endAt).getTime() >= now)
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );

  const fmtRange = (b: AvailabilityBlock) => {
    const s = new Date(b.startAt);
    const e = new Date(b.endAt);
    if (b.allDay) {
      // All-day blocks are stored at noon UTC; read the calendar day from the
      // date tokens (not the local instant) so the list matches the calendar
      // overlay regardless of the viewer's timezone.
      const sDay = new Date(`${b.startAt.slice(0, 10)}T12:00:00`);
      const eDay = new Date(`${b.endAt.slice(0, 10)}T12:00:00`);
      const sameDay = b.startAt.slice(0, 10) === b.endAt.slice(0, 10);
      return sameDay
        ? `${format(sDay, "EEE, MMM d, yyyy")} · Full Day`
        : `${format(sDay, "MMM d")} – ${format(eDay, "MMM d, yyyy")} · Full Day`;
    }
    const sameDay = s.toDateString() === e.toDateString();
    return sameDay
      ? `${format(s, "EEE, MMM d")} · Half Day · ${format(s, "h:mm a")} – ${format(e, "h:mm a")}`
      : `${format(s, "MMM d, h:mm a")} – ${format(e, "MMM d, h:mm a")} · Half Day`;
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const renderBlock = (b: AvailabilityBlock) => (
    <div
      key={b.id}
      className="group relative flex items-start gap-3 overflow-hidden rounded-lg border bg-card p-3 pl-4 transition-colors hover:border-primary/40"
      data-testid={`block-availability-${b.id}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${CATEGORY_ACCENT[b.category] || CATEGORY_ACCENT.other}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            className={`${CATEGORY_STYLES[b.category] || CATEGORY_STYLES.other} border-0`}
            data-testid={`badge-category-${b.id}`}
          >
            {CATEGORIES.find((c) => c.value === b.category)?.label || b.category}
          </Badge>
          <Badge
            variant="outline"
            className="text-rose-600 border-rose-200 dark:text-rose-300 dark:border-rose-900/60"
            data-testid={`badge-unavailable-${b.id}`}
          >
            Unavailable
          </Badge>
          {b.user && (
            <span className="text-xs text-muted-foreground" data-testid={`text-user-${b.id}`}>
              {(b.displayName || b.user.name || b.user.email)} · {positionLabel(b.user.role, b.user.jobTitle)}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold">
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span data-testid={`text-range-${b.id}`}>{fmtRange(b)}</span>
        </div>
        {b.reason && (
          <p className="mt-0.5 text-sm text-muted-foreground break-words">
            {b.reason}
          </p>
        )}
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Edit unavailable time"
          className="h-8 w-8 text-muted-foreground hover:text-foreground"
          onClick={() => startEdit(b)}
          data-testid={`button-edit-block-${b.id}`}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Delete unavailable time"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={() => setDeleteId(b.id)}
          data-testid={`button-delete-block-${b.id}`}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  const renderTeamBlock = (b: AvailabilityBlock) => (
    <div
      key={b.id}
      className="relative flex items-start gap-3 overflow-hidden rounded-lg border bg-card p-3 pl-4"
      data-testid={`team-block-availability-${b.id}`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1.5 ${CATEGORY_ACCENT[b.category] || CATEGORY_ACCENT.other}`}
        aria-hidden="true"
      />
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className="bg-muted text-[11px] font-semibold text-muted-foreground">
          {initials(b.displayName || b.user?.name, b.user?.email)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        {editingNameId === b.id ? (
          <div className="flex items-center gap-1.5">
            <Input
              value={nameValue}
              onChange={(e) => setNameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveNameEdit(b);
                if (e.key === "Escape") setEditingNameId(null);
              }}
              placeholder="Display name"
              className="h-8 text-sm"
              autoFocus
              data-testid={`input-team-name-${b.id}`}
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label="Save name"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              disabled={updateNameMutation.isPending}
              onClick={() => saveNameEdit(b)}
              data-testid={`button-save-team-name-${b.id}`}
            >
              {updateNameMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Cancel name edit"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setEditingNameId(null)}
              data-testid={`button-cancel-team-name-${b.id}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <div className="text-sm font-semibold truncate" data-testid={`text-team-user-${b.id}`}>
              {b.displayName || b.user?.name || b.user?.email || "Team member"}
              {b.user && (
                <span className="text-muted-foreground font-normal">
                  {" "}· {positionLabel(b.user.role, b.user.jobTitle)}
                </span>
              )}
            </div>
            {isInstallManager && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Edit display name"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={() => startNameEdit(b)}
                data-testid={`button-edit-team-name-${b.id}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
        <div className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span data-testid={`text-team-range-${b.id}`}>{fmtRange(b)}</span>
        </div>
        {b.reason && (
          <p className="mt-0.5 text-sm text-muted-foreground break-words">
            {b.reason}
          </p>
        )}
      </div>
      {isInstallManager && editingNameId !== b.id && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Edit unavailable time"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={() => startEdit(b)}
            data-testid={`button-edit-team-block-${b.id}`}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Delete unavailable time"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => setDeleteId(b.id)}
            data-testid={`button-delete-team-block-${b.id}`}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-availability">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CalendarOff className="h-5 w-5" />
            </div>
            <div className="space-y-0.5">
              <DialogTitle>Availability &amp; Time Off</DialogTitle>
              <DialogDescription>
                Block out times you're unavailable — these can't be booked.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div
          className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3"
          data-testid="text-my-availability"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {initials(selectedUserName, managingSelf ? user?.email : undefined)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{selectedUserName}</p>
            <p className="text-xs text-muted-foreground">
              {managingSelf
                ? "Managing your availability"
                : "Managing this team member's availability"}
            </p>
          </div>
        </div>

        {canManageOthers && (
          <div className="space-y-1.5" data-testid="section-user-picker">
            <Label className="text-xs">Manage availability for</Label>
            <Select
              value={selectedUser}
              onValueChange={(v) => {
                setSelectedUser(v);
                // Switching the target shouldn't carry over an in-progress edit.
                resetForm();
              }}
            >
              <SelectTrigger data-testid="select-availability-user">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="self" data-testid="option-user-self">
                  Myself ({user?.name || user?.email})
                </SelectItem>
                {assignableUsers
                  ?.filter((u) => u.id !== user?.id)
                  .map((u) => (
                    <SelectItem
                      key={u.id}
                      value={String(u.id)}
                      data-testid={`option-user-${u.id}`}
                    >
                      {u.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!showForm && (
          <Button
            onClick={() => {
              setForm(defaultForm());
              setEditingId(null);
              setShowForm(true);
            }}
            className="w-full"
            data-testid="button-add-availability"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {managingSelf
              ? "Add unavailable time"
              : `Add unavailable time for ${selectedUserName}`}
          </Button>
        )}

        {showForm && (
          <div className="rounded-lg border p-3 space-y-3" data-testid="form-availability">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {editingId ? "Edit block" : "New unavailable time"}
              </p>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close form"
                className="h-7 w-7"
                onClick={resetForm}
                data-testid="button-cancel-form"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select
                value={form.category}
                onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isInstallManager && (
              <div className="space-y-1.5">
                <Label className="text-xs">Name (label shown in list)</Label>
                <Input
                  value={form.displayName}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, displayName: e.target.value }))
                  }
                  placeholder={
                    managingSelf
                      ? user?.name || "Display name"
                      : selectedUserName
                  }
                  data-testid="input-display-name"
                />
                <p className="text-[11px] text-muted-foreground">
                  Optional — overrides the name shown for this entry only. Leave
                  blank to use the account name.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Duration</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={form.allDay ? "default" : "outline"}
                  onClick={() => setForm((f) => ({ ...f, allDay: true }))}
                  data-testid="button-full-day"
                >
                  Full Day
                </Button>
                <Button
                  type="button"
                  variant={!form.allDay ? "default" : "outline"}
                  onClick={() =>
                    setForm((f) => {
                      if (!f.allDay) return f;
                      const day = f.startAt.slice(0, 10) || minDate;
                      return {
                        ...f,
                        allDay: false,
                        startAt: `${day}T09:00`,
                        endAt: `${day}T13:00`,
                      };
                    })
                  }
                  data-testid="button-half-day"
                >
                  Half Day
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {form.allDay ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Start date</Label>
                    <Input
                      type="date"
                      min={minDate}
                      value={form.startAt.slice(0, 10)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, startAt: e.target.value + "T00:00" }))
                      }
                      data-testid="input-start-at"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">End date</Label>
                    <Input
                      type="date"
                      min={form.startAt.slice(0, 10) || minDate}
                      value={form.endAt.slice(0, 10)}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, endAt: e.target.value + "T23:59" }))
                      }
                      data-testid="input-end-date"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Date</Label>
                    <Input
                      type="date"
                      min={minDate}
                      value={form.startAt.slice(0, 10)}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          startAt:
                            e.target.value +
                            "T" +
                            (f.startAt.slice(11, 16) || "09:00"),
                          endAt:
                            e.target.value +
                            "T" +
                            (f.endAt.slice(11, 16) || "13:00"),
                        }))
                      }
                      data-testid="input-half-day-date"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Start time</Label>
                      <Input
                        type="time"
                        min={OFFICE_OPEN_STR}
                        max={OFFICE_CLOSE_STR}
                        step={900}
                        value={form.startAt.slice(11, 16)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            startAt: f.startAt.slice(0, 10) + "T" + e.target.value,
                          }))
                        }
                        data-testid="input-start-time"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">End time</Label>
                      <Input
                        type="time"
                        min={OFFICE_OPEN_STR}
                        max={OFFICE_CLOSE_STR}
                        step={900}
                        value={form.endAt.slice(11, 16)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            endAt: f.startAt.slice(0, 10) + "T" + e.target.value,
                          }))
                        }
                        data-testid="input-end-time"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Office hours: 6:00 AM – 8:00 PM
                  </p>
                </>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Reason</Label>
              <Textarea
                value={form.reason}
                onChange={(e) =>
                  setForm((f) => ({ ...f, reason: e.target.value }))
                }
                placeholder="e.g. Annual leave, doctor's appointment"
                rows={2}
                data-testid="input-reason"
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              className="w-full"
              data-testid="button-save-availability"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              {editingId ? "Save changes" : "Add block"}
            </Button>
          </div>
        )}

        <div className="space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div
              className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center"
              data-testid="text-no-blocks"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <CalendarOff className="h-5 w-5" />
              </div>
              <p className="text-sm font-medium">No unavailable times set</p>
              <p className="text-xs text-muted-foreground">
                {managingSelf
                  ? "Add a block above to mark when you can't be booked."
                  : `Add a block above to mark when ${selectedUserName} can't be booked.`}
              </p>
            </div>
          ) : (
            <>
              {upcoming.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Upcoming
                  </p>
                  {upcoming.map(renderBlock)}
                </div>
              )}
              {past.length > 0 && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Past
                  </p>
                  <div className="opacity-60 space-y-2">{past.map(renderBlock)}</div>
                </div>
              )}
            </>
          )}
        </div>

        {teamUpcoming.length > 0 && (
          <div className="space-y-2 border-t pt-3" data-testid="section-team-availability">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <Users className="h-3.5 w-3.5" />
              Team time off
            </p>
            {teamUpcoming.map(renderTeamBlock)}
          </div>
        )}
      </DialogContent>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent data-testid="dialog-confirm-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this unavailable time?</AlertDialogTitle>
            <AlertDialogDescription>
              This will free up the slot so bookings can be assigned again. This
              can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteId !== null) deleteMutation.mutate(deleteId);
                setDeleteId(null);
              }}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
