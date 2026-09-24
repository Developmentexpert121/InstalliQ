import { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { AvailabilityDialog } from "@/components/availability-dialog";
import { MapLinkPicker } from "@/components/map-link-picker";
import { usePageHeader } from "@/lib/page-header";
import { getImageUrl } from "@/lib/image-url";
import PinchZoomWrapper from "@/components/pinch-zoom-wrapper";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameDay, 
  isSameMonth,
  addMonths, 
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
  isToday,
  startOfDay,
  setHours,
  getHours
} from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

// Booking timezone is Central (CST/CDT). Function names below keep their
// historical "EST" suffix to avoid a sweeping rename, but they all operate
// against the BOOKING_TIMEZONE constant defined here.
const BOOKING_TIMEZONE = "America/Chicago";
const EST_TIMEZONE = BOOKING_TIMEZONE;

function toEST(date: Date | string): Date {
  return toZonedTime(typeof date === "string" ? new Date(date) : date, BOOKING_TIMEZONE);
}

function formatEST(date: Date | string, formatStr: string): string {
  return formatInTimeZone(typeof date === "string" ? new Date(date) : date, BOOKING_TIMEZONE, formatStr);
}

function fromEST(dateStr: string, timeStr: string): Date {
  return fromZonedTime(new Date(`${dateStr}T${timeStr}:00`), BOOKING_TIMEZONE);
}

import { splitContactPhone } from "@/lib/utils";

// Renders a multi-line block of "Key: value" notes, turning Phone numbers into
// tappable tel: links and Address values into a navigation-app picker.
function NotesWithLinks({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, idx) => {
        const last = idx === lines.length - 1;
        const phoneMatch = line.match(/^(\s*)(Phone|Phone\s*\d*|Mobile|Cell|Tel|Telephone|Secondary\s*Phone)(\s*:\s*)(.+?)\s*$/i);
        const addressMatch = line.match(/^(\s*)(Address|Site\s*Address|Job\s*Address|Install\s*Address|Location)(\s*:\s*)(.+?)\s*$/i);
        if (phoneMatch) {
          const [, lead, label, sep, value] = phoneMatch;
          const tel = value.replace(/[^\d+]/g, "");
          return (
            <span key={idx}>
              {lead}
              <span className="text-muted-foreground">{label}{sep}</span>
              <a
                href={`tel:${tel}`}
                className="text-primary hover:underline font-medium"
                data-testid={`link-notes-phone-${idx}`}
              >
                {value}
              </a>
              {!last && "\n"}
            </span>
          );
        }
        if (addressMatch) {
          const [, lead, label, sep, value] = addressMatch;
          return (
            <span key={idx}>
              {lead}
              <span className="text-muted-foreground">{label}{sep}</span>
              <MapLinkPicker address={value} testIdPrefix={`notes-address-${idx}`}>
                <button
                  type="button"
                  className="text-primary hover:underline font-medium text-left"
                  data-testid={`link-notes-address-${idx}`}
                >
                  {value}
                </button>
              </MapLinkPicker>
              {!last && "\n"}
            </span>
          );
        }
        return (
          <span key={idx}>
            {line}
            {!last && "\n"}
          </span>
        );
      })}
    </>
  );
}
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Loader2, 
  Clock, 
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  FileText,
  Download,
  User,
  Phone,
  Mail,
  MapPin,
  Edit2,
  Save,
  X,
  Camera,
  Image,
  AlertCircle,
  Cloud,
  Thermometer,
  Droplets,
  Wind,
  Users,
  Sun,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudDrizzle,
  CloudSun,
  Sunrise,
  Eye,
  Tag,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Sparkles, Upload, Send, Shield, RefreshCw, Car, Timer, CheckCircle2, AlertTriangle, ClipboardCheck, CalendarOff } from "lucide-react";
import { AICalendarDialog } from "@/components/ai-calendar-dialog";
import { TimePickerSelect } from "@/components/ui/time-picker-select";
import { IntakeDialog } from "@/components/intake-dialog";
import { LastUpdates } from "@/components/last-updates";

import type { CalendarEvent as BaseCalendarEvent } from "@shared/schema";
import { useAuth } from "@/lib/auth";

type CalendarEvent = BaseCalendarEvent & { assignedUserIds?: number[]; assignedUserNames?: string[] };

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return name;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1]}`;
}

function shortNames(names: string[]): string {
  return names.map(shortName).join(", ");
}


type ViewMode = "day" | "week" | "month" | "list" | "agenda";
type StatusFilter = "ALL" | "SCHEDULED" | "CONFIRMED" | "NEEDS_RESCHEDULE" | "ISSUE" | "COMPLETED" | "SURVEY" | "TIMEOFF";

const TIMEOFF_COLOR = "#eab308"; // yellow-500 — used to highlight unavailable users

const TIMEOFF_CATEGORY_LABEL: Record<string, string> = {
  holiday: "Holiday",
  leave: "Leave",
  meeting: "Meeting",
  personal: "Personal",
  other: "Unavailable",
};

type FilterColorMap = Record<string, string>;

const DEFAULT_FILTER_COLORS: FilterColorMap = {
  SCHEDULED: "#f97316",
  CONFIRMED: "#22c55e",
  NEEDS_RESCHEDULE: "#3b82f6",
  ISSUE: "#ef4444",
  COMPLETED: "#9ca3af",
  SURVEY: "#8b5cf6",
  TIMEOFF: TIMEOFF_COLOR,
};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function getStatusColor(status: string | null | undefined, hasIssue: boolean | undefined, colors: FilterColorMap): string {
  if (status?.toUpperCase() === "TIMEOFF") return colors.TIMEOFF || TIMEOFF_COLOR;
  if (hasIssue || status?.toUpperCase() === "ISSUE") return colors.ISSUE || DEFAULT_FILTER_COLORS.ISSUE;
  switch (status?.toUpperCase()) {
    case "CONFIRMED": return colors.CONFIRMED || DEFAULT_FILTER_COLORS.CONFIRMED;
    case "NEEDS_RESCHEDULE": return colors.NEEDS_RESCHEDULE || DEFAULT_FILTER_COLORS.NEEDS_RESCHEDULE;
    case "COMPLETED": return colors.COMPLETED || DEFAULT_FILTER_COLORS.COMPLETED;
    case "SURVEY": return colors.SURVEY || DEFAULT_FILTER_COLORS.SURVEY;
    case "SCHEDULED":
    default: return colors.SCHEDULED || DEFAULT_FILTER_COLORS.SCHEDULED;
  }
}

function getStatusInlineEventStyles(status: string | null | undefined, hasIssue: boolean | undefined, colors: FilterColorMap): React.CSSProperties {
  const hex = getStatusColor(status, hasIssue, colors);
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  return {
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`,
    color: hex,
    borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`,
  };
}

function getStatusInlineBlockStyles(status: string | null | undefined, hasIssue: boolean | undefined, colors: FilterColorMap): React.CSSProperties {
  const hex = getStatusColor(status, hasIssue, colors);
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  return {
    backgroundColor: hex,
    color: "#ffffff",
    borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`,
  };
}

// Booking time policy: 6:00 AM – 8:00 PM, 30-minute slots, no past times.
// Lifted to module scope so child components (e.g. EventDetailDialog) can use it.
const BOOKING_MIN_HOUR = 6;   // 06:00
const BOOKING_MAX_HOUR = 20;  // 20:00 (8:00 PM)

function validateBookingDateTime(
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
): string | null {
  if (!startDate || !startTime) return "Please choose a start date and time.";
  const tRe = /^(\d{2}):(\d{2})$/;
  const sm = startTime.match(tRe);
  if (!sm) return "Invalid start time format.";
  const sH = parseInt(sm[1], 10);
  const sMin = parseInt(sm[2], 10);
  if (sMin % 30 !== 0) return "Time must be in 30-minute increments (e.g. 6:00, 6:30, 7:00).";
  if (sH < BOOKING_MIN_HOUR || sH > BOOKING_MAX_HOUR || (sH === BOOKING_MAX_HOUR && sMin > 0)) {
    return "Start time must be between 6:00 AM and 8:00 PM.";
  }
  if (endTime) {
    const em = endTime.match(tRe);
    if (!em) return "Invalid end time format.";
    const eH = parseInt(em[1], 10);
    const eMin = parseInt(em[2], 10);
    if (eMin % 30 !== 0) return "Time must be in 30-minute increments (e.g. 6:00, 6:30, 7:00).";
    if (eH < BOOKING_MIN_HOUR || eH > BOOKING_MAX_HOUR || (eH === BOOKING_MAX_HOUR && eMin > 0)) {
      return "End time must be between 6:00 AM and 8:00 PM.";
    }
  }
  const startDT = fromEST(startDate, startTime);
  if (startDT.getTime() < Date.now()) {
    return "Bookings cannot be created for a past date or time.";
  }
  if (endDate && endTime) {
    const endDT = fromEST(endDate, endTime);
    if (endDT.getTime() <= startDT.getTime()) {
      return "End time must be after the start time.";
    }
  }
  return null;
}

interface AvailabilityBlockWithUser {
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

export default function GoogleCalendarPage() {
  const { toast } = useToast();
  const { user, refreshUser } = useAuth();
  const { setHeaderInfo } = usePageHeader();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const isInstallManager = user?.role === "user" && (user as any).jobTitle === "Install Manager";
  const canCreateBooking = (isAdmin && !isSuperAdmin) || isInstallManager;
  const [isAvailabilityOpen, setIsAvailabilityOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(toEST(new Date()));
  // On phones, default to Day view — Week's 7-column grid is unreadable below ~640px.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) return "day";
    return "month";
  });
  const [mobileSelectedDate, setMobileSelectedDate] = useState<Date>(toEST(new Date()));
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [userFilter, setUserFilter] = useState<number | null>(null);
  const [userFilterOpen, setUserFilterOpen] = useState(false);
  const [weatherTab, setWeatherTab] = useState<"Temperature" | "Precipitation" | "Wind">("Temperature");
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const [isIntakeDialogOpen, setIsIntakeDialogOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [isTagsEditing, setIsTagsEditing] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#3b82f6");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagType, setEditingTagType] = useState<"global" | "owner" | null>(null);
  const [editingTagName, setEditingTagName] = useState("");
  const [editingTagColor, setEditingTagColor] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exportStatuses, setExportStatuses] = useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [timeOffDetail, setTimeOffDetail] = useState<AvailabilityBlockWithUser | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [highlightedEventId, setHighlightedEventId] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    jobDescription: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    duration: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    address: "",
    workJobNumber: "",
  });

  // Booking time policy: 6:00 AM – 8:00 PM, 30-minute slots, no past times
  const BOOKING_STEP_SECONDS = 1800; // 30 minutes
  const todayDateStr = formatEST(new Date(), "yyyy-MM-dd");
  const [newEventFiles, setNewEventFiles] = useState<File[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const newEventFileInputRef = useRef<HTMLInputElement>(null);
  const isSubmittingEventRef = useRef(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [woExistingEvent, setWoExistingEvent] = useState<{ eventId: number; title: string; date: string } | null>(null);

  const [isSenderSetupOpen, setIsSenderSetupOpen] = useState(false);
  const [senderSetupLoading, setSenderSetupLoading] = useState(false);
  const [senderForm, setSenderForm] = useState({
    firstName: "",
    nickname: "",
    fromEmail: "",
    replyTo: "",
    companyAddress: "",
    city: "",
    country: "",
  });

  const isOwnerAdmin = user?.role === "admin";

  useEffect(() => {
    if (!isOwnerAdmin || !user) return;

    if (user.senderFromEmail && !user.senderVerified) {
      fetch("/api/sender/status", { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          if (data.verified) {
            refreshUser();
          }
        })
        .catch(() => {});
    }
  }, [isOwnerAdmin, user?.id]);

  // Debounce search query
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Global Escape key closes the search dropdown
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && searchOpen) {
        setSearchQuery("");
        setDebouncedSearchQuery("");
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [searchOpen]);

  // Cleanup highlight timer on unmount
  useEffect(() => {
    return () => {
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    };
  }, []);

  const handleSenderSetupSubmit = async () => {
    if (!senderForm.firstName.trim() || !senderForm.fromEmail.trim() || !senderForm.replyTo.trim() ||
        !senderForm.companyAddress.trim() || !senderForm.city.trim() || !senderForm.country.trim() ||
        !senderForm.nickname.trim()) {
      toast({ title: "Missing Fields", description: "Please fill in all required fields.", variant: "destructive" });
      return;
    }
    setSenderSetupLoading(true);
    try {
      const res = await fetch("/api/sender/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(senderForm),
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        await refreshUser();
        toast({
          title: data.verified ? "Sender Verified!" : "Verification Email Sent",
          description: data.verified
            ? "Your sender email is verified. Dashboard emails will now be sent from your address."
            : "Please check your inbox and click the verification link to complete setup.",
        });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
        setIsSenderSetupOpen(false);
      } else {
        toast({ title: "Setup Failed", description: data.error || "Failed to set up sender.", variant: "destructive" });
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to set up sender verification.", variant: "destructive" });
    } finally {
      setSenderSetupLoading(false);
    }
  };

  const handleFileUploadAndExtract = async (files: FileList) => {
    const fileArray = Array.from(files);
    setNewEventFiles(prev => [...prev, ...fileArray]);

    const firstFile = fileArray[0];
    if (!firstFile) return;

    setIsExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", firstFile);
      const response = await fetch("/api/calendar-events/extract-file-data", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const result = await response.json();
      if (result.extracted && result.data) {
        const d = result.data;

        const extractedWorkOrder =
          d.workOrderNumber || d.workJobNumber || d.jobNumber || d.invoiceNumber || "";
        const today = toEST(new Date());
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const extractedStartTime = d.startTime || "09:00";
        const extractedDuration = d.duration || "2";

        let extractedEndDate = "";
        let extractedEndTime = "";
        if (extractedStartTime && extractedDuration) {
          const start = fromEST(todayStr, extractedStartTime);
          const end = new Date(start.getTime() + parseFloat(extractedDuration) * 60 * 60 * 1000);
          const endEST = toEST(end);
          extractedEndDate = `${endEST.getFullYear()}-${String(endEST.getMonth() + 1).padStart(2, "0")}-${String(endEST.getDate()).padStart(2, "0")}`;
          extractedEndTime = `${String(endEST.getHours()).padStart(2, "0")}:${String(endEST.getMinutes()).padStart(2, "0")}`;
        }

        setNewEvent(prev => ({
          ...prev,
          title: d.title || prev.title,
          description: d.description || prev.description,
          jobDescription: d.jobDescription || prev.jobDescription,
          customerName: d.customerName || prev.customerName,
          customerPhone: d.customerPhone || prev.customerPhone,
          customerEmail: d.customerEmail || prev.customerEmail,
          address: d.address || prev.address,
          workJobNumber: extractedWorkOrder || prev.workJobNumber,
          startDate: todayStr,
          startTime: extractedStartTime || prev.startTime,
          duration: extractedDuration || prev.duration,
          endDate: extractedEndDate || prev.endDate,
          endTime: extractedEndTime || prev.endTime,
        }));

        // Check if this work order number already has an event
        if (extractedWorkOrder) {
          setWoExistingEvent(null);
          try {
            const woCheck = await fetch(`/api/calendar-events/check-work-order?workJobNumber=${encodeURIComponent(extractedWorkOrder)}`, { credentials: "include" });
            if (woCheck.ok) {
              const woData = await woCheck.json();
              if (woData.exists) {
                setWoExistingEvent({ eventId: woData.eventId, title: woData.title, date: woData.date });
              }
            }
          } catch {}
        }

        toast({
          title: "Data Extracted",
          description: "Form fields have been pre-filled from the uploaded file. Please review and make corrections if needed.",
        });
      } else if (result.error || !result.extracted) {
        toast({
          title: "Extraction Failed",
          description: result.message || result.error || "Could not extract data from the file. You can fill in the fields manually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Extraction error:", error);
      toast({
        title: "Extraction Failed",
        description: "Could not extract data from the file. You can fill in the fields manually.",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };
  
  const DURATION_OPTIONS = [
    { value: "0.5", label: "30 min" },
    { value: "1", label: "1 hour" },
    { value: "1.5", label: "1 hr 30 min" },
    { value: "2", label: "2 hours" },
    { value: "2.5", label: "2 hr 30 min" },
    { value: "3", label: "3 hours" },
    { value: "3.5", label: "3 hr 30 min" },
    { value: "4", label: "4 hours" },
    { value: "4.5", label: "4 hr 30 min" },
    { value: "5", label: "5 hours" },
    { value: "5.5", label: "5 hr 30 min" },
    { value: "6", label: "6 hours" },
    { value: "6.5", label: "6 hr 30 min" },
    { value: "7", label: "7 hours" },
    { value: "7.5", label: "7 hr 30 min" },
    { value: "8", label: "8 hours" },
  ];

  useEffect(() => {
    if (isSuperAdmin) {
      setHeaderInfo(null);
      return () => setHeaderInfo(null);
    }
    setHeaderInfo({
      title: "",
      actions: (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2 sm:px-3"
          onClick={() => setIsAvailabilityOpen(true)}
          data-testid="button-availability"
          title="Manage Availability & Time Off"
        >
          <CalendarOff className="h-4 w-4" />
          <span className="hidden sm:inline text-sm">Availability</span>
        </Button>
      ),
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo, isSuperAdmin]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
    queryClient.invalidateQueries({ queryKey: ["/api/job-timers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/installer-notifications"] });
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const { data: events, isLoading, error } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events"],
    refetchInterval: 60000,
    staleTime: 60000,
  });

  // Debounce search query by 300 ms
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Close search dropdown on click-outside
  useEffect(() => {
    if (!searchOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen]);

  function handleSearchResultSelect(result: { id: number; title: string; workJobNumber: string | null; customerName: string | null; date: string; startTime: string | null; status: string | null }) {
    const eventDate = toEST(result.startTime || result.date);
    setCurrentDate(eventDate);
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setSearchOpen(false);
    setHighlightedEventId(result.id);
    setTimeout(() => setHighlightedEventId(null), 5000);
  }

  const { data: globalTags = [] } = useQuery<{ id: number; name: string; color: string | null; createdAt: string }[]>({
    queryKey: ["/api/global-tags"],
    enabled: isAdmin || isInstallManager,
  });

  const { data: ownerTags = [] } = useQuery<{ id: number; name: string; color: string | null; ownerId: number; createdAt: string }[]>({
    queryKey: ["/api/owner-tags"],
    enabled: (isAdmin && !isSuperAdmin) || isInstallManager,
  });

  const createGlobalTagMutation = useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const res = await apiRequest("POST", "/api/global-tags", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create global tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] });
      setNewTagName("");
      setNewTagColor("#3b82f6");
      toast({ title: "Global Tag Created", description: "New global tag added successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateGlobalTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name?: string; color?: string } }) => {
      const res = await apiRequest("PATCH", `/api/global-tags/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update global tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] });
      setEditingTagId(null); setEditingTagType(null);
      toast({ title: "Global Tag Updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteGlobalTagMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/global-tags/${id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to delete global tag");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] });
      toast({ title: "Global Tag Deleted" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color?: string }) => {
      const res = await apiRequest("POST", "/api/owner-tags", data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create tag");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] });
      setNewTagName("");
      setNewTagColor("#3b82f6");
      toast({ title: "Tag Created", description: "New custom tag added successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name?: string; color?: string } }) => {
      const res = await apiRequest("PATCH", `/api/owner-tags/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] });
      setEditingTagId(null); setEditingTagType(null);
      toast({ title: "Tag Updated" });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/owner-tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] });
      toast({ title: "Tag Deleted" });
    },
  });

  useEffect(() => {
    if (!events || events.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const openEventId = params.get("openEvent");
    const editMode = params.get("edit") === "true";
    if (openEventId) {
      const eventToOpen = events.find((e) => e.id === parseInt(openEventId));
      if (eventToOpen) {
        setSelectedEvent(eventToOpen);
        if (editMode) {
          setTimeout(() => {
            const editBtn = document.querySelector('[data-testid="button-edit-event"]') as HTMLButtonElement;
            if (editBtn) editBtn.click();
          }, 500);
        }
        window.history.replaceState({}, "", "/calendar");
      }
    }
  }, [events]);

  const { data: filterColors } = useQuery<FilterColorMap>({
    queryKey: ["/api/calendar-filter-colors"],
  });
  const activeColors: FilterColorMap = { ...DEFAULT_FILTER_COLORS, ...filterColors };

  const { data: assignableUsers } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/admin/assignable-users"],
  });

  interface DefaultWeatherData {
    location: string;
    current: {
      temp: number;
      feelsLike: number;
      humidity: number;
      windSpeed: number;
      summary: string;
      icon: string;
      precipProb: number;
    };
    forecast: {
      date: string;
      dayOfWeek: string;
      tempHigh: number;
      tempLow: number;
      precipProb: number;
      summary: string;
      icon: string;
      humidity: number;
      windSpeed: number;
    }[];
  }

  const { data: weatherData, isLoading: weatherLoading } = useQuery<DefaultWeatherData>({
    queryKey: ["/api/weather/default-location"],
    refetchInterval: 1000 * 60 * 60,
  });

  const filteredEvents = (events || []).filter((event) => {
    if (userFilter === null) return true;
    return event.assignedUserIds?.includes(userFilter);
  });

  // ── Time Off (availability blocks) overlaid on the calendar ───────────────
  // Super admin sees ALL users; owner admin / install manager see their team.
  const canViewTimeOff = isAdmin || isInstallManager;
  const timeOffRange = useMemo(() => {
    // Window covers the month grid AND the List view, which spans 60 days from
    // the start of the current month. Use the wider of the two as the end.
    const from = startOfWeek(startOfMonth(currentDate));
    const monthGridEnd = endOfWeek(endOfMonth(currentDate));
    const listEnd = endOfWeek(addDays(startOfMonth(currentDate), 59));
    const to = listEnd > monthGridEnd ? listEnd : monthGridEnd;
    return { from, to };
  }, [currentDate]);

  const { data: availabilityBlocks = [] } = useQuery<AvailabilityBlockWithUser[]>({
    queryKey: [
      "/api/availability-blocks?" +
        (isSuperAdmin ? "scope=all&" : "") +
        "from=" +
        timeOffRange.from.toISOString() +
        "&to=" +
        timeOffRange.to.toISOString(),
    ],
    enabled: canViewTimeOff,
  });

  // Expand each block into one synthetic CalendarEvent per day it covers, so a
  // multi-day block highlights every day in the range.
  const timeOffEvents = useMemo<CalendarEvent[]>(() => {
    if (!canViewTimeOff) return [];
    const out: any[] = [];
    for (const b of availabilityBlocks) {
      const name = b.displayName || b.user?.name || b.user?.email || "Team member";
      const subLabel = b.reason?.trim() || TIMEOFF_CATEGORY_LABEL[b.category] || "Unavailable";
      const startEST = toEST(b.startAt);
      const endEST = toEST(b.endAt);
      const dayStart = startOfDay(startEST);
      const dayEnd = startOfDay(endEST);
      const days = eachDayOfInterval({ start: dayStart, end: dayEnd });
      const isMultiDay = days.length > 1;
      days.forEach((d, idx) => {
        const timed = !isMultiDay && !b.allDay;
        const dayStr = format(d, "yyyy-MM-dd");
        out.push({
          id: -1_000_000 - b.id * 1000 - idx,
          title: name,
          date: fromEST(dayStr, "12:00").toISOString(),
          startDate: dayStr,
          startTime: timed ? b.startAt : null,
          endTime: timed ? b.endAt : null,
          status: "TIMEOFF",
          hasIssue: false,
          assignedUserIds: b.userId ? [b.userId] : [],
          assignedUserNames: [subLabel],
          isTimeOff: true,
          allDay: b.allDay || isMultiDay,
          __block: b,
        });
      });
    }
    return out as unknown as CalendarEvent[];
  }, [availabilityBlocks, canViewTimeOff]);

  // Events passed to the views/filter bar: real bookings + time-off overlay.
  const viewEvents = useMemo<CalendarEvent[]>(() => {
    if (timeOffEvents.length === 0) return filteredEvents;
    const scopedTimeOff =
      userFilter === null
        ? timeOffEvents
        : timeOffEvents.filter((e) => e.assignedUserIds?.includes(userFilter));
    return [...filteredEvents, ...scopedTimeOff];
  }, [filteredEvents, timeOffEvents, userFilter]);

  // Open the booking dialog for real events; show the details dialog for time-off.
  const handleEventClick = (event: CalendarEvent) => {
    if ((event as any).isTimeOff) {
      const b = (event as any).__block as AvailabilityBlockWithUser | undefined;
      if (b) setTimeOffDetail(b);
      return;
    }
    setSelectedEvent(event);
    setIsDetailDialogOpen(true);
  };

  type SearchResult = {
    id: number;
    title: string;
    workJobNumber: string | null;
    customerName: string | null;
    date: string;
    startTime: string | null;
    status: string | null;
  };

  const { data: searchResults = [], isFetching: searchFetching } = useQuery<SearchResult[]>({
    queryKey: ["/api/calendar-events/search", debouncedSearchQuery],
    queryFn: async () => {
      if (debouncedSearchQuery.length < 4) return [];
      const res = await fetch(`/api/calendar-events/search?q=${encodeURIComponent(debouncedSearchQuery)}`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: debouncedSearchQuery.length >= 4,
    staleTime: 60000,
  });

  const clearHighlight = () => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedEventId(null);
  };

  const handleSearchResultClick = (result: SearchResult) => {
    const targetDate = toEST(new Date(result.date));
    setCurrentDate(targetDate);
    setSearchQuery("");
    setDebouncedSearchQuery("");
    setSearchOpen(false);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightedEventId(result.id);
    highlightTimerRef.current = setTimeout(() => setHighlightedEventId(null), 3000);
  };

  const toggleExportStatus = (status: string) => {
    setExportStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  };

  const handleExportCalendar = async () => {
    setIsExporting(true);
    try {
      const body: Record<string, unknown> = {};
      if (exportStatuses.size > 0) {
        body.statuses = Array.from(exportStatuses);
      }

      const response = await fetch("/api/calendar-events/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error("Export failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bookings-export-${format(new Date(), "yyyy-MM-dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: "Export downloaded successfully" });
      setExportOpen(false);
      setExportStatuses(new Set());
    } catch {
      toast({ title: "Failed to export bookings", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  };

  const createEventMutation = useMutation({
    mutationFn: async (eventData: {
      title: string;
      description?: string;
      jobDescription?: string;
      date: string;
      startTime?: string;
      endTime?: string;
      files?: File[];
      customerName?: string;
      customerPhone?: string;
      customerEmail?: string;
      address?: string;
      workJobNumber?: string;
    }) => {
      // If files are provided, use the multipart endpoint
      if (eventData.files && eventData.files.length > 0) {
        const formData = new FormData();
        formData.append("title", eventData.title);
        if (eventData.description) formData.append("description", eventData.description);
        if (eventData.jobDescription) formData.append("jobDescription", eventData.jobDescription);
        formData.append("date", eventData.date);
        if (eventData.startTime) formData.append("startTime", eventData.startTime);
        if (eventData.endTime) formData.append("endTime", eventData.endTime);
        if (eventData.customerName) formData.append("customerName", eventData.customerName);
        if (eventData.customerPhone) formData.append("customerPhone", eventData.customerPhone);
        if (eventData.customerEmail) formData.append("customerEmail", eventData.customerEmail);
        if (eventData.address) formData.append("address", eventData.address);
        if (eventData.workJobNumber) formData.append("workJobNumber", eventData.workJobNumber);
        
        for (const file of eventData.files) {
          formData.append("files", file);
        }
        
        const res = await fetch("/api/calendar-events/with-attachments", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const err: any = new Error(errBody.error || "Failed to create event");
          err.limitExceeded = errBody.limitExceeded;
          err.woDuplicate = res.status === 409;
          err.existingEventId = errBody.existingEventId;
          throw err;
        }
        return res.json();
      }
      const res = await fetch("/api/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(eventData),
        credentials: "include",
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        const err: any = new Error(errBody.error || "Failed to create event");
        err.woDuplicate = res.status === 409;
        err.existingEventId = errBody.existingEventId;
        err.limitExceeded = errBody.limitExceeded;
        throw err;
      }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setIsCreateOpen(false);
      resetNewEvent();
      if (data?.attachmentWarning) {
        toast({
          title: "Event Created (Attachments Skipped)",
          description: data.attachmentWarning,
          variant: "destructive",
        });
      } else if (data?.woRenamed) {
        toast({
          title: "Event Created",
          description: `Work Order #${data.originalWorkJobNumber} already existed, so it was saved as #${data.assignedWorkJobNumber}.`,
          variant: "success",
        });
      } else {
        toast({
          title: "Event Created",
          description: "The event has been added to your calendar.",
          variant: "success",
        });
      }
    },
    onError: (error: any) => {
      if (error.limitExceeded) {
        toast({
          title: "Event Limit Reached",
          description: error.message + " Visit Subscription Plans to upgrade.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to create event",
          variant: "destructive",
        });
      }
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      return apiRequest("DELETE", `/api/calendar-events/${eventId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setSelectedEvent(null);
      toast({
        title: "Event Deleted",
        description: "The event has been removed from your calendar.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete event",
        variant: "destructive",
      });
    },
  });

  const resetNewEvent = () => {
    setNewEvent({
      title: "",
      description: "",
      jobDescription: "",
      duration: "",
      startDate: "",
      startTime: "",
      endDate: "",
      endTime: "",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      address: "",
      workJobNumber: "",
    });
    setNewEventFiles([]);
    setWoExistingEvent(null);
  };

  const handleEventDrop = async (eventId: number, newDate: Date) => {
    try {
      const event = filteredEvents?.find((e: any) => e.id === eventId);
      if (!event) return;
      if (event.status !== "SCHEDULED") return;
      if (startOfDay(newDate) < startOfDay(addDays(new Date(), 1))) {
        toast({ title: "Cannot Move to Past Date", description: "Bookings can only be rescheduled to tomorrow or a future date.", variant: "destructive" });
        return;
      }

      // Calculate how many whole days we are shifting the event.
      // Anchor the OLD day to the event's EST-displayed date (what the user sees on the calendar),
      // not to the browser-local date of the underlying UTC timestamp. Otherwise, when the browser
      // timezone differs from EST, the cell the event is shown in and the locally-computed midnight
      // can fall on different calendar days, producing an off-by-one shift after drop.
      const oldAnchor = startOfDay(toEST(event.startTime || event.date));
      const newAnchor = startOfDay(newDate);
      const rawOffsetMs = newAnchor.getTime() - oldAnchor.getTime();
      // Round to whole days so DST transitions (±1 hour) cannot bleed into the offset.
      const dayOffsetMs = Math.round(rawOffsetMs / 86400000) * 86400000;

      // Shift startTime and endTime by the same offset to keep the time-of-day intact
      const newStartTime = event.startTime
        ? new Date(new Date(event.startTime).getTime() + dayOffsetMs).toISOString()
        : null;
      const newEndTime = event.endTime
        ? new Date(new Date(event.endTime).getTime() + dayOffsetMs).toISOString()
        : null;

      // Use shifted startTime as the canonical date so timezone conversion stays correct
      const newDateISO = newStartTime || new Date(new Date(event.date).getTime() + dayOffsetMs).toISOString();

      const body: Record<string, string | null> = { date: newDateISO };
      if (newStartTime) body.startTime = newStartTime;
      if (newEndTime) body.endTime = newEndTime;

      const res = await fetch(`/api/calendar-events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update event");
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "Event Moved", description: `Moved to ${format(newDate, "MMM d, yyyy")}` });
    } catch (err) {
      toast({ title: "Move Failed", description: "Could not move the event.", variant: "destructive" });
    }
  };

  const handleCreateEvent = () => {
    if (isSubmittingEventRef.current) return;
    if (!newEvent.startDate || !newEvent.startTime) {
      toast({
        title: "Missing Information",
        description: "Please fill in the date and time.",
        variant: "destructive",
      });
      return;
    }
    const validationError = validateBookingDateTime(
      newEvent.startDate,
      newEvent.startTime,
      newEvent.endDate,
      newEvent.endTime,
    );
    if (validationError) {
      toast({ title: "Invalid booking time", description: validationError, variant: "destructive" });
      return;
    }

    const eventTitle = newEvent.title
      || (newEvent.workJobNumber ? `INSTALL - ${newEvent.workJobNumber}` : `Installation on ${formatEST(fromEST(newEvent.startDate, newEvent.startTime), "MMM d, yyyy")}`);

    const startDateTime = fromEST(newEvent.startDate, newEvent.startTime);

    let endDateTime: Date;
    if (newEvent.duration) {
      const durationHours = parseFloat(newEvent.duration);
      endDateTime = new Date(startDateTime.getTime() + durationHours * 60 * 60 * 1000);
    } else if (newEvent.endDate && newEvent.endTime) {
      endDateTime = fromEST(newEvent.endDate, newEvent.endTime);
    } else {
      endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);
    }

    isSubmittingEventRef.current = true;
    createEventMutation.mutate({
      title: eventTitle,
      description: newEvent.description || undefined,
      jobDescription: newEvent.jobDescription || undefined,
      date: startDateTime.toISOString(),
      startTime: startDateTime.toISOString(),
      files: newEventFiles.length > 0 ? newEventFiles : undefined,
      customerName: newEvent.customerName || undefined,
      customerPhone: newEvent.customerPhone || undefined,
      customerEmail: newEvent.customerEmail || undefined,
      address: newEvent.address || undefined,
      endTime: endDateTime.toISOString(),
      workJobNumber: newEvent.workJobNumber || undefined,
    }, {
      onSettled: () => { isSubmittingEventRef.current = false; },
    });
  };

  const navigatePrev = () => {
    clearHighlight();
    switch (viewMode) {
      case "day":
        setCurrentDate(subDays(currentDate, 1));
        break;
      case "week":
      case "agenda":
        setCurrentDate(subWeeks(currentDate, 1));
        break;
      case "month":
        setCurrentDate(subMonths(currentDate, 1));
        break;
    }
  };

  const navigateNext = () => {
    clearHighlight();
    switch (viewMode) {
      case "day":
        setCurrentDate(addDays(currentDate, 1));
        break;
      case "week":
      case "agenda":
        setCurrentDate(addWeeks(currentDate, 1));
        break;
      case "month":
        setCurrentDate(addMonths(currentDate, 1));
        break;
    }
  };

  const getHeaderTitle = () => {
    switch (viewMode) {
      case "day":
        return formatEST(currentDate, "EEEE, MMMM d, yyyy");
      case "week":
      case "agenda": {
        const weekStart = startOfWeek(currentDate);
        const weekEnd = endOfWeek(currentDate);
        return `${formatEST(weekStart, "MMM d")} - ${formatEST(weekEnd, "MMM d, yyyy")}`;
      }
      case "month":
        return formatEST(currentDate, "MMMM yyyy");
    }
  };

  const getHeaderTitleShort = () => {
    switch (viewMode) {
      case "day":
        return formatEST(currentDate, "EEE, MMM d");
      case "week":
      case "agenda": {
        const weekStart = startOfWeek(currentDate);
        const weekEnd = endOfWeek(currentDate);
        return `${formatEST(weekStart, "MMM d")} - ${formatEST(weekEnd, "MMM d")}`;
      }
      case "month":
        return formatEST(currentDate, "MMM yyyy");
    }
  };

  if (error) {
    return (
      <div className="flex-1 p-4 sm:p-6">
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-5 sm:p-8 text-center">
            <CalendarIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold mb-2">Calendar Not Connected</h2>
            <p className="text-muted-foreground">
              Please connect your Google Calendar to view and manage events.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fToC = (f: number) => Math.round((f - 32) * 5 / 9);

  const getWeatherIcon = (iconCode: string, className: string = "h-5 w-5", withBg: boolean = false) => {
    let IconComp = Cloud;
    let colorClass = "text-slate-400";
    let bgClass = "bg-slate-100 dark:bg-slate-800";

    if (iconCode.includes("01")) {
      IconComp = Sun;
      colorClass = "text-amber-500 drop-shadow-[0_0_4px_rgba(245,158,11,0.5)]";
      bgClass = "bg-amber-50 dark:bg-amber-950/40";
    } else if (iconCode.includes("02") || iconCode.includes("03")) {
      IconComp = CloudSun;
      colorClass = "text-sky-400";
      bgClass = "bg-sky-50 dark:bg-sky-950/40";
    } else if (iconCode.includes("04")) {
      IconComp = Cloud;
      colorClass = "text-slate-500";
      bgClass = "bg-slate-100 dark:bg-slate-800";
    } else if (iconCode.includes("09")) {
      IconComp = CloudDrizzle;
      colorClass = "text-cyan-500 drop-shadow-[0_0_3px_rgba(6,182,212,0.4)]";
      bgClass = "bg-cyan-50 dark:bg-cyan-950/40";
    } else if (iconCode.includes("10")) {
      IconComp = CloudRain;
      colorClass = "text-blue-500 drop-shadow-[0_0_3px_rgba(59,130,246,0.4)]";
      bgClass = "bg-blue-50 dark:bg-blue-950/40";
    } else if (iconCode.includes("11")) {
      IconComp = CloudLightning;
      colorClass = "text-yellow-500 drop-shadow-[0_0_4px_rgba(234,179,8,0.5)]";
      bgClass = "bg-yellow-50 dark:bg-yellow-950/40";
    } else if (iconCode.includes("13")) {
      IconComp = CloudSnow;
      colorClass = "text-blue-300 drop-shadow-[0_0_3px_rgba(147,197,253,0.5)]";
      bgClass = "bg-blue-50 dark:bg-blue-950/40";
    }

    if (withBg) {
      return (
        <div className={`rounded-full p-1 ${bgClass} flex items-center justify-center`}>
          <IconComp className={`${className} ${colorClass}`} />
        </div>
      );
    }
    return <IconComp className={`${className} ${colorClass}`} />;
  };

  const weekForecast = (() => {
    if (!weatherData?.forecast?.length) return [];
    const forecastMap = new Map(weatherData.forecast.map(d => [d.date, d]));
    const today = new Date();
    const dayOfWeek = today.getDay();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - dayOfWeek);
    const todayForecast = weatherData.forecast[0];
    const currentAsFallback = todayForecast ? {
      ...todayForecast,
      tempHigh: weatherData.current?.temp ?? todayForecast.tempHigh,
      tempLow: todayForecast.tempLow,
      precipProb: weatherData.current?.precipProb ?? todayForecast.precipProb,
      humidity: weatherData.current?.humidity ?? todayForecast.humidity,
      windSpeed: weatherData.current?.windSpeed ?? todayForecast.windSpeed,
      summary: weatherData.current?.summary ?? todayForecast.summary,
      icon: weatherData.current?.icon ?? todayForecast.icon,
    } : null;
    const days: (typeof weatherData.forecast[0])[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      const key = d.toISOString().split("T")[0];
      const dayData = forecastMap.get(key);
      if (dayData) {
        days.push(dayData);
      } else if (currentAsFallback) {
        days.push({ ...currentAsFallback, date: key, dayOfWeek: d.toLocaleDateString('en-US', { weekday: 'short' }) });
      }
    }
    return days;
  })();

  const todayIndex = new Date().getDay();
  const [selectedForecastIdx, setSelectedForecastIdx] = useState<number>(todayIndex);
  const weekDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const selectedDayData = weekForecast[selectedForecastIdx];
  const isTodaySelected = selectedForecastIdx === todayIndex;
  const isPastDaySelected = selectedForecastIdx < todayIndex;
  const displayWeather = isTodaySelected || !selectedDayData
    ? {
        icon: weatherData?.current?.icon ?? "01d",
        temp: weatherData?.current?.temp ?? 0,
        precipProb: weatherData?.current?.precipProb ?? 0,
        humidity: weatherData?.current?.humidity ?? 0,
        windSpeed: weatherData?.current?.windSpeed ?? 0,
        summary: weatherData?.current?.summary ?? "",
        label: new Date().toLocaleDateString("en-US", { weekday: "long", hour: "numeric", minute: "2-digit", hour12: true }),
        isPast: false,
      }
    : {
        icon: selectedDayData.icon,
        temp: selectedDayData.tempHigh,
        precipProb: selectedDayData.precipProb,
        humidity: null as number | null,
        windSpeed: selectedDayData.windSpeed ?? 0,
        summary: selectedDayData.summary,
        label: new Date(selectedDayData.date + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" }),
        isPast: isPastDaySelected,
      };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Consolidated Toolbar Row */}
      <div className="border-b bg-background shrink-0">
        <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 overflow-hidden" data-testid="calendar-toolbar">
          <div className="flex items-center gap-1 sm:gap-3 min-w-0">
            <div className="hidden sm:flex items-center gap-2 shrink-0">
              <CalendarIcon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              <span className="hidden md:inline text-sm font-semibold text-foreground">Install Calendar</span>
              <span className="hidden md:inline text-xs text-muted-foreground">|</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs shrink-0"
              onClick={() => { setCurrentDate(toEST(new Date())); clearHighlight(); }}
              data-testid="button-today"
            >
              Today
            </Button>
            <div className="flex items-center justify-center shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-7 shrink-0" onClick={navigatePrev} data-testid="button-prev">
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <h2 className="text-sm font-semibold whitespace-nowrap text-center px-1.5" data-testid="text-calendar-title">
                <span className="sm:hidden">{getHeaderTitleShort()}</span>
                <span className="hidden sm:inline">{getHeaderTitle()}</span>
              </h2>
              <Button variant="ghost" size="icon" className="h-8 w-7 shrink-0" onClick={navigateNext} data-testid="button-next">
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Search bar — centered, flexible width */}
          <div ref={searchContainerRef} className="relative hidden md:flex flex-1 justify-center min-w-0 px-2">
            <div className="relative w-full max-w-[16rem] lg:max-w-[18rem] min-w-[8rem]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.length >= 4) setSearchOpen(true);
                  else setSearchOpen(false);
                }}
                onFocus={() => { if (searchQuery.length >= 4) setSearchOpen(true); }}
                placeholder="Find booking…"
                className="h-8 pl-8 pr-2 text-xs w-full"
                data-testid="input-calendar-search"
              />
            </div>
            {searchOpen && (
              <div className="absolute top-full mt-1 w-72 bg-popover border rounded-md shadow-lg z-50 overflow-hidden">
                {debouncedSearchQuery.length < 4 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Type at least 4 characters…</div>
                ) : searchResults.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">No bookings found.</div>
                ) : (
                  <div className="max-h-64 overflow-y-auto py-1">
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-xs hover:bg-muted/60 transition-colors flex flex-col gap-0.5"
                        onClick={() => handleSearchResultSelect(result)}
                        data-testid={`search-result-${result.id}`}
                      >
                        <span className="font-semibold leading-snug truncate">{result.title}</span>
                        <span className="text-muted-foreground">
                          {result.workJobNumber && <span className="mr-2">{result.workJobNumber}</span>}
                          {result.customerName && <span className="mr-2">{result.customerName}</span>}
                          <span className="tabular-nums">{(() => {
                            const src = result.startTime || result.date || "";
                            const dt = new Date(src);
                            if (isNaN(dt.getTime())) return src;
                            const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
                            const dd = String(dt.getUTCDate()).padStart(2, "0");
                            const yyyy = dt.getUTCFullYear();
                            const hh = String(dt.getUTCHours()).padStart(2, "0");
                            const min = String(dt.getUTCMinutes()).padStart(2, "0");
                            return `${mm} ${dd} ${yyyy} ${hh}:${min}`;
                          })()}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0 justify-end ml-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  data-testid="button-refresh-calendar"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Refresh Calendar</p></TooltipContent>
            </Tooltip>
            {canCreateBooking && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setIsAIDialogOpen(true)}
                      variant="outline"
                      size="sm"
                      className="h-8 px-2"
                      data-testid="button-ai-scheduler-toolbar"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span className="hidden xl:inline ml-1 text-xs">AI Scheduling</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>AI-Powered Scheduling</p></TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      className="h-8 px-2"
                      onClick={() => {
                        // Default to 6:00 AM EST today (or tomorrow if it's already past 6 AM and would conflict with no-past-times rule)
                        const nowEST = toEST(new Date());
                        const startEST = new Date(nowEST);
                        startEST.setHours(6, 0, 0, 0);
                        if (startEST.getTime() < nowEST.getTime()) {
                          startEST.setDate(startEST.getDate() + 1);
                          startEST.setHours(6, 0, 0, 0);
                        }
                        const endEST = new Date(startEST.getTime() + 2 * 60 * 60 * 1000);
                        const dateStr = `${startEST.getFullYear()}-${String(startEST.getMonth() + 1).padStart(2, "0")}-${String(startEST.getDate()).padStart(2, "0")}`;
                        const startTimeStr = `${String(startEST.getHours()).padStart(2, "0")}:${String(startEST.getMinutes()).padStart(2, "0")}`;
                        const endDateStr = `${endEST.getFullYear()}-${String(endEST.getMonth() + 1).padStart(2, "0")}-${String(endEST.getDate()).padStart(2, "0")}`;
                        const endTimeStr = `${String(endEST.getHours()).padStart(2, "0")}:${String(endEST.getMinutes()).padStart(2, "0")}`;
                        setNewEvent(prev => ({ ...prev, startDate: dateStr, startTime: startTimeStr, endDate: endDateStr, endTime: endTimeStr, duration: "2" }));
                        setIsCreateOpen(true);
                      }}
                      data-testid="button-create-event-toolbar"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline ml-1 text-xs">Create</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>Create New Event</p></TooltipContent>
                </Tooltip>
              </>
            )}
            {(isAdmin || isInstallManager) && (
              <Popover open={exportOpen} onOpenChange={setExportOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 px-2" data-testid="button-export-calendar">
                    <Download className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="end">
                  <div className="px-3 pt-3 pb-1.5">
                    <p className="text-sm font-medium">Export Bookings</p>
                  </div>
                  <div className="px-1.5 pb-1.5">
                    <button
                      className={`flex items-center gap-2.5 w-full text-left cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${exportStatuses.size === 0 ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover-elevate'}`}
                      onClick={() => setExportStatuses(new Set())}
                      data-testid="export-status-all"
                    >
                      {exportStatuses.size === 0 && <Check className="h-3.5 w-3.5 shrink-0" />}
                      {exportStatuses.size > 0 && <div className="w-3.5" />}
                      All
                    </button>
                    {[
                      { key: "SCHEDULED", label: "Scheduled", color: activeColors.SCHEDULED },
                      { key: "CONFIRMED", label: "Confirmed", color: activeColors.CONFIRMED },
                      { key: "SURVEY", label: "Survey", color: activeColors.SURVEY },
                      { key: "NEEDS_RESCHEDULE", label: "Reschedule", color: activeColors.NEEDS_RESCHEDULE },
                      { key: "ISSUE", label: "Issues", color: activeColors.ISSUE },
                      { key: "COMPLETED", label: "Completed", color: activeColors.COMPLETED },
                    ].map((item) => (
                      <button
                        key={item.key}
                        className={`flex items-center gap-2.5 w-full text-left cursor-pointer py-1.5 px-2 rounded-md text-sm transition-colors ${exportStatuses.has(item.key) ? 'bg-primary/10 text-primary font-medium' : 'text-foreground hover-elevate'}`}
                        onClick={() => toggleExportStatus(item.key)}
                        data-testid={`export-status-${item.key.toLowerCase()}`}
                      >
                        {exportStatuses.has(item.key) ? <Check className="h-3.5 w-3.5 shrink-0" /> : <div className="w-3.5" />}
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-1.5 border-t">
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleExportCalendar}
                      disabled={isExporting}
                      data-testid="button-export-download"
                    >
                      {isExporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                      {exportStatuses.size === 0 ? "Export All" : `Export ${exportStatuses.size} Selected`}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            <div className="hidden lg:flex items-center gap-0.5 border rounded-md h-8 p-0.5 shrink-0">
              <Button variant={viewMode === "day" ? "secondary" : "ghost"} size="sm" className="h-7 px-2.5 text-xs rounded-sm" onClick={() => { clearHighlight(); setViewMode("day"); }} data-testid="button-view-day">Day</Button>
              <Button variant={viewMode === "week" ? "secondary" : "ghost"} size="sm" className="h-7 px-2.5 text-xs rounded-sm" onClick={() => { clearHighlight(); setViewMode("week"); }} data-testid="button-view-week">Week</Button>
              <Button variant={viewMode === "agenda" ? "secondary" : "ghost"} size="sm" className="h-7 px-2.5 text-xs rounded-sm" onClick={() => { clearHighlight(); setViewMode("agenda"); }} data-testid="button-view-agenda">Agenda</Button>
              <Button variant={viewMode === "month" ? "secondary" : "ghost"} size="sm" className="h-7 px-2.5 text-xs rounded-sm" onClick={() => { clearHighlight(); setViewMode("month"); }} data-testid="button-view-month">Month</Button>
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-7 px-2.5 text-xs rounded-sm" onClick={() => { clearHighlight(); setViewMode("list"); }} data-testid="button-view-list">List</Button>
            </div>
          </div>
        </div>
        {/* Mobile-only view mode switcher row */}
        <div className="lg:hidden flex items-center justify-between border-t px-2 py-1 gap-1">
          <div className="flex items-center gap-0.5 border rounded-md h-8 p-0.5 flex-1">
            <Button variant={viewMode === "day" ? "secondary" : "ghost"} size="sm" className="h-7 flex-1 text-xs px-1 rounded-sm" onClick={() => { clearHighlight(); setViewMode("day"); }} data-testid="button-view-day-mobile">Day</Button>
            <Button variant={viewMode === "week" ? "secondary" : "ghost"} size="sm" className="h-7 flex-1 text-xs px-1 rounded-sm" onClick={() => { clearHighlight(); setViewMode("week"); }} data-testid="button-view-week-mobile">Week</Button>
            <Button variant={viewMode === "agenda" ? "secondary" : "ghost"} size="sm" className="h-7 flex-1 text-xs px-1 rounded-sm" onClick={() => { clearHighlight(); setViewMode("agenda"); }} data-testid="button-view-agenda-mobile">Agenda</Button>
            <Button variant={viewMode === "month" ? "secondary" : "ghost"} size="sm" className="h-7 flex-1 text-xs px-1 rounded-sm" onClick={() => { clearHighlight(); setViewMode("month"); }} data-testid="button-view-month-mobile">Month</Button>
            <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="sm" className="h-7 flex-1 text-xs px-1 rounded-sm" onClick={() => { clearHighlight(); setViewMode("list"); }} data-testid="button-view-list-mobile">List</Button>
          </div>
        </div>
      </div>

      {/* Slim Weather Strip */}
      {weatherData && (
        <div className="border-b bg-muted/20 shrink-0" data-testid="current-weather-section">
          <div
            className="flex items-center justify-between gap-3 px-3 sm:px-4 py-1.5 cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={() => setWeatherExpanded(!weatherExpanded)}
          >
            <div className="flex items-center gap-3 min-w-0">
              {getWeatherIcon(displayWeather.icon, "h-6 w-6 shrink-0")}
              <span className="text-base font-semibold" data-testid="text-current-temp">{displayWeather.temp}&deg;F</span>
              <span className="text-sm text-muted-foreground hidden sm:inline">
                {displayWeather.precipProb}% precip &middot; {displayWeather.windSpeed} mph wind
              </span>
              <span className="text-sm text-muted-foreground capitalize truncate">{displayWeather.summary}{displayWeather.isPast ? " (est.)" : ""}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {weekForecast.length > 0 && (
                <div className="hidden md:flex items-center gap-1">
                  {weekForecast.map((day, idx) => {
                    const isActive = idx === selectedForecastIdx;
                    return (
                      <button
                        key={`strip-${day.date}-${idx}`}
                        onClick={(e) => { e.stopPropagation(); setSelectedForecastIdx(idx); }}
                        className={`flex flex-col items-center px-2 py-0.5 rounded text-xs transition-colors ${isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
                        data-testid={`forecast-day-${idx}`}
                      >
                        <span className="font-medium">{idx === todayIndex ? "Today" : weekDayLabels[idx]}</span>
                        <span className="font-semibold">{day.tempHigh}&deg;</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${weatherExpanded ? "rotate-180" : ""}`} />
            </div>
          </div>

          {weatherExpanded && weekForecast.length > 0 && (
            <div className="border-t px-3 sm:px-4 py-2" data-testid="forecast-section">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 sm:grid sm:grid-cols-7 sm:overflow-visible sm:pb-0">
                {weekForecast.map((day, idx) => {
                  const isTodayDay = idx === todayIndex;
                  const dayLabel = isTodayDay ? "Today" : weekDayLabels[idx];
                  const isSelected = idx === selectedForecastIdx;
                  const isPast = idx < todayIndex;
                  return (
                    <button
                      key={day.date}
                      onClick={() => setSelectedForecastIdx(idx)}
                      className={`shrink-0 w-[78px] sm:w-auto flex items-center justify-between gap-1 py-1.5 px-2 rounded-lg cursor-pointer transition-all ${
                        isSelected 
                          ? "bg-accent ring-1 ring-primary/20 shadow-sm" 
                          : "hover:bg-muted/40"
                      } ${isPast ? "opacity-50" : ""}`}
                      data-testid={`forecast-card-${idx}`}
                    >
                      <div className="flex flex-col items-start gap-0.5 min-w-0">
                        <span className={`text-[11px] ${isSelected ? "font-bold text-primary" : "font-medium"}`}>{dayLabel}</span>
                        <div className="text-sm leading-tight">
                          <span className="font-bold text-amber-600 dark:text-amber-400">{day.tempHigh}&deg;</span>
                          <span className="text-muted-foreground">/{day.tempLow}&deg;</span>
                        </div>
                        <div className="flex items-center gap-0.5 text-[10px] text-blue-500">
                          <Droplets className="h-2.5 w-2.5" />
                          <span className="font-medium">{day.precipProb}%</span>
                        </div>
                        <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Wind className="h-2.5 w-2.5" />
                          <span className="font-medium">{day.windSpeed ?? 0}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {getWeatherIcon(day.icon, "h-7 w-7", true)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Filters — horizontal strip below weather */}
      <div className="border-b bg-background shrink-0">
        <div className="flex items-center justify-between px-2 sm:px-3">
          <div className="flex-1 min-w-0">
            <StatusFilterBar
              events={viewEvents}
              currentDate={currentDate}
              viewMode={viewMode}
              statusFilter={statusFilter}
              onFilterChange={setStatusFilter}
              filterColors={activeColors}
              isSuperAdmin={user?.role === "super_admin"}
              canViewTimeOff={canViewTimeOff}
            />
          </div>
          {assignableUsers && assignableUsers.length > 0 && (
            <div className="shrink-0 py-2">
              <Popover open={userFilterOpen} onOpenChange={setUserFilterOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    role="combobox"
                    aria-expanded={userFilterOpen}
                    className="w-[130px] sm:w-[150px] justify-between text-xs h-8"
                    data-testid="user-filter-dropdown"
                  >
                    <Users className="h-3.5 w-3.5 mr-1 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {userFilter === null
                        ? "All Users"
                        : assignableUsers.find((u: { id: number; name: string }) => u.id === userFilter)?.name || "All Users"}
                    </span>
                    <ChevronsUpDown className="ml-auto h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Search users..." data-testid="user-filter-search" />
                    <CommandList>
                      <CommandEmpty>No user found.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="All Users"
                          onSelect={() => { setUserFilter(null); setUserFilterOpen(false); }}
                          data-testid="user-filter-all"
                        >
                          <Check className={`mr-2 h-3.5 w-3.5 ${userFilter === null ? "opacity-100" : "opacity-0"}`} />
                          All Users
                        </CommandItem>
                        {assignableUsers.map((u: { id: number; name: string }) => (
                          <CommandItem
                            key={u.id}
                            value={u.name}
                            onSelect={() => { setUserFilter(u.id); setUserFilterOpen(false); }}
                            data-testid={`user-filter-${u.id}`}
                          >
                            <Check className={`mr-2 h-3.5 w-3.5 ${userFilter === u.id ? "opacity-100" : "opacity-0"}`} />
                            {u.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {/* Full-Width Calendar */}
      <main className={`flex-1 min-h-0 ${viewMode === "list" ? "overflow-hidden" : "overflow-y-auto"} overflow-x-hidden`}>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <PinchZoomWrapper className="h-full" minScale={1} maxScale={3}>
            {viewMode === "month" && (
              <MonthView
                currentDate={currentDate}
                events={viewEvents}
                onEventClick={handleEventClick}
                canCreate={canCreateBooking}
                onDayClick={(date) => {
                  setMobileSelectedDate(date);
                  // On desktop (>=640px), open create dialog if allowed
                  if (window.innerWidth >= 640 && canCreateBooking) {
                    // Default to 6:00 AM – 8:00 AM on the clicked date
                    const dateStr = format(date, "yyyy-MM-dd");
                    setNewEvent(prev => ({ ...prev, startDate: dateStr, endDate: dateStr, startTime: "06:00", endTime: "08:00", duration: "2" }));
                    setIsCreateOpen(true);
                  }
                }}
                statusFilter={statusFilter}
                filterColors={activeColors}
                onEventDrop={canCreateBooking ? handleEventDrop : undefined}
                highlightedEventId={highlightedEventId}
              />
            )}
            {viewMode === "week" && (
              <WeekView
                currentDate={currentDate}
                events={viewEvents}
                onEventClick={handleEventClick}
                statusFilter={statusFilter}
                filterColors={activeColors}
                highlightedEventId={highlightedEventId}
              />
            )}
            {viewMode === "day" && (
              <DayView
                currentDate={currentDate}
                events={viewEvents}
                onEventClick={handleEventClick}
                statusFilter={statusFilter}
                filterColors={activeColors}
                highlightedEventId={highlightedEventId}
              />
            )}
            {viewMode === "list" && (
              <ListView
                currentDate={currentDate}
                events={viewEvents}
                onEventClick={handleEventClick}
                statusFilter={statusFilter}
                filterColors={activeColors}
                highlightedEventId={highlightedEventId}
              />
            )}
            {viewMode === "agenda" && (
              <AgendaView
                currentDate={currentDate}
                events={viewEvents}
                onEventClick={handleEventClick}
                statusFilter={statusFilter}
                filterColors={activeColors}
                highlightedEventId={highlightedEventId}
              />
            )}
          </PinchZoomWrapper>
        )}
      </main>

      {/* Mobile-only: selected day events list (shown below calendar in month view) */}
      {viewMode === "month" && (
        <div className="sm:hidden border-t bg-background flex-shrink-0 max-h-48 overflow-y-auto">
          <div className="px-3 py-2 flex items-center justify-between border-b sticky top-0 bg-background z-10">
            <span className="text-xs font-semibold text-muted-foreground">
              {format(mobileSelectedDate, "EEE, MMM d")}
            </span>
            {canCreateBooking && (
              <button
                className="text-xs text-primary font-semibold py-0.5 px-2 rounded hover:bg-primary/10 transition-colors"
                onClick={() => {
                  // Default to 6:00 AM – 8:00 AM on the selected date
                  const dateStr = format(mobileSelectedDate, "yyyy-MM-dd");
                  setNewEvent(prev => ({ ...prev, startDate: dateStr, endDate: dateStr, startTime: "06:00", endTime: "08:00", duration: "2" }));
                  setIsCreateOpen(true);
                }}
                data-testid="button-mobile-add-event"
              >
                + Add
              </button>
            )}
          </div>
          {(() => {
            const dayEvts = filteredEvents.filter(e => e.startDate === format(mobileSelectedDate, "yyyy-MM-dd"));
            if (dayEvts.length === 0) {
              return (
                <div className="px-3 py-3 text-xs text-muted-foreground italic">No bookings for this day.</div>
              );
            }
            return dayEvts.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")).map(event => {
              const statusColor = getStatusColor(event.status, event.hasIssue, activeColors);
              return (
                <button
                  key={event.id}
                  className="w-full text-left px-3 py-2 border-b last:border-b-0 flex items-center gap-2 hover:bg-muted/30 transition-colors"
                  onClick={() => { setSelectedEvent(event); setIsDetailDialogOpen(true); }}
                  data-testid={`mobile-day-event-${event.id}`}
                >
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium truncate">{event.title}</div>
                    {event.startTime && (
                      <div className="text-[10px] text-muted-foreground">
                        {formatEST(event.startTime, "h:mm a")}
                        {event.endTime ? ` – ${formatEST(event.endTime, "h:mm a")}` : ""}
                      </div>
                    )}
                  </div>
                  {(event.assignedUserNames ?? []).length > 0 && (
                    <span className="text-[10px] text-black dark:text-white truncate max-w-[80px]">
                      {shortNames(event.assignedUserNames!)}
                    </span>
                  )}
                </button>
              );
            });
          })()}
        </div>
      )}

      {/* Event Detail Dialog — on xl screens only opens via explicit button, on smaller screens opens automatically */}
      <EventDetailDialog
        event={selectedEvent}
        onClose={() => { setSelectedEvent(null); setIsDetailDialogOpen(false); }}
        onDelete={(id) => deleteEventMutation.mutate(id)}
        isDeleting={deleteEventMutation.isPending}
        onEventUpdated={(updatedEvent) => setSelectedEvent(updatedEvent)}
        forceOpen={isDetailDialogOpen}
      />

      {/* AI Calendar Dialog */}
      <AICalendarDialog
        open={isAIDialogOpen}
        onOpenChange={setIsAIDialogOpen}
      />
      <IntakeDialog
        open={isIntakeDialogOpen}
        onOpenChange={setIsIntakeDialogOpen}
      />

      <AvailabilityDialog
        open={isAvailabilityOpen}
        onOpenChange={setIsAvailabilityOpen}
        isAdmin={isAdmin || isInstallManager}
        assignableUsers={assignableUsers}
      />

      <Dialog
        open={!!timeOffDetail}
        onOpenChange={(o) => !o && setTimeOffDetail(null)}
      >
        <DialogContent
          className="w-[95vw] sm:max-w-md"
          data-testid="dialog-timeoff-detail"
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarOff className="h-5 w-5 text-yellow-500" />
              Unavailable
            </DialogTitle>
            <DialogDescription>
              {timeOffDetail?.displayName ||
                timeOffDetail?.user?.name ||
                timeOffDetail?.user?.email ||
                "Team member"}{" "}
              is marked as unavailable.
            </DialogDescription>
          </DialogHeader>
          {timeOffDetail && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Person</span>
                <span className="font-medium text-right" data-testid="text-timeoff-person">
                  {timeOffDetail.displayName ||
                    timeOffDetail.user?.name ||
                    timeOffDetail.user?.email ||
                    "Team member"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="secondary" data-testid="badge-timeoff-type">
                  {TIMEOFF_CATEGORY_LABEL[timeOffDetail.category] || "Unavailable"}
                </Badge>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium text-right" data-testid="text-timeoff-duration">
                  {timeOffDetail.allDay ? "Full Day" : "Half Day"}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">When</span>
                <span className="font-medium text-right" data-testid="text-timeoff-when">
                  {timeOffDetail.allDay
                    ? formatEST(timeOffDetail.startAt, "EEE, MMM d, yyyy") ===
                      formatEST(timeOffDetail.endAt, "EEE, MMM d, yyyy")
                      ? formatEST(timeOffDetail.startAt, "EEE, MMM d, yyyy")
                      : `${formatEST(timeOffDetail.startAt, "MMM d")} – ${formatEST(timeOffDetail.endAt, "MMM d, yyyy")}`
                    : `${formatEST(timeOffDetail.startAt, "EEE, MMM d")} · ${formatEST(timeOffDetail.startAt, "h:mm a")} – ${formatEST(timeOffDetail.endAt, "h:mm a")}`}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground">Reason</span>
                <p className="font-medium" data-testid="text-timeoff-reason">
                  {timeOffDetail.reason?.trim() ||
                    TIMEOFF_CATEGORY_LABEL[timeOffDetail.category] ||
                    "Unavailable"}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {isOwnerAdmin && (
        <Dialog open={isSenderSetupOpen} onOpenChange={setIsSenderSetupOpen}>
          <DialogContent
            className="w-[95vw] sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
            data-testid="dialog-sender-setup"
          >
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                Email Sender Setup
              </DialogTitle>
              <DialogDescription>
                Set up your sender email for notifications sent from your dashboard.
                A verification email will be sent to confirm your sender address.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4 overflow-y-auto flex-1 px-1 -mx-1">
              {user?.senderVerified ? (
                <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800" data-testid="sender-verified-badge">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">Sender Email Verified</p>
                    <p className="text-xs text-green-600 dark:text-green-400">{user.senderFromEmail}</p>
                  </div>
                </div>
              ) : user?.senderFromEmail ? (
                <div className="flex items-center justify-between p-3 rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800" data-testid="sender-pending-badge">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Verification Pending</p>
                      <p className="text-xs text-yellow-600 dark:text-yellow-400">Check your inbox at {user.senderFromEmail} for the verification link.</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/sender/resend-verification", { method: "POST", credentials: "include" });
                        const data = await res.json();
                        if (data.success) {
                          toast({ title: "Verification Resent", description: "A new verification email has been sent to your inbox." });
                        } else {
                          toast({ title: "Resend Failed", description: data.error || "Could not resend verification.", variant: "destructive" });
                        }
                      } catch {
                        toast({ title: "Error", description: "Failed to resend verification email.", variant: "destructive" });
                      }
                    }}
                    data-testid="button-resend-verification"
                  >
                    <RefreshCw className="h-3 w-3 mr-1" /> Resend
                  </Button>
                </div>
              ) : null}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sender-firstName" className="text-sm font-medium">
                    First Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sender-firstName"
                    value={senderForm.firstName}
                    onChange={e => setSenderForm(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Your first name"
                    data-testid="input-sender-first-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sender-nickname" className="text-sm font-medium">
                    Nickname <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sender-nickname"
                    value={senderForm.nickname}
                    onChange={e => setSenderForm(prev => ({ ...prev, nickname: e.target.value }))}
                    placeholder="e.g., My Business Notifications"
                    data-testid="input-sender-nickname"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sender-fromEmail" className="text-sm font-medium">
                    From Email Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sender-fromEmail"
                    type="email"
                    value={senderForm.fromEmail}
                    onChange={e => setSenderForm(prev => ({ ...prev, fromEmail: e.target.value }))}
                    placeholder="notifications@yourdomain.com"
                    data-testid="input-sender-from-email"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sender-replyTo" className="text-sm font-medium">
                    Reply-To Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sender-replyTo"
                    type="email"
                    value={senderForm.replyTo}
                    onChange={e => setSenderForm(prev => ({ ...prev, replyTo: e.target.value }))}
                    placeholder="support@yourdomain.com"
                    data-testid="input-sender-reply-to"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="sender-companyAddress" className="text-sm font-medium">
                  Company Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sender-companyAddress"
                  value={senderForm.companyAddress}
                  onChange={e => setSenderForm(prev => ({ ...prev, companyAddress: e.target.value }))}
                  placeholder="123 Main Street"
                  data-testid="input-sender-company-address"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="sender-city" className="text-sm font-medium">
                    City <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sender-city"
                    value={senderForm.city}
                    onChange={e => setSenderForm(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="City name"
                    data-testid="input-sender-city"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sender-country" className="text-sm font-medium">
                    Country <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="sender-country"
                    value={senderForm.country}
                    onChange={e => setSenderForm(prev => ({ ...prev, country: e.target.value }))}
                    placeholder="e.g., US, IN, UK"
                    data-testid="input-sender-country"
                  />
                </div>
              </div>
            </div>
            <DialogFooter className="flex-shrink-0">
              {user?.senderFromEmail && (
                <Button variant="outline" onClick={() => setIsSenderSetupOpen(false)} data-testid="button-sender-setup-cancel">
                  Close
                </Button>
              )}
              {!user?.senderVerified && (
                <Button onClick={handleSenderSetupSubmit} disabled={senderSetupLoading} data-testid="button-sender-setup-submit">
                  {senderSetupLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {user?.senderFromEmail ? "Update & Verify" : "Submit & Verify"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Event Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Create New Event</DialogTitle>
            <DialogDescription>
              Add a new event to your Install Calendar
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 overflow-y-auto flex-1 px-1 -mx-1">
                  <div className="space-y-2">
                    <Label>Attachments (PDFs, images)</Label>
                    <p className="text-xs text-muted-foreground">Upload a work order or document to auto-fill the form fields below</p>
                    <input
                      ref={newEventFileInputRef}
                      type="file"
                      accept=".pdf,image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files.length > 0) {
                          handleFileUploadAndExtract(e.target.files);
                          e.target.value = "";
                        }
                      }}
                      data-testid="input-event-files"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => newEventFileInputRef.current?.click()}
                      disabled={isExtracting}
                      data-testid="button-add-files"
                    >
                      {isExtracting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Reading file...
                        </>
                      ) : (
                        <>
                          <FileText className="h-4 w-4 mr-2" />
                          Add Files
                        </>
                      )}
                    </Button>
                    {newEventFiles.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {newEventFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                            <span className="truncate flex-1">{file.name}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => setNewEventFiles(prev => prev.filter((_, i) => i !== index))}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    {isExtracting && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 rounded p-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Analyzing document and extracting data...
                      </div>
                    )}
                  </div>
                  {woExistingEvent && (
                    <div className="flex items-start gap-2 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-600 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300" data-testid="warning-wo-duplicate">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                      <span>
                        Work order already exists (
                        <button
                          type="button"
                          className="underline font-medium hover:text-yellow-900 dark:hover:text-yellow-100"
                          onClick={() => {
                            setIsCreateOpen(false);
                            resetNewEvent();
                            const existing = filteredEvents?.find((e: any) => e.id === woExistingEvent.eventId);
                            if (existing) { setSelectedEvent(existing); setIsDetailDialogOpen(true); }
                          }}
                        >
                          event #{woExistingEvent.eventId}
                        </button>
                        ). A letter suffix will be appended automatically (e.g. 12345A).
                      </span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="title">Event Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Installation at 123 Main St"
                      value={newEvent.title}
                      onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                      data-testid="input-event-title"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date</Label>
                      <Input
                        id="startDate"
                        type="date"
                        min={todayDateStr}
                        value={newEvent.startDate}
                        onChange={(e) => setNewEvent({ ...newEvent, startDate: e.target.value })}
                        data-testid="input-start-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date</Label>
                      <Input
                        id="endDate"
                        type="date"
                        min={newEvent.startDate || todayDateStr}
                        value={newEvent.endDate}
                        onChange={(e) => setNewEvent({ ...newEvent, endDate: e.target.value, duration: "" })}
                        data-testid="input-end-date"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Duration</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={newEvent.duration}
                        onChange={(e) => {
                          const dur = e.target.value;
                          let endDate = newEvent.endDate;
                          let endTime = newEvent.endTime;
                          if (dur && newEvent.startDate && newEvent.startTime) {
                            const start = fromEST(newEvent.startDate, newEvent.startTime);
                            const end = new Date(start.getTime() + parseFloat(dur) * 60 * 60 * 1000);
                            const endEST = toEST(end);
                            endDate = `${endEST.getFullYear()}-${String(endEST.getMonth() + 1).padStart(2, "0")}-${String(endEST.getDate()).padStart(2, "0")}`;
                            endTime = `${String(endEST.getHours()).padStart(2, "0")}:${String(endEST.getMinutes()).padStart(2, "0")}`;
                          }
                          setNewEvent({ 
                            ...newEvent, 
                            duration: dur,
                            endDate,
                            endTime
                          });
                        }}
                        data-testid="select-duration"
                      >
                        <option value="">Select...</option>
                        {DURATION_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 items-end">
                    <div className="space-y-2">
                      <Label>Start Time</Label>
                      <TimePickerSelect
                        value={newEvent.startTime}
                        onChange={(startTime) => {
                          let endDate = newEvent.endDate;
                          let endTime = newEvent.endTime;
                          if (newEvent.duration && newEvent.startDate && startTime) {
                            const start = fromEST(newEvent.startDate, startTime);
                            const end = new Date(start.getTime() + parseFloat(newEvent.duration) * 60 * 60 * 1000);
                            const endEST = toEST(end);
                            endDate = `${endEST.getFullYear()}-${String(endEST.getMonth() + 1).padStart(2, "0")}-${String(endEST.getDate()).padStart(2, "0")}`;
                            endTime = `${String(endEST.getHours()).padStart(2, "0")}:${String(endEST.getMinutes()).padStart(2, "0")}`;
                          }
                          setNewEvent({ ...newEvent, startTime, endDate, endTime });
                        }}
                        data-testid="input-start-time"
                      />
                    </div>
                    <div className="flex items-center justify-center text-muted-foreground text-lg font-light hidden sm:flex pb-2">—</div>
                    <div className="space-y-2">
                      <Label>End Time</Label>
                      <TimePickerSelect
                        value={newEvent.endTime}
                        onChange={(endTime) => setNewEvent({ ...newEvent, endTime, duration: "" })}
                        data-testid="input-end-time"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="description">Notes (optional)</Label>
                      <Textarea
                        id="description"
                        placeholder="Add any notes or details..."
                        rows={2}
                        value={newEvent.description}
                        onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                        data-testid="input-event-description"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="jobDescription">Job Description (optional)</Label>
                      <Textarea
                        id="jobDescription"
                        placeholder="Describe the job/installation details..."
                        rows={2}
                        value={newEvent.jobDescription}
                        onChange={(e) => setNewEvent({ ...newEvent, jobDescription: e.target.value })}
                        data-testid="input-job-description"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="customerName">Customer Name</Label>
                      <Input
                        id="customerName"
                        placeholder="e.g., John Smith"
                        value={newEvent.customerName}
                        onChange={(e) => setNewEvent({ ...newEvent, customerName: e.target.value })}
                        data-testid="input-customer-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerPhone">Phone</Label>
                      <Input
                        id="customerPhone"
                        type="tel"
                        placeholder="e.g., (555) 123-4567"
                        value={newEvent.customerPhone}
                        onChange={(e) => setNewEvent({ ...newEvent, customerPhone: e.target.value })}
                        data-testid="input-customer-phone"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="customerEmail">Email</Label>
                      <Input
                        id="customerEmail"
                        type="email"
                        placeholder="e.g., customer@example.com"
                        value={newEvent.customerEmail}
                        onChange={(e) => setNewEvent({ ...newEvent, customerEmail: e.target.value })}
                        data-testid="input-customer-email"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="eventAddress">Address</Label>
                    <Input
                      id="eventAddress"
                      placeholder="e.g., 100 Binney St, Cambridge, MA 02142"
                      value={newEvent.address}
                      onChange={(e) => setNewEvent({ ...newEvent, address: e.target.value })}
                      data-testid="input-event-address"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  {!isExtracting && (
                    <Button 
                      type="button"
                      onClick={handleCreateEvent}
                      disabled={createEventMutation.isPending || isSubmittingEventRef.current}
                      data-testid="button-submit-event"
                    >
                      {createEventMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Creating...
                        </>
                      ) : (
                        "Save"
                      )}
                    </Button>
                  )}
                </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTagsOpen} onOpenChange={(open) => { setIsTagsOpen(open); if (!open) { setIsTagsEditing(false); setEditingTagId(null); setEditingTagType(null); setNewTagName(""); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Tags
            </DialogTitle>
            <DialogDescription>
              {isSuperAdmin
                ? "Manage global tags visible to all owners and users"
                : "Global tags are available to everyone. You can also add your own custom tags below."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 overflow-y-auto flex-1 pr-1">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Global Tags</h4>
                {isSuperAdmin && (
                  <span className="text-xs text-muted-foreground">{globalTags.length} tags</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2" data-testid="global-tags-list">
                {globalTags.map((tag) => (
                  <Badge
                    key={`global-${tag.id}`}
                    variant="outline"
                    className="px-3 py-1.5 text-sm font-medium border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 flex items-center gap-1"
                    data-testid={`tag-badge-global-${tag.id}`}
                  >
                    {editingTagId === tag.id && editingTagType === "global" ? (
                      <input
                        className="bg-transparent border-none outline-none text-sm w-24"
                        defaultValue={tag.name}
                        autoFocus
                        onBlur={(e) => {
                          const newName = e.target.value.trim();
                          if (newName && newName !== tag.name) {
                            updateGlobalTagMutation.mutate({ id: tag.id, data: { name: newName } });
                          } else {
                            setEditingTagId(null); setEditingTagType(null);
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const newName = (e.target as HTMLInputElement).value.trim();
                            if (newName && newName !== tag.name) {
                              updateGlobalTagMutation.mutate({ id: tag.id, data: { name: newName } });
                            } else {
                              setEditingTagId(null); setEditingTagType(null);
                            }
                          } else if (e.key === "Escape") {
                            setEditingTagId(null); setEditingTagType(null);
                          }
                        }}
                        data-testid={`input-edit-global-tag-${tag.id}`}
                      />
                    ) : (
                      <>
                        {tag.name}
                        {isSuperAdmin && (
                          <>
                            <button
                              className="ml-0.5 text-muted-foreground hover:text-foreground"
                              onClick={() => { setEditingTagId(tag.id); setEditingTagType("global"); }}
                              data-testid={`button-edit-global-tag-${tag.id}`}
                            >
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button
                              className="text-muted-foreground hover:text-destructive"
                              onClick={() => deleteGlobalTagMutation.mutate(tag.id)}
                              data-testid={`button-delete-global-tag-${tag.id}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </Badge>
                ))}
              </div>
              {isSuperAdmin && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Add global tag..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 h-9 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagName.trim()) {
                        createGlobalTagMutation.mutate({ name: newTagName.trim() });
                      }
                    }}
                    data-testid="input-new-global-tag"
                  />
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      if (newTagName.trim()) {
                        createGlobalTagMutation.mutate({ name: newTagName.trim() });
                      }
                    }}
                    disabled={!newTagName.trim() || createGlobalTagMutation.isPending}
                    data-testid="button-add-global-tag"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              )}
            </div>

            {!isSuperAdmin && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Custom Tags</h4>
                  <span className="text-xs text-muted-foreground">{ownerTags.length} tags</span>
                </div>
                <div className="flex flex-wrap gap-2" data-testid="owner-tags-list">
                  {ownerTags.length === 0 && (
                    <p className="text-sm text-muted-foreground">No custom tags yet. Add your own tags below.</p>
                  )}
                  {ownerTags.map((tag) => (
                    <Badge
                      key={`custom-${tag.id}`}
                      variant="outline"
                      className="px-3 py-1.5 text-sm font-medium border-primary/30 text-primary dark:text-primary flex items-center gap-1"
                      data-testid={`tag-badge-owner-${tag.id}`}
                    >
                      {editingTagId === tag.id && editingTagType === "owner" ? (
                        <input
                          className="bg-transparent border-none outline-none text-sm w-24"
                          defaultValue={tag.name}
                          autoFocus
                          onBlur={(e) => {
                            const newName = e.target.value.trim();
                            if (newName && newName !== tag.name) {
                              updateTagMutation.mutate({ id: tag.id, data: { name: newName } });
                            } else {
                              setEditingTagId(null); setEditingTagType(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newName = (e.target as HTMLInputElement).value.trim();
                              if (newName && newName !== tag.name) {
                                updateTagMutation.mutate({ id: tag.id, data: { name: newName } });
                              } else {
                                setEditingTagId(null); setEditingTagType(null);
                              }
                            } else if (e.key === "Escape") {
                              setEditingTagId(null); setEditingTagType(null);
                            }
                          }}
                          data-testid={`input-edit-owner-tag-${tag.id}`}
                        />
                      ) : (
                        <>
                          {tag.name}
                          <button
                            className="ml-0.5 text-muted-foreground hover:text-foreground"
                            onClick={() => { setEditingTagId(tag.id); setEditingTagType("owner"); }}
                            data-testid={`button-edit-owner-tag-${tag.id}`}
                          >
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => deleteTagMutation.mutate(tag.id)}
                            data-testid={`button-delete-owner-tag-${tag.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Add custom tag..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 h-9 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newTagName.trim()) {
                        createTagMutation.mutate({ name: newTagName.trim() });
                      }
                    }}
                    data-testid="input-new-owner-tag"
                  />
                  <Button
                    size="sm"
                    className="h-9"
                    onClick={() => {
                      if (newTagName.trim()) {
                        createTagMutation.mutate({ name: newTagName.trim() });
                      }
                    }}
                    disabled={!newTagName.trim() || createTagMutation.isPending}
                    data-testid="button-add-owner-tag"
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getStatusEventColors(status: string | null | undefined, hasIssue?: boolean): { bg: string; text: string; border: string } {
  if (hasIssue || status?.toUpperCase() === "ISSUE") {
    return { bg: "bg-red-500/15 dark:bg-red-500/25", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" };
  }
  switch (status?.toUpperCase()) {
    case "CONFIRMED":
      return { bg: "bg-green-500/15 dark:bg-green-500/25", text: "text-green-700 dark:text-green-400", border: "border-green-500/30" };
    case "NEEDS_RESCHEDULE":
      return { bg: "bg-blue-500/15 dark:bg-blue-500/25", text: "text-blue-700 dark:text-blue-400", border: "border-blue-500/30" };
    case "COMPLETED":
      return { bg: "bg-gray-400/15 dark:bg-gray-500/25", text: "text-gray-600 dark:text-gray-400", border: "border-gray-400/30" };
    case "SCHEDULED":
    default:
      return { bg: "bg-orange-500/15 dark:bg-orange-500/25", text: "text-orange-700 dark:text-orange-400", border: "border-orange-500/30" };
  }
}

function getStatusBlockColors(status: string | null | undefined, hasIssue?: boolean): string {
  if (hasIssue || status?.toUpperCase() === "ISSUE") {
    return "bg-red-600 dark:bg-red-700 text-white border-red-700/30";
  }
  switch (status?.toUpperCase()) {
    case "CONFIRMED":
      return "bg-green-600 dark:bg-green-700 text-white border-green-700/30";
    case "NEEDS_RESCHEDULE":
      return "bg-blue-600 dark:bg-blue-700 text-white border-blue-700/30";
    case "COMPLETED":
      return "bg-gray-400 dark:bg-gray-600 text-white border-gray-500/30";
    case "SCHEDULED":
    default:
      return "bg-orange-500 dark:bg-orange-600 text-white border-orange-600/30";
  }
}

function matchesStatusFilter(event: CalendarEvent, filter: StatusFilter): boolean {
  const isTimeOff = (event as any).isTimeOff || event.status?.toUpperCase() === "TIMEOFF";
  if (filter === "TIMEOFF") return !!isTimeOff;
  // Time-off entries appear under their own tab AND under "All", but never
  // under a specific status tab (Scheduled, Confirmed, etc.)
  if (isTimeOff) return filter === "ALL";
  const eventStatus = event.status?.toUpperCase() || "SCHEDULED";
  if (filter === "ALL") return true;
  if (filter === "COMPLETED") return eventStatus === "COMPLETED";
  if (filter === "ISSUE") return eventStatus === "ISSUE" || !!event.hasIssue;
  if (filter === "SCHEDULED") return eventStatus === "SCHEDULED" || !event.status;
  return eventStatus === filter;
}


function StatusFilterBar({
  events,
  currentDate,
  viewMode,
  statusFilter,
  onFilterChange,
  filterColors,
  isSuperAdmin,
  canViewTimeOff,
}: {
  events: CalendarEvent[];
  currentDate: Date;
  viewMode: ViewMode;
  statusFilter: StatusFilter;
  onFilterChange: (filter: StatusFilter) => void;
  filterColors: FilterColorMap;
  isSuperAdmin: boolean;
  canViewTimeOff?: boolean;
}) {
  const { toast } = useToast();
  const colorInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const updateColorMutation = useMutation({
    mutationFn: async ({ statusKey, color }: { statusKey: string; color: string }) => {
      const res = await apiRequest("PATCH", `/api/calendar-filter-colors/${statusKey}`, { color });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-filter-colors"] });
    },
    onError: () => {
      toast({ title: "Failed to update color", variant: "destructive" });
    },
  });

  const getRelevantEvents = () => {
    let days: Date[] = [];
    if (viewMode === "month") {
      days = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) });
    } else if (viewMode === "week") {
      days = eachDayOfInterval({ start: startOfWeek(currentDate), end: endOfWeek(currentDate) });
    } else {
      days = [currentDate];
    }
    return events.filter((event) => {
      const eventDate = event.startTime ? toEST(event.startTime) : toEST(event.date);
      return days.some((day) => isSameDay(eventDate, day));
    });
  };

  const relevantEvents = getRelevantEvents();
  const isTimeOffEvent = (e: CalendarEvent) =>
    (e as any).isTimeOff || e.status?.toUpperCase() === "TIMEOFF";
  const bookingEvents = relevantEvents.filter((e) => !isTimeOffEvent(e));
  const counts = {
    all: relevantEvents.length,
    scheduled: bookingEvents.filter((e) => !e.status || e.status?.toUpperCase() === "SCHEDULED").length,
    confirmed: bookingEvents.filter((e) => e.status?.toUpperCase() === "CONFIRMED").length,
    reschedule: bookingEvents.filter((e) => e.status?.toUpperCase() === "NEEDS_RESCHEDULE").length,
    issue: bookingEvents.filter((e) => e.status?.toUpperCase() === "ISSUE" || e.hasIssue).length,
    completed: bookingEvents.filter((e) => e.status?.toUpperCase() === "COMPLETED").length,
    survey: bookingEvents.filter((e) => e.status?.toUpperCase() === "SURVEY").length,
    timeoff: relevantEvents.filter(isTimeOffEvent).length,
  };

  const filters: { key: StatusFilter; label: string; count: number; dotColor: string }[] = [
    { key: "ALL", label: "All", count: counts.all, dotColor: "" },
    { key: "SCHEDULED", label: "Scheduled", count: counts.scheduled, dotColor: filterColors.SCHEDULED || "#f97316" },
    { key: "CONFIRMED", label: "Confirmed", count: counts.confirmed, dotColor: filterColors.CONFIRMED || "#22c55e" },
    { key: "SURVEY", label: "Survey", count: counts.survey, dotColor: filterColors.SURVEY || "#8b5cf6" },
    { key: "NEEDS_RESCHEDULE", label: "Reschedule", count: counts.reschedule, dotColor: filterColors.NEEDS_RESCHEDULE || "#3b82f6" },
    { key: "ISSUE", label: "Issues", count: counts.issue, dotColor: filterColors.ISSUE || "#ef4444" },
    { key: "COMPLETED", label: "Completed", count: counts.completed, dotColor: filterColors.COMPLETED || "#9ca3af" },
    ...(canViewTimeOff
      ? [{ key: "TIMEOFF" as StatusFilter, label: "Time Off", count: counts.timeoff, dotColor: filterColors.TIMEOFF || TIMEOFF_COLOR }]
      : []),
  ];

  const handleDotClick = (e: React.MouseEvent, key: string) => {
    if (!isSuperAdmin) return;
    e.stopPropagation();
    const ref = colorInputRefs.current[key];
    if (ref) {
      ref.click();
    }
  };

  const handleColorChange = (statusKey: string, color: string) => {
    updateColorMutation.mutate({ statusKey, color });
  };

  return (
    <div className="px-3 sm:px-4 py-2" data-testid="status-filter-bar">
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => onFilterChange(f.key)}
            className={`flex items-center gap-1.5 sm:gap-2 whitespace-nowrap text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 rounded-md transition-colors font-semibold ${
              statusFilter === f.key
                ? "bg-primary/10 text-primary font-bold"
                : "text-muted-foreground hover:bg-muted/50"
            }`}
            data-testid={`filter-${f.key.toLowerCase()}`}
          >
            {f.key !== "ALL" && (
              <div className="relative shrink-0">
                <div
                  className={`w-3 h-3 rounded-full ${isSuperAdmin ? "cursor-pointer ring-offset-1 hover:ring-2 hover:ring-primary/40" : ""}`}
                  style={{ backgroundColor: f.dotColor }}
                  onClick={(e) => handleDotClick(e, f.key)}
                  data-testid={`color-dot-${f.key.toLowerCase()}`}
                />
                {isSuperAdmin && (
                  <input
                    ref={(el) => { colorInputRefs.current[f.key] = el; }}
                    type="color"
                    value={f.dotColor}
                    onChange={(e) => handleColorChange(f.key, e.target.value)}
                    className="absolute inset-0 opacity-0 w-0 h-0 overflow-hidden"
                    tabIndex={-1}
                    data-testid={`color-picker-${f.key.toLowerCase()}`}
                  />
                )}
              </div>
            )}
            <span className="flex-1 text-left">{f.label}</span>
            <span className={`tabular-nums text-xs ${statusFilter === f.key ? "text-primary" : "text-muted-foreground/70"}`}>
              {f.count}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MoreEventsPopover({
  date,
  dayEvents,
  onEventClick,
  filterColors,
}: {
  date: Date;
  dayEvents: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  filterColors: FilterColorMap;
}) {
  const [open, setOpen] = useState(false);
  const maxVisible = dayEvents.length > 5 ? 2 : 3;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="text-[10px] text-primary hover:text-primary/80 hover:underline pl-1 cursor-pointer font-medium"
          data-testid={`button-more-events-${format(date, "yyyy-MM-dd")}`}
          onClick={(e) => e.stopPropagation()}
        >
          +{dayEvents.length - maxVisible} more
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 max-h-60 overflow-y-auto" align="start">
        <div className="text-xs font-semibold mb-1.5 text-muted-foreground">
          {format(date, "EEEE, MMM d")} — All Events
        </div>
        <div className="space-y-1">
          {dayEvents.map((event) => {
            const eventStyle = getStatusInlineEventStyles(event.status, event.hasIssue, filterColors);
            return (
              <button
                key={event.id}
                onClick={() => { setOpen(false); onEventClick(event); }}
                className="w-full text-left text-[11px] leading-tight px-2 py-1.5 rounded transition-colors font-medium hover:opacity-80 flex flex-col gap-px"
                style={eventStyle}
                title={event.title}
                data-testid={`popover-event-${event.id}`}
              >
                <div className="flex items-center gap-1">
                  {event.startTime && (
                    <span className="font-semibold flex-shrink-0">
                      {formatEST(event.startTime, "h:mm a")}
                    </span>
                  )}
                  <span className="truncate">{event.title}</span>
                </div>
                {(event.assignedUserNames ?? []).length > 0 && (
                  <div className="text-[10px] text-black dark:text-white break-words whitespace-normal leading-snug">
                    {shortNames(event.assignedUserNames ?? [])}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MonthView({ 
  currentDate, 
  events, 
  onEventClick,
  onDayClick,
  canCreate,
  statusFilter,
  filterColors,
  onEventDrop,
  highlightedEventId,
}: { 
  currentDate: Date; 
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  onDayClick?: (date: Date) => void;
  canCreate?: boolean;
  statusFilter: StatusFilter;
  filterColors: FilterColorMap;
  onEventDrop?: (eventId: number, newDate: Date) => void;
  highlightedEventId: number | null;
}) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calendarStart = startOfWeek(monthStart);
  const calendarEnd = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  const getEventsForDay = (date: Date) => {
    return events
      .filter((event) => isSameDay(toEST(event.date), date) && matchesStatusFilter(event, statusFilter))
      .sort((a, b) => {
        const aTime = a.startTime ? toEST(a.startTime).getTime() : 0;
        const bTime = b.startTime ? toEST(b.startTime).getTime() : 0;
        return aTime - bTime;
      });
  };

  const numWeeks = Math.ceil(days.length / 7);

  const handleDragStart = (e: React.DragEvent, eventId: number) => {
    e.dataTransfer.setData("text/plain", String(eventId));
    e.dataTransfer.effectAllowed = "move";
  };

  const tomorrow = startOfDay(addDays(new Date(), 1));

  const isPastOrToday = (date: Date) => startOfDay(date) < tomorrow;

  const handleDragOver = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const dropDate = new Date(dateStr + "T00:00:00");
    if (isPastOrToday(dropDate)) {
      e.dataTransfer.dropEffect = "none";
      setDragOverDate(null);
    } else {
      e.dataTransfer.dropEffect = "move";
      setDragOverDate(dateStr);
    }
  };

  const handleDragLeave = () => {
    setDragOverDate(null);
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    setDragOverDate(null);
    if (isPastOrToday(date)) return;
    const eventId = parseInt(e.dataTransfer.getData("text/plain"));
    if (!isNaN(eventId) && onEventDrop) {
      onEventDrop(eventId, date);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="grid grid-cols-7 bg-muted/30 shrink-0">
        {[
          { full: "SUN", short: "S" },
          { full: "MON", short: "M" },
          { full: "TUE", short: "T" },
          { full: "WED", short: "W" },
          { full: "THU", short: "T" },
          { full: "FRI", short: "F" },
          { full: "SAT", short: "S" },
        ].map((day) => (
          <div
            key={day.full}
            className="py-2 sm:py-2.5 text-center text-xs sm:text-sm font-semibold text-muted-foreground tracking-wide border-b border-r last:border-r-0"
          >
            <span className="hidden sm:inline">{day.full}</span>
            <span className="sm:hidden">{day.short}</span>
          </div>
        ))}
      </div>
      <div
        className="grid grid-cols-7 flex-1"
        style={{ gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}
      >
        {days.map((date, index) => {
          const dayEvents = getEventsForDay(date);
          const isCurrentMonth = isSameMonth(date, currentDate);
          const maxVisible = numWeeks > 5 ? 2 : 3;
          const isLastRow = index >= days.length - 7;
          const dateStr = format(date, "yyyy-MM-dd");
          const isDragOver = dragOverDate === dateStr;

          return (
            <div
              key={index}
              className={`border-r ${!isLastRow ? "border-b" : ""} last:border-r-0 overflow-hidden flex flex-col group/day relative transition-colors min-h-[52px] sm:min-h-0 ${
                isDragOver ? "bg-primary/10 ring-2 ring-inset ring-primary/30" : ""
              } ${!isCurrentMonth ? "bg-muted/10" : ""} ${onDayClick ? "cursor-pointer hover:bg-muted/20" : ""}`}
              onClick={(e) => {
                if (onDayClick && e.target === e.currentTarget) {
                  onDayClick(date);
                }
              }}
              onDragOver={(e) => handleDragOver(e, dateStr)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, date)}
              data-testid={`calendar-day-${dateStr}`}
            >
              <div className="flex items-center justify-between py-0.5 sm:py-1 px-0.5 sm:px-1.5 shrink-0">
                <span
                  className={`text-xs sm:text-sm w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded-full font-medium ${
                    isToday(date)
                      ? "bg-primary text-primary-foreground font-bold"
                      : dayEvents.length > 0 && isCurrentMonth
                      ? "bg-primary/20 text-primary font-bold"
                      : !isCurrentMonth
                      ? "text-muted-foreground/50"
                      : ""
                  }`}
                >
                  {format(date, "d")}
                </span>
                {canCreate && onDayClick && dayEvents.length > 0 && (
                  <button
                    className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/50 hover:text-primary hover:bg-primary/10 opacity-0 group-hover/day:opacity-100 transition-opacity"
                    onClick={(e) => { e.stopPropagation(); onDayClick(date); }}
                    data-testid={`button-add-event-${dateStr}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div
                className="flex-1 min-h-0 space-y-px px-0.5 overflow-hidden relative"
                onClick={() => { if (onDayClick) onDayClick(date); }}
              >
                {canCreate && onDayClick && dayEvents.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/day:opacity-100 transition-opacity pointer-events-none">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Plus className="h-5 w-5 text-primary" />
                    </div>
                  </div>
                )}
                {dayEvents.slice(0, maxVisible).map((event) => {
                  const eventStyle = getStatusInlineEventStyles(event.status, event.hasIssue, filterColors);
                  const shortTime = event.startTime
                    ? formatEST(event.startTime, "h:mma").replace(":00", "").toLowerCase()
                    : null;
                  const isHighlighted = highlightedEventId === event.id;
                  return (
                    <div
                      key={event.id}
                      draggable={!!onEventDrop && event.status !== "COMPLETED" && !(event as any).isTimeOff}
                      onDragStart={(e) => handleDragStart(e, event.id)}
                      className={`w-full text-left leading-tight rounded transition-colors font-medium hover:opacity-80 cursor-pointer${event.id === highlightedEventId ? " booking-highlight-block" : ""}`}
                      style={{ ...eventStyle }}
                      title={`${shortTime ? shortTime + " " : ""}${event.title}`}
                      onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                      data-testid={`month-event-${event.id}`}
                    >
                      {/* Mobile: compact dot + time + first user name */}
                      <div className="flex sm:hidden flex-col px-0.5 py-0.5 min-h-[22px] gap-px">
                        <div className="flex items-center gap-0.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-current opacity-80" />
                          {shortTime && (
                            <span className="text-[9px] font-semibold truncate leading-none">{shortTime}</span>
                          )}
                        </div>
                        {(event.assignedUserNames ?? []).length > 0 && (
                          <div className="text-[8px] font-medium truncate leading-none text-black dark:text-white pl-0.5">
                            {shortName((event.assignedUserNames ?? [])[0])}
                          </div>
                        )}
                      </div>
                      {/* Desktop: time + title on row 1, user names on row 2 */}
                      <div className="hidden sm:flex flex-col w-full px-1 py-0.5 min-h-[20px] text-[11px] gap-px">
                        <div className="flex items-center gap-0.5 w-full">
                          {event.startTime && (
                            <span className="font-semibold mr-0.5 flex-shrink-0 opacity-90">
                              {formatEST(event.startTime, "h:mm a")}
                            </span>
                          )}
                          <span className="truncate flex-1 font-semibold">{event.title}</span>
                        </div>
                        {(event.assignedUserNames ?? []).length > 0 && (
                          <div className="text-[10px] text-black dark:text-white break-words whitespace-normal leading-snug">
                            {shortNames(event.assignedUserNames ?? [])}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {dayEvents.length > maxVisible && (
                  <MoreEventsPopover
                    date={date}
                    dayEvents={dayEvents}
                    onEventClick={onEventClick}
                    filterColors={filterColors}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function computeEventLayout(events: CalendarEvent[]): Map<number, { col: number; numCols: number }> {
  if (events.length === 0) return new Map();

  // Normalize time range; ensure non-zero duration
  const getRange = (e: CalendarEvent): [number, number] => {
    const s = e.startTime ? new Date(e.startTime).getTime() : 0;
    const raw = e.endTime ? new Date(e.endTime).getTime() : s + 3600000;
    return [s, Math.max(raw, s + 60000)];
  };

  // Sort by start time, then longer events first on ties
  const sorted = [...events].sort((a, b) => {
    const [as, ae] = getRange(a);
    const [bs, be] = getRange(b);
    return as !== bs ? as - bs : (be - bs) - (ae - as);
  });

  // ── Step 1: greedy column assignment ─────────────────────────────────────
  const eventCols = new Map<number, number>();
  const colEndTimes: number[] = [];
  for (const ev of sorted) {
    const [s, e] = getRange(ev);
    let col = colEndTimes.findIndex(t => t <= s);
    if (col === -1) { col = colEndTimes.length; colEndTimes.push(0); }
    colEndTimes[col] = e;
    eventCols.set(ev.id, col);
  }

  // ── Step 2: build direct-overlap adjacency ───────────────────────────────
  const adj = new Map<number, Set<number>>();
  for (const ev of sorted) adj.set(ev.id, new Set());
  for (let i = 0; i < sorted.length; i++) {
    const [as, ae] = getRange(sorted[i]);
    for (let j = i + 1; j < sorted.length; j++) {
      const [bs, be] = getRange(sorted[j]);
      if (as < be && ae > bs) {
        adj.get(sorted[i].id)!.add(sorted[j].id);
        adj.get(sorted[j].id)!.add(sorted[i].id);
      }
    }
  }

  // ── Step 3: BFS to find connected components (conflict clusters) ──────────
  const clusterOf = new Map<number, number>();
  const clusterMaxCol = new Map<number, number>();
  let nextCluster = 0;
  for (const ev of sorted) {
    if (clusterOf.has(ev.id)) continue;
    const cid = nextCluster++;
    const queue: number[] = [ev.id];
    clusterOf.set(ev.id, cid);
    let maxCol = 0;
    while (queue.length) {
      const id = queue.shift()!;
      maxCol = Math.max(maxCol, eventCols.get(id)!);
      for (const nbr of adj.get(id)!) {
        if (!clusterOf.has(nbr)) { clusterOf.set(nbr, cid); queue.push(nbr); }
      }
    }
    clusterMaxCol.set(cid, maxCol + 1);
  }

  // ── Step 4: build result — all events in a cluster share the same numCols ─
  const result = new Map<number, { col: number; numCols: number }>();
  for (const ev of sorted) {
    const cid = clusterOf.get(ev.id)!;
    result.set(ev.id, { col: eventCols.get(ev.id)!, numCols: clusterMaxCol.get(cid)! });
  }
  return result;
}

function WeekView({ 
  currentDate, 
  events, 
  onEventClick,
  statusFilter,
  filterColors,
  highlightedEventId,
}: { 
  currentDate: Date; 
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  statusFilter: StatusFilter;
  filterColors: FilterColorMap;
  highlightedEventId: number | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const weekStart = startOfWeek(currentDate);
  const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate) });
  const START_HOUR = 6;
  const END_HOUR = 21;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const HOUR_HEIGHT = 64; // px per hour — matches Google Calendar's density
  const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  // Track mobile viewport so we can cap simultaneous columns and keep blocks readable
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 639px)").matches : false
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(max-width: 639px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // Auto-scroll vertically to current time (or 8 AM fallback) on mount.
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const target = now.getHours() >= START_HOUR && now.getHours() < END_HOUR
      ? (now.getHours() + now.getMinutes() / 60 - START_HOUR - 1) * HOUR_HEIGHT
      : 2 * HOUR_HEIGHT; // 8 AM fallback
    scrollRef.current.scrollTop = Math.max(0, target);
  }, []);

  // On mobile (where the body is wider than the viewport), horizontally
  // center on today — or, if today isn't in this week, on the first day
  // of the week. Re-runs when the user navigates to a different week so
  // each new week starts centered, not stuck on whatever the previous
  // week's scroll position was.
  const weekStartIso = weekStart.toISOString();
  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    if (!isMobile || el.scrollWidth <= el.clientWidth) return;
    const todayIdx = weekDays.findIndex((d) => isToday(d));
    const idx = todayIdx >= 0 ? todayIdx : 0;
    const gutterW = 44;
    const colW = (el.scrollWidth - gutterW) / 7;
    const targetLeft = gutterW + idx * colW - el.clientWidth / 2 + colW / 2;
    el.scrollLeft = Math.max(0, targetLeft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, weekStartIso]);

  // Tapping a day in the always-visible header strip scrolls the body
  // horizontally to center that day's column (only meaningful on mobile,
  // where the body is wider than the viewport).
  const scrollToDay = (idx: number) => {
    const el = scrollRef.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const gutterW = isMobile ? 44 : 52;
    const colW = (el.scrollWidth - gutterW) / 7;
    const targetLeft = gutterW + idx * colW - el.clientWidth / 2 + colW / 2;
    el.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  };

  const getEventsForDay = (date: Date) =>
    events.filter((event) => {
      const eventDate = event.startTime ? toEST(event.startTime) : toEST(event.date);
      return isSameDay(eventDate, date) && event.startTime && matchesStatusFilter(event, statusFilter);
    });

  // All-day / multi-day blocks (no start time) — currently only time-off
  // availability. Rendered in a pinned banner row above the time grid so
  // full-day unavailability is visible in Week view too.
  const getAllDayEventsForDay = (date: Date) =>
    events.filter((event) => {
      if (event.startTime) return false;
      return isSameDay(toEST(event.date), date) && matchesStatusFilter(event, statusFilter);
    });
  const hasAnyAllDay = weekDays.some((d) => getAllDayEventsForDay(d).length > 0);

  const getEventTop = (event: CalendarEvent) => {
    if (!event.startTime) return 0;
    const start = toEST(event.startTime);
    return Math.max(start.getHours() + start.getMinutes() / 60 - START_HOUR, 0) * HOUR_HEIGHT;
  };

  const getEventHeight = (event: CalendarEvent) => {
    if (!event.startTime || !event.endTime) return HOUR_HEIGHT;
    const start = toEST(event.startTime);
    const end = toEST(event.endTime);
    const startHrs = start.getHours() + start.getMinutes() / 60 + start.getSeconds() / 3600;
    const endHrs = end.getHours() + end.getMinutes() / 60 + end.getSeconds() / 3600;
    // Clamp to the visible window so events that begin before START_HOUR
    // or end after END_HOUR don't render past their actual end on screen.
    const visibleStart = Math.max(startHrs, START_HOUR);
    const visibleEnd = Math.min(endHrs, END_HOUR);
    const visibleHours = Math.max(visibleEnd - visibleStart, 0);
    return Math.max(visibleHours * HOUR_HEIGHT, HOUR_HEIGHT * 0.35); // min ~22 min tall
  };

  // Current time indicator
  const now = new Date();
  const nowTop = (now.getHours() + now.getMinutes() / 60 - START_HOUR) * HOUR_HEIGHT;
  const showNow = now.getHours() >= START_HOUR && now.getHours() < END_HOUR;

  return (
    // The wrapper itself fits the viewport so the header strip below always
    // shows all 7 days at once. Only the inner event grid is wider than the
    // viewport on mobile — it scrolls horizontally inside its own container,
    // and tapping a day in the header strip jumps to that column.
    <div className="flex flex-col h-full border-l border-r border-b">
      {/* Header: ALWAYS shows all 7 days, fitted to viewport. On mobile each
          day cell is a button that scrolls the body to that column. */}
      <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] sm:grid-cols-[52px_repeat(7,minmax(0,1fr))] shrink-0 border-b bg-background z-10">
        <div className="border-r" />
        {weekDays.map((day, idx) => {
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => scrollToDay(idx)}
              className={`py-1.5 sm:py-2 text-center border-r last:border-r-0 transition-colors active:bg-accent/50 sm:hover:bg-accent/30 sm:cursor-default ${today ? "bg-primary/5" : ""}`}
              aria-label={`${format(day, "EEEE, MMM d")} — tap to view`}
              data-testid={`button-week-day-header-${format(day, "yyyy-MM-dd")}`}
            >
              <div className="text-[9px] sm:text-[10px] font-semibold text-muted-foreground tracking-wide sm:tracking-widest uppercase">
                <span className="sm:hidden">{format(day, "EEEEE")}</span>
                <span className="hidden sm:inline">{format(day, "EEEEE")}{format(day, "EEE").slice(1)}</span>
              </div>
              <div className={`mt-0.5 text-sm sm:text-base font-bold leading-none mx-auto flex items-center justify-center ${today ? "w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-primary text-primary-foreground" : "text-foreground"}`}>
                {format(day, "d")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Scrollable time grid (both axes on mobile, vertical only on desktop).
           Body grid is at least 900px on mobile so each day column is ~120px
           — wide enough for typical "INSTALL-401-XXXXX" booking titles to fit
           on a single line. The user swipes horizontally to reach later days. */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-auto min-h-0">
        {/* All-day banner row — pinned to the top of the scroll area so
            full-day / multi-day time-off stays visible while the time grid
            scrolls vertically. Scrolls horizontally with the grid on mobile. */}
        {hasAnyAllDay && (
          <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] sm:grid-cols-[52px_repeat(7,minmax(0,1fr))] min-w-[900px] sm:min-w-0 sticky top-0 z-30 bg-background border-b">
            <div className="border-r flex items-start justify-end pr-0.5 sm:pr-1.5 pt-1">
              <span className="text-[8px] sm:text-[10px] text-muted-foreground font-medium leading-none">Off</span>
            </div>
            {weekDays.map((day) => {
              const allDay = getAllDayEventsForDay(day);
              const today = isToday(day);
              return (
                <div
                  key={`allday-${day.toISOString()}`}
                  className={`border-r last:border-r-0 p-0.5 space-y-0.5 min-h-[26px] ${today ? "bg-primary/[0.015]" : ""}`}
                >
                  {allDay.map((event) => {
                    const eventStyle = getStatusInlineEventStyles(event.status, event.hasIssue, filterColors);
                    return (
                      <button
                        key={event.id}
                        onClick={() => onEventClick(event)}
                        className="w-full text-left text-[10px] sm:text-[11px] leading-tight px-1.5 py-1 rounded font-medium hover:opacity-80 transition-opacity flex flex-col gap-px overflow-hidden"
                        style={eventStyle}
                        title={`${event.title}${(event.assignedUserNames ?? []).length > 0 ? " — " + shortNames(event.assignedUserNames!) : ""}`}
                        data-testid={`event-allday-week-${event.id}`}
                      >
                        <span className="font-semibold truncate">{event.title}</span>
                        {(event.assignedUserNames ?? []).length > 0 && (
                          <span className="text-[9px] sm:text-[10px] opacity-90 break-words whitespace-normal leading-snug">
                            {shortNames(event.assignedUserNames!)}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-[44px_repeat(7,minmax(0,1fr))] sm:grid-cols-[52px_repeat(7,minmax(0,1fr))] min-w-[900px] sm:min-w-0 pt-2" style={{ height: TOTAL_HEIGHT }}>

          {/* Time-label gutter */}
          <div className="relative border-r" style={{ height: TOTAL_HEIGHT }}>
            {hours.map((hour, i) => (
              <div
                key={hour}
                className="absolute w-full flex items-start justify-end pr-0.5 sm:pr-1.5"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="text-[8px] sm:text-[10px] text-muted-foreground font-medium -translate-y-2 leading-none">
                  {format(setHours(new Date(), hour), "h")}
                  <span className="hidden sm:inline"> {format(setHours(new Date(), hour), "a")}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((day) => {
            const dayEvents = getEventsForDay(day);
            const layout = computeEventLayout(dayEvents);
            const today = isToday(day);

            // Cap simultaneous columns — fewer on mobile so each block stays readable
            const MAX_COLS = isMobile ? 2 : 3;
            const visibleEvents = dayEvents.filter(ev => (layout.get(ev.id)?.col ?? 0) < MAX_COLS);
            // Collect all events that don't fit in the visible columns. We show
            // ONE clearly-labeled "+N more" button per day (positioned just
            // below the last visible event) instead of multiple cramped "+N"
            // badges at each time bucket.
            const hiddenEventsForDay = dayEvents
              .filter(ev => (layout.get(ev.id)?.col ?? 0) >= MAX_COLS)
              .sort((a, b) => {
                const ta = a.startTime ? new Date(a.startTime).getTime() : 0;
                const tb = b.startTime ? new Date(b.startTime).getTime() : 0;
                return ta - tb;
              });
            // Anchor the More button just below the latest visible event so
            // it's near the events themselves (instead of way down at midnight).
            const lastVisibleBottom = visibleEvents.reduce((max, ev) => {
              const bottom = getEventTop(ev) + getEventHeight(ev);
              return bottom > max ? bottom : max;
            }, 0);
            const moreButtonTop = Math.max(lastVisibleBottom + 4, 8);

            return (
              <div
                key={day.toISOString()}
                className={`border-r last:border-r-0 relative ${today ? "bg-primary/[0.015]" : ""}`}
                style={{ height: TOTAL_HEIGHT }}
              >
                {/* Hour lines */}
                {hours.map((_, i) => (
                  <div key={i} className="absolute w-full border-b border-border/60" style={{ top: i * HOUR_HEIGHT }} />
                ))}
                {/* Half-hour lines (lighter) */}
                {hours.map((_, i) => (
                  <div key={`h${i}`} className="absolute w-full border-b border-border/25" style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
                ))}

                {/* Current time indicator */}
                {today && showNow && (
                  <div className="absolute w-full z-20 pointer-events-none" style={{ top: nowTop }}>
                    <div className="relative flex items-center">
                      <div className="absolute -left-1 w-2.5 h-2.5 rounded-full bg-red-500 shadow" />
                      <div className="w-full h-[2px] bg-red-500" />
                    </div>
                  </div>
                )}

                {/* Single per-day "+N more" button — placed just below the
                     last visible event so it's always near the bookings.
                     Clicking opens a popover listing every hidden event for
                     this day in chronological order. */}
                {hiddenEventsForDay.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="absolute z-20 left-1 right-1 mx-auto flex items-center justify-center gap-1 text-[10px] sm:text-[11px] font-semibold bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-2 py-1 shadow-md leading-none cursor-pointer transition-colors"
                        style={{ top: moreButtonTop }}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`button-week-more-events-${format(day, "yyyy-MM-dd")}`}
                        aria-label={`Show ${hiddenEventsForDay.length} more booking${hiddenEventsForDay.length === 1 ? "" : "s"} for ${format(day, "EEEE")}`}
                      >
                        <ChevronDown className="w-3 h-3" />
                        <span>+{hiddenEventsForDay.length} More</span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-2 max-h-80 overflow-y-auto" align="center">
                      <div className="text-xs font-semibold mb-2 text-muted-foreground px-1">
                        {format(day, "EEEE, MMM d")} — {hiddenEventsForDay.length} more booking{hiddenEventsForDay.length === 1 ? "" : "s"}
                      </div>
                      <div className="space-y-1">
                        {hiddenEventsForDay.map((event) => {
                          const eventStyle = getStatusInlineEventStyles(event.status, event.hasIssue, filterColors);
                          return (
                            <button
                              key={event.id}
                              onClick={() => onEventClick(event)}
                              className="w-full text-left text-[11px] leading-tight px-2 py-1.5 rounded transition-colors font-medium hover:opacity-80 flex flex-col gap-px"
                              style={eventStyle}
                              title={event.title}
                              data-testid={`popover-week-event-${event.id}`}
                            >
                              <div className="flex items-center gap-1">
                                {event.startTime && (
                                  <span className="font-semibold flex-shrink-0">
                                    {formatEST(event.startTime, "h:mm a")}
                                  </span>
                                )}
                                <span className="truncate">{event.title}</span>
                              </div>
                              {(event.assignedUserNames ?? []).length > 0 && (
                                <div className="text-[10px] text-black dark:text-white break-words whitespace-normal leading-snug">
                                  {shortNames(event.assignedUserNames ?? [])}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                {/* Events */}
                {visibleEvents.map((event) => {
                  const top = getEventTop(event);
                  const height = getEventHeight(event);
                  const blockStyle = getStatusInlineBlockStyles(event.status, event.hasIssue, filterColors);
                  const startLabel = event.startTime ? formatEST(event.startTime, "h:mm a") : null;
                  const endLabel = event.endTime ? formatEST(event.endTime, "h:mm a") : null;
                  const timeLabel = startLabel && endLabel ? `${startLabel} – ${endLabel}` : startLabel;
                  const durationMins = (event.startTime && event.endTime)
                    ? (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000
                    : 60;
                  const isTiny = durationMins <= 20;
                  const isShort = durationMins <= 44;
                  const { col, numCols } = layout.get(event.id) ?? { col: 0, numCols: 1 };
                  const cappedNumCols = Math.min(numCols, MAX_COLS);
                  const colW = 100 / cappedNumCols;
                  const GAP = 2;
                  const isHighlighted = highlightedEventId === event.id;
                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className={`absolute text-left rounded-[3px] sm:rounded-[5px] overflow-hidden z-10 flex flex-col hover:brightness-95 active:brightness-90 transition-[filter] shadow-sm${event.id === highlightedEventId ? " booking-highlight-block" : ""}`}
                      style={{
                        ...blockStyle,
                        top: top + 1,
                        height: Math.max(height - 2, 14),
                        left: `calc(${col * colW}% + ${GAP}px)`,
                        width: `calc(${colW}% - ${GAP * 2 + (col < cappedNumCols - 1 ? 1 : 0)}px)`,
                      }}
                      title={`${timeLabel ? timeLabel + " · " : ""}${event.title}${(event.assignedUserNames ?? []).length > 0 ? " — " + shortNames(event.assignedUserNames!) : ""}`}
                      data-testid={`event-block-${event.id}`}
                    >
                      {/* ——— Mobile layout (< 640px): readable chip with horizontal text.
                              Columns are ~120px wide thanks to the parent's
                              min-w-[900px], so typical "INSTALL-401-XXXXX"
                              titles fit on one line.
                              overflowWrap:'break-word' wraps at hyphens/spaces
                              first and only breaks mid-word as a last resort
                              (avoids the previous 1-character-per-line look). ——— */}
                      <div className="sm:hidden w-full h-full px-1.5 py-1 overflow-hidden flex flex-col">
                        {startLabel && (
                          <div className="text-[10px] font-semibold opacity-95 leading-none shrink-0 truncate">
                            {formatEST(event.startTime!, "h:mma").toLowerCase()}
                          </div>
                        )}
                        <div
                          className="text-[11px] font-bold leading-[1.2] overflow-hidden flex-1 min-h-0 mt-0.5"
                          style={{
                            display: '-webkit-box',
                            WebkitLineClamp: Math.max(Math.floor((height - (startLabel ? 14 : 0)) / 14), 1),
                            WebkitBoxOrient: 'vertical' as const,
                            overflow: 'hidden',
                            overflowWrap: 'break-word',
                            wordBreak: 'normal',
                            hyphens: 'auto',
                          }}
                        >
                          {event.title}
                        </div>
                        {(event.assignedUserNames ?? []).length > 0 && height > 56 && (
                          <div className="text-[9px] opacity-80 leading-tight mt-0.5 shrink-0 truncate">
                            {shortNames(event.assignedUserNames!)}
                          </div>
                        )}
                      </div>

                      {/* ——— Desktop layout (≥ 640px): full details ——— */}
                      <div className="hidden sm:flex flex-col w-full h-full" style={{ padding: isTiny ? "1px 4px" : isShort ? "2px 5px" : "3px 6px", gap: 0 }}>
                        {isTiny ? (
                          <div className="text-[9px] font-bold leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                            {startLabel && <span className="font-semibold opacity-90">{startLabel}{" "}</span>}
                            {event.title}
                          </div>
                        ) : isShort ? (
                          <>
                            {timeLabel && <div className="text-[9px] font-semibold opacity-90 truncate leading-tight shrink-0">{timeLabel}</div>}
                            <div className="text-[10px] font-bold leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                              {event.title}
                            </div>
                          </>
                        ) : (
                          <>
                            {timeLabel && <div className="text-[9px] font-semibold opacity-90 truncate leading-tight shrink-0">{timeLabel}</div>}
                            <div className="text-[11px] font-bold leading-tight mt-0.5" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                              {event.title}
                            </div>
                            {(event.assignedUserNames ?? []).length > 0 && (
                              <div className="text-[9px] opacity-80 truncate leading-tight mt-0.5 shrink-0">
                                {shortNames(event.assignedUserNames ?? [])}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DayView({ 
  currentDate, 
  events, 
  onEventClick,
  statusFilter,
  filterColors,
  highlightedEventId,
}: { 
  currentDate: Date; 
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  statusFilter: StatusFilter;
  filterColors: FilterColorMap;
  highlightedEventId: number | null;
}) {
  const START_HOUR = 6;
  const END_HOUR = 21;
  const TOTAL_HOURS = END_HOUR - START_HOUR;
  const hours = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

  const timedEvents = events.filter((event) => {
    const eventDate = event.startTime ? toEST(event.startTime) : toEST(event.date);
    return isSameDay(eventDate, currentDate) && event.startTime && matchesStatusFilter(event, statusFilter);
  });

  const allDayEvents = events.filter((event) => {
    if (event.startTime) return false;
    return isSameDay(toEST(event.date), currentDate) && matchesStatusFilter(event, statusFilter);
  });

  const HOUR_HEIGHT = 64;
  const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const target = now.getHours() >= START_HOUR && now.getHours() < END_HOUR
      ? (now.getHours() + now.getMinutes() / 60 - START_HOUR - 1) * HOUR_HEIGHT
      : 2 * HOUR_HEIGHT;
    scrollRef.current.scrollTop = Math.max(0, target);
  }, []);

  const getEventTop = (event: CalendarEvent) => {
    if (!event.startTime) return 0;
    const start = toEST(event.startTime);
    return Math.max(start.getHours() + start.getMinutes() / 60 - START_HOUR, 0) * HOUR_HEIGHT;
  };

  const getEventHeight = (event: CalendarEvent) => {
    if (!event.startTime || !event.endTime) return HOUR_HEIGHT;
    const start = toEST(event.startTime);
    const end = toEST(event.endTime);
    const startHrs = start.getHours() + start.getMinutes() / 60 + start.getSeconds() / 3600;
    const endHrs = end.getHours() + end.getMinutes() / 60 + end.getSeconds() / 3600;
    // Clamp to the visible window so events that begin before START_HOUR
    // or end after END_HOUR don't render past their actual end on screen.
    const visibleStart = Math.max(startHrs, START_HOUR);
    const visibleEnd = Math.min(endHrs, END_HOUR);
    const visibleHours = Math.max(visibleEnd - visibleStart, 0);
    return Math.max(visibleHours * HOUR_HEIGHT, HOUR_HEIGHT * 0.35);
  };

  const now = new Date();
  const nowTop = (now.getHours() + now.getMinutes() / 60 - START_HOUR) * HOUR_HEIGHT;
  const showNow = now.getHours() >= START_HOUR && now.getHours() < END_HOUR;

  const layout = computeEventLayout(timedEvents);

  return (
    <div className="flex flex-col border-l border-r border-b h-full">
      {allDayEvents.length > 0 && (
        <div className="border-b p-2 bg-muted/30 shrink-0">
          <div className="text-xs text-muted-foreground mb-1 font-medium">All day</div>
          <div className="space-y-1">
            {allDayEvents.map((event) => {
              const eventStyle = getStatusInlineEventStyles(event.status, event.hasIssue, filterColors);
              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className="w-full text-left text-sm p-2 rounded-[5px] font-medium hover:brightness-95 transition-[filter]"
                  style={eventStyle}
                  data-testid={`event-block-day-${event.id}`}
                >
                  {event.title}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 pt-2">
        <div className="flex" style={{ height: TOTAL_HEIGHT }}>
          {/* Time-label gutter */}
          <div className="w-16 flex-shrink-0 border-r relative" style={{ height: TOTAL_HEIGHT }}>
            {hours.map((hour, i) => (
              <div
                key={hour}
                className="absolute w-full flex items-start justify-end pr-2"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="text-xs text-muted-foreground font-medium -translate-y-2 leading-none">
                  {format(setHours(new Date(), hour), "h a")}
                </span>
              </div>
            ))}
          </div>

          {/* Event area */}
          <div className="flex-1 relative" style={{ height: TOTAL_HEIGHT }}>
            {/* Hour lines */}
            {hours.map((_, i) => (
              <div key={i} className="absolute w-full border-b border-border/60" style={{ top: i * HOUR_HEIGHT }} />
            ))}
            {/* Half-hour lines */}
            {hours.map((_, i) => (
              <div key={`h${i}`} className="absolute w-full border-b border-border/25" style={{ top: i * HOUR_HEIGHT + HOUR_HEIGHT / 2 }} />
            ))}

            {/* Current time indicator */}
            {showNow && (
              <div className="absolute w-full z-20 pointer-events-none" style={{ top: nowTop }}>
                <div className="relative flex items-center">
                  <div className="absolute -left-1 w-2.5 h-2.5 rounded-full bg-red-500 shadow" />
                  <div className="w-full h-[2px] bg-red-500" />
                </div>
              </div>
            )}

            {/* Events */}
            {timedEvents.map((event) => {
              const top = getEventTop(event);
              const height = getEventHeight(event);
              const blockStyle = getStatusInlineBlockStyles(event.status, event.hasIssue, filterColors);
              const startLabel = event.startTime ? formatEST(event.startTime, "h:mm a") : null;
              const endLabel = event.endTime ? formatEST(event.endTime, "h:mm a") : null;
              const timeLabel = startLabel && endLabel ? `${startLabel} – ${endLabel}` : startLabel;
              const durationMins = (event.startTime && event.endTime)
                ? (new Date(event.endTime).getTime() - new Date(event.startTime).getTime()) / 60000
                : 60;
              const isTiny = durationMins <= 20;
              const isShort = durationMins <= 44;
              const { col, numCols } = layout.get(event.id) ?? { col: 0, numCols: 1 };
              const colW = 100 / numCols;
              const GAP = 3;
              const isHighlighted = highlightedEventId === event.id;
              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick(event)}
                  className={`absolute text-left rounded-[5px] overflow-hidden z-10 flex flex-col hover:brightness-95 active:brightness-90 transition-[filter] shadow-sm${event.id === highlightedEventId ? " booking-highlight-block" : ""}`}
                  style={{
                    ...blockStyle,
                    top: top + 1,
                    height: Math.max(height - 2, 18),
                    left: `calc(${col * colW}% + ${GAP}px)`,
                    width: `calc(${colW}% - ${GAP * 2 + (col < numCols - 1 ? 1 : 0)}px)`,
                    padding: isTiny ? "2px 8px" : isShort ? "4px 8px" : "6px 10px",
                    gap: 2,
                  }}
                  title={`${timeLabel ? timeLabel + " · " : ""}${event.title}`}
                  data-testid={`event-block-day-${event.id}`}
                >
                  {isTiny ? (
                    <div className="text-xs font-bold leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                      {startLabel && <span className="font-semibold opacity-90">{startLabel}{" "}</span>}
                      {event.title}
                    </div>
                  ) : isShort ? (
                    <>
                      {timeLabel && <div className="text-xs font-semibold opacity-90 truncate leading-tight shrink-0">{timeLabel}</div>}
                      <div className="text-sm font-bold leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                        {event.title}
                      </div>
                    </>
                  ) : (
                    <>
                      {timeLabel && <div className="text-xs font-semibold opacity-90 truncate leading-tight shrink-0">{timeLabel}</div>}
                      <div className="text-sm font-bold leading-tight" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }}>
                        {event.title}
                      </div>
                      {(event.assignedUserNames ?? []).length > 0 && (
                        <div className="text-xs opacity-80 truncate leading-tight mt-0.5 shrink-0">
                          {shortNames(event.assignedUserNames ?? [])}
                        </div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListView({
  currentDate,
  events,
  onEventClick,
  statusFilter,
  filterColors,
  highlightedEventId,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  statusFilter: StatusFilter;
  filterColors: FilterColorMap;
  highlightedEventId: number | null;
}) {
  // Show 60 days starting from the beginning of the current month
  const start = startOfMonth(currentDate);
  const end = addDays(start, 59);
  const days = eachDayOfInterval({ start, end });

  const filteredByStatus = events.filter((e) => matchesStatusFilter(e, statusFilter));

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  filteredByStatus.forEach((event) => {
    const eventDate = event.startTime ? toEST(event.startTime) : toEST(event.date);
    const dateKey = format(eventDate, "yyyy-MM-dd");
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push(event);
  });

  // Sort each day's events by start time
  Object.values(eventsByDate).forEach((arr) =>
    arr.sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
  );

  const activeDays = days.filter((d) => {
    const key = format(d, "yyyy-MM-dd");
    return (eventsByDate[key]?.length ?? 0) > 0;
  });

  if (activeDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-16 gap-2">
        <CalendarIcon className="h-10 w-10 opacity-30" />
        <p className="text-sm">No bookings in this period</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {activeDays.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const dayEvents = eventsByDate[dateKey] ?? [];
        const isCurrentDay = isToday(day);
        return (
          <div key={dateKey} className="border-b last:border-b-0">
            {/* Date header */}
            <div className={`px-4 py-2 flex items-center gap-3 sticky top-0 z-10 border-b ${isCurrentDay ? "bg-primary/5 border-primary/20" : "bg-muted/30"}`}>
              <div className={`text-2xl font-bold leading-none w-8 text-center ${isCurrentDay ? "text-primary" : ""}`}>
                {format(day, "d")}
              </div>
              <div>
                <div className={`text-sm font-semibold leading-tight ${isCurrentDay ? "text-primary" : ""}`}>
                  {format(day, "EEEE")}
                </div>
                <div className="text-xs text-muted-foreground leading-tight">{format(day, "MMMM yyyy")}</div>
              </div>
              <span className="ml-auto text-xs text-muted-foreground">{dayEvents.length} booking{dayEvents.length !== 1 ? "s" : ""}</span>
            </div>
            {/* Events for this day */}
            <div className="divide-y">
              {dayEvents.map((event) => {
                const statusColor = getStatusColor(event.status, event.hasIssue, filterColors);
                const eventStyle = getStatusInlineEventStyles(event.status, event.hasIssue, filterColors);
                const isHighlighted = highlightedEventId === event.id;
                return (
                  <button
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    className={`w-full text-left flex items-stretch gap-0 hover:bg-muted/20 group${event.id === highlightedEventId ? " booking-highlight-row" : ""}`}
                    data-testid={`list-event-${event.id}`}
                  >
                    {/* Color bar */}
                    <div className="w-1 flex-shrink-0 rounded-l" style={{ backgroundColor: statusColor }} />
                    <div className="flex-1 px-4 py-3 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm leading-tight truncate">{event.title}</div>
                          {(event.assignedUserNames ?? []).length > 0 && (
                            <div className="text-xs text-black dark:text-white mt-0.5 break-words whitespace-normal leading-snug">
                              {shortNames(event.assignedUserNames!)}
                            </div>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {event.startTime && (
                            <div className="text-xs font-medium text-muted-foreground">
                              {formatEST(event.startTime, "h:mm a")}
                              {event.endTime ? (
                                <span className="text-muted-foreground/70"> – {formatEST(event.endTime, "h:mm a")}</span>
                              ) : null}
                            </div>
                          )}
                          <div className="mt-0.5">
                            <span
                              className="inline-block text-[10px] px-1.5 py-0.5 rounded font-medium leading-none"
                              style={eventStyle}
                            >
                              {event.status === "NEEDS_RESCHEDULE" ? "Reschedule" : event.status.charAt(0) + event.status.slice(1).toLowerCase()}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Agenda view: a focused, mobile-friendly week list. Groups the current week's
// events by day in chronological order, with full readable event cards. Empty
// days are still shown so the user knows what's free.
function AgendaView({
  currentDate,
  events,
  onEventClick,
  statusFilter,
  filterColors,
  highlightedEventId,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  statusFilter: StatusFilter;
  filterColors: FilterColorMap;
  highlightedEventId: number | null;
}) {
  const start = startOfWeek(currentDate);
  const end = endOfWeek(currentDate);
  const days = eachDayOfInterval({ start, end });

  const filteredByStatus = events.filter((e) => matchesStatusFilter(e, statusFilter));

  const eventsByDate: Record<string, CalendarEvent[]> = {};
  let totalThisWeek = 0;
  filteredByStatus.forEach((event) => {
    const eventDate = event.startTime ? toEST(event.startTime) : toEST(event.date);
    const dateKey = format(eventDate, "yyyy-MM-dd");
    // Only group/count events that actually fall within this week's range.
    if (eventDate < start || eventDate > end) return;
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push(event);
    totalThisWeek += 1;
  });
  Object.values(eventsByDate).forEach((arr) =>
    arr.sort((a, b) => (a.startTime ? new Date(a.startTime).getTime() : 0) - (b.startTime ? new Date(b.startTime).getTime() : 0))
  );

  return (
    <div className="h-full overflow-y-auto pb-4">
      {/* Week summary banner */}
      <div className="px-4 py-2 bg-muted/30 border-b text-xs text-muted-foreground flex items-center justify-between sticky top-0 z-20">
        <span>
          {format(start, "MMM d")} – {format(end, "MMM d")}
        </span>
        <span data-testid="text-agenda-total">
          {totalThisWeek} booking{totalThisWeek !== 1 ? "s" : ""} this week
        </span>
      </div>

      {days.map((day) => {
        const dateKey = format(day, "yyyy-MM-dd");
        const dayEvents = eventsByDate[dateKey] ?? [];
        const isCurrentDay = isToday(day);
        return (
          <div key={dateKey} className="border-b last:border-b-0" data-testid={`agenda-day-${dateKey}`}>
            {/* Day header */}
            <div className={`px-4 py-2.5 flex items-center gap-3 ${isCurrentDay ? "bg-primary/5 border-l-4 border-primary" : "bg-background"}`}>
              <div className={`text-2xl font-bold leading-none w-9 text-center ${isCurrentDay ? "text-primary" : ""}`}>
                {format(day, "d")}
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-semibold leading-tight ${isCurrentDay ? "text-primary" : ""}`}>
                  {format(day, "EEEE")}
                  {isCurrentDay && <span className="ml-2 text-[10px] uppercase tracking-wide bg-primary text-primary-foreground rounded px-1.5 py-0.5 align-middle">Today</span>}
                </div>
                <div className="text-xs text-muted-foreground leading-tight">{format(day, "MMM yyyy")}</div>
              </div>
              <span className="text-xs text-muted-foreground">
                {dayEvents.length === 0 ? "Free" : `${dayEvents.length} job${dayEvents.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {/* Events for this day */}
            {dayEvents.length > 0 && (
              <div className="divide-y">
                {dayEvents.map((event) => {
                  const statusColor = getStatusColor(event.status, event.hasIssue, filterColors);
                  const eventStyle = getStatusInlineEventStyles(event.status, event.hasIssue, filterColors);
                  const statusKey = String(event.status ?? "SCHEDULED");
                  const statusLabel = statusKey === "NEEDS_RESCHEDULE"
                    ? "Reschedule"
                    : statusKey.charAt(0) + statusKey.slice(1).toLowerCase();
                  const isHighlighted = highlightedEventId === event.id;
                  return (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className={`w-full text-left flex items-stretch gap-0 hover:bg-muted/20${event.id === highlightedEventId ? " booking-highlight-row" : ""}`}
                      data-testid={`agenda-event-${event.id}`}
                    >
                      <div className="w-1 flex-shrink-0" style={{ backgroundColor: statusColor }} />
                      <div className="flex-1 px-4 py-3 min-w-0">
                        {event.startTime && (
                          <div className="text-xs font-semibold text-muted-foreground mb-1">
                            {formatEST(event.startTime, "h:mm a")}
                            {event.endTime ? (
                              <span className="text-muted-foreground/70"> – {formatEST(event.endTime, "h:mm a")}</span>
                            ) : null}
                          </div>
                        )}
                        <div className="font-semibold text-sm leading-snug break-words">{event.title}</div>
                        {event.address && (
                          <div className="text-xs text-muted-foreground mt-1 break-words flex items-start gap-1">
                            <MapPin className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="min-w-0">{event.address}</span>
                          </div>
                        )}
                        {(event.assignedUserNames ?? []).length > 0 && (
                          <div className="text-xs text-foreground mt-1 break-words">
                            {shortNames(event.assignedUserNames!)}
                          </div>
                        )}
                        <div className="mt-1.5">
                          <span
                            className="inline-block text-[10px] px-1.5 py-0.5 rounded font-medium leading-none"
                            style={eventStyle}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Job Status View with color-coded status indicators and Day/Week/Month range
function SevenDayStatusView({
  events,
  onEventClick,
  filterColors,
}: {
  events: CalendarEvent[];
  onEventClick: (event: CalendarEvent) => void;
  filterColors: FilterColorMap;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<"day" | "week" | "month">("week");
  const today = startOfDay(toEST(new Date()));
  
  const getDateRange = () => {
    switch (timeRange) {
      case "day":
        return { start: today, end: today };
      case "week":
        return { start: today, end: addDays(today, 6) };
      case "month":
        return { start: today, end: addDays(today, 29) };
    }
  };
  
  const { start: rangeStart, end: rangeEnd } = getDateRange();
  const daysInRange = eachDayOfInterval({ start: rangeStart, end: rangeEnd });
  
  const eventsByDay = daysInRange.map(day => {
    let dayEvents = events.filter(event => {
      const eventDate = event.startTime 
        ? startOfDay(toEST(event.startTime)) 
        : startOfDay(toEST(event.date));
      return isSameDay(eventDate, day);
    });
    
    if (statusFilter) {
      dayEvents = dayEvents.filter(event => {
        const eventStatus = event.status?.toUpperCase() || "SCHEDULED";
        if (statusFilter === "SCHEDULED") {
          return eventStatus === "SCHEDULED" || !event.status;
        }
        if (statusFilter === "ISSUE") {
          return eventStatus === "ISSUE" || event.hasIssue;
        }
        if (statusFilter === "COMPLETED") {
          return eventStatus === "COMPLETED";
        }
        return eventStatus === statusFilter;
      });
    } else {
      dayEvents = dayEvents.filter(event => {
        const eventStatus = event.status?.toUpperCase() || "SCHEDULED";
        return eventStatus !== "COMPLETED";
      });
    }
    
    return { date: day, events: dayEvents };
  });
  
  const getStatusBorderStyle = (status: string | null | undefined, hasIssue?: boolean): React.CSSProperties => {
    const color = getStatusColor(status, hasIssue, filterColors);
    return { borderLeftColor: color };
  };
  
  const allRangeEvents = daysInRange.flatMap(day => 
    events.filter(event => {
      const eventDate = event.startTime 
        ? startOfDay(toEST(event.startTime)) 
        : startOfDay(toEST(event.date));
      return isSameDay(eventDate, day);
    })
  );
  
  const statusCounts = {
    confirmed: allRangeEvents.filter(e => e.status?.toUpperCase() === "CONFIRMED").length,
    scheduled: allRangeEvents.filter(e => !e.status || e.status?.toUpperCase() === "SCHEDULED").length,
    reschedule: allRangeEvents.filter(e => e.status?.toUpperCase() === "NEEDS_RESCHEDULE").length,
    issues: allRangeEvents.filter(e => e.status?.toUpperCase() === "ISSUE" || e.hasIssue).length,
    completed: allRangeEvents.filter(e => e.status?.toUpperCase() === "COMPLETED").length,
    survey: allRangeEvents.filter(e => e.status?.toUpperCase() === "SURVEY").length,
  };
  
  const totalEvents = allRangeEvents.filter(e => e.status?.toUpperCase() !== "COMPLETED").length;
  
  const toggleFilter = (filter: string) => {
    if (statusFilter === filter) {
      setStatusFilter(null);
    } else {
      setStatusFilter(filter);
      if (!isExpanded) setIsExpanded(true);
    }
  };
  
  const timeRangeLabel = timeRange === "day" ? "Today" : timeRange === "week" ? "7-Day" : "30-Day";
  
  const getGridCols = () => {
    if (timeRange === "day") return "grid-cols-1";
    if (timeRange === "week") return "grid-cols-2 sm:grid-cols-4 md:grid-cols-7";
    return "grid-cols-2 sm:grid-cols-5 md:grid-cols-7";
  };
  
  return (
    <div className="border-t" data-testid="seven-day-status-view">
      <div className="w-full p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-muted/30">
        <div className="flex items-center gap-2 flex-wrap">
          <div 
            className="flex items-center gap-2 cursor-pointer hover-elevate px-2 py-1 rounded"
            onClick={() => setIsExpanded(!isExpanded)}
            data-testid="button-toggle-7day-view"
          >
            <CalendarIcon className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">{timeRangeLabel} Job Status</span>
            <Badge variant="secondary" className="text-xs">
              {totalEvents} jobs
            </Badge>
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex items-center gap-1 border rounded-md p-0.5" data-testid="time-range-selector">
            {(["day", "week", "month"] as const).map(range => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                  timeRange === range 
                    ? "bg-primary text-primary-foreground" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid={`time-range-${range}`}
              >
                {range === "day" ? "Day" : range === "week" ? "Week" : "Month"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-xs flex-wrap">
            {([
              { key: "CONFIRMED", label: "Confirmed", count: statusCounts.confirmed, testId: "status-filter-confirmed" },
              { key: "SCHEDULED", label: "Scheduled", count: statusCounts.scheduled, testId: "status-filter-scheduled" },
              { key: "SURVEY", label: "Survey", count: statusCounts.survey, testId: "status-filter-survey" },
              { key: "NEEDS_RESCHEDULE", label: "Reschedule", count: statusCounts.reschedule, testId: "status-filter-reschedule" },
              { key: "ISSUE", label: "Issues", count: statusCounts.issues, testId: "status-filter-issues" },
              { key: "COMPLETED", label: "Completed", count: statusCounts.completed, testId: "status-filter-completed" },
            ] as const).map((item) => {
              const hex = getStatusColor(item.key === "ISSUE" ? "ISSUE" : item.key, false, filterColors);
              const rgb = hexToRgb(hex);
              const isActive = statusFilter === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => toggleFilter(item.key)}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded transition-all"
                  style={{
                    backgroundColor: rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isActive ? 0.3 : 0.1})` : undefined,
                    border: isActive ? `2px solid ${hex}` : `1px solid ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)` : hex}`,
                    boxShadow: isActive ? `0 0 0 2px ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)` : 'transparent'}` : undefined,
                  }}
                  data-testid={item.testId}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hex }} />
                  <span className="font-medium" style={{ color: hex }}>{item.count}</span>
                  <span style={{ color: hex }}>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      
      {isExpanded && (
        <div className="p-3 bg-muted/10 border-t" data-testid="seven-day-content">
          {statusFilter && (
            <div className="flex items-center justify-between mb-2 pb-2 border-b">
              <span className="text-xs text-muted-foreground">
                Filtering by: <span className="font-medium">{statusFilter === "NEEDS_RESCHEDULE" ? "Reschedule" : statusFilter.charAt(0) + statusFilter.slice(1).toLowerCase()}</span>
              </span>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setStatusFilter(null)}
                data-testid="button-clear-filter"
              >
                <X className="h-3 w-3 mr-1" />
                Clear filter
              </Button>
            </div>
          )}
          
          <div className="sm:hidden flex flex-wrap items-center gap-2 text-xs mb-3 pb-2 border-b">
            {([
              { key: "CONFIRMED", label: "Confirmed", count: statusCounts.confirmed },
              { key: "SCHEDULED", label: "Scheduled", count: statusCounts.scheduled },
              { key: "SURVEY", label: "Survey", count: statusCounts.survey },
              { key: "NEEDS_RESCHEDULE", label: "Reschedule", count: statusCounts.reschedule },
              { key: "ISSUE", label: "Issues", count: statusCounts.issues },
              { key: "COMPLETED", label: "Completed", count: statusCounts.completed },
            ] as const).map((item) => {
              const hex = getStatusColor(item.key === "ISSUE" ? "ISSUE" : item.key, false, filterColors);
              const rgb = hexToRgb(hex);
              const isActive = statusFilter === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => toggleFilter(item.key)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded transition-all"
                  style={{
                    backgroundColor: rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${isActive ? 0.3 : 0.1})` : undefined,
                    border: isActive ? `2px solid ${hex}` : `1px solid ${rgb ? `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)` : hex}`,
                  }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: hex }} />
                  <span className="font-medium" style={{ color: hex }}>{item.count}</span>
                  <span className="text-muted-foreground">{item.label}</span>
                </button>
              );
            })}
          </div>
          
          {statusFilter ? (
            timeRange === "day" ? (
              <div className="space-y-1.5">
                {eventsByDay[0]?.events.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No {statusFilter === "NEEDS_RESCHEDULE" ? "reschedule" : statusFilter.toLowerCase()} jobs today
                  </div>
                ) : (
                  eventsByDay[0]?.events.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => onEventClick(event)}
                      className="w-full text-left p-3 rounded-md border-l-4 hover-elevate bg-card border"
                      style={getStatusBorderStyle(event.status, event.hasIssue)}
                      data-testid={`job-status-event-${event.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium text-sm truncate">{event.title}</div>
                        {event.startTime && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatEST(event.startTime, "h:mm a")}
                          </span>
                        )}
                      </div>
                      {event.address && (
                        <div className="text-xs text-muted-foreground mt-1 truncate">{event.address}</div>
                      )}
                    </button>
                  ))
                )}
              </div>
            ) : (
              <div className={`grid ${getGridCols()} gap-2`}>
                {eventsByDay.map(({ date, events: dayEvents }) => (
                  <div 
                    key={date.toISOString()} 
                    className={`p-2 rounded-lg border ${isToday(date) ? 'bg-primary/5 border-primary/30' : 'bg-card'}`}
                  >
                    <div className="text-xs font-medium mb-2 flex items-center justify-between">
                      <span className={isToday(date) ? "text-primary" : ""}>
                        {timeRange === "month" ? format(date, "MMM d") : format(date, "EEE")}
                      </span>
                      <span className={`text-sm ${isToday(date) ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        {timeRange === "month" ? format(date, "EEE") : format(date, "d")}
                      </span>
                    </div>
                    {dayEvents.length === 0 ? (
                      <div className="text-xs text-muted-foreground/50 text-center py-2">
                        None
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {dayEvents.map((event) => (
                          <button
                            key={event.id}
                            onClick={() => onEventClick(event)}
                            className="w-full text-left p-1.5 rounded text-xs border-l-4 hover-elevate bg-background"
                            style={getStatusBorderStyle(event.status, event.hasIssue)}
                            data-testid={`job-status-event-${event.id}`}
                          >
                            <div className="font-medium truncate">
                              {event.title}
                            </div>
                            {event.startTime && (
                              <div className="text-muted-foreground text-[10px]">
                                {formatEST(event.startTime, "h:mm a")}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="text-center py-4 text-sm text-muted-foreground">
              Click a status above to filter and view jobs
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Event Detail Dialog Component with Attachments, Edit, and Photo Upload
function EventDetailDialog({
  event,
  onClose,
  onDelete,
  isDeleting,
  onEventUpdated,
  forceOpen,
}: {
  event: CalendarEvent | null;
  onClose: () => void;
  onDelete: (id: number) => void;
  isDeleting: boolean;
  onEventUpdated?: (updatedEvent: CalendarEvent) => void;
  forceOpen?: boolean;
}) {
  const [isXlScreen, setIsXlScreen] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1280px)");
    const handler = (e: MediaQueryListEvent | MediaQueryList) => setIsXlScreen(e.matches);
    handler(mql);
    mql.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
    return () => mql.removeEventListener("change", handler as (e: MediaQueryListEvent) => void);
  }, []);
  const todayDateStr = formatEST(new Date(), "yyyy-MM-dd");
  const BOOKING_STEP_SECONDS = 1800;
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "super_admin";
  const isSuperAdmin = currentUser?.role === "super_admin";
  const isInstallManager = currentUser?.role === "user" && (currentUser as any).jobTitle === "Install Manager";
  const canEdit = (isAdmin && !isSuperAdmin) || isInstallManager;
  const canDelete = canEdit && (event?.createdBy === currentUser?.id || (isAdmin && !isSuperAdmin) || isInstallManager);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isEditingJobId, setIsEditingJobId] = useState(false);
  const [jobIdDraft, setJobIdDraft] = useState("");
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    startDate: "",
    startTime: "",
    endDate: "",
    endTime: "",
    status: "",
    address: "",
    hasIssue: false,
    issueDescription: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    secondaryPocName: "",
    secondaryPocPhone: "",
    secondaryPocEmail: "",
  });
  const [editFiles, setEditFiles] = useState<File[]>([]);
  
  const { data: detailGlobalTags = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["/api/global-tags"],
  });

  // Photo upload with tagging
  const [pendingPhotos, setPendingPhotos] = useState<FileList | null>(null);
  const [photoTags, setPhotoTags] = useState<string[]>([]);
  const [photoDescription, setPhotoDescription] = useState("");
  const [showTaggingForm, setShowTaggingForm] = useState(false);
  
  // Issue reporting
  const [showIssueForm, setShowIssueForm] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");

  // Reset all transient edit/UI state whenever the opened event changes
  // (including when it closes and event becomes null). This prevents a job
  // that was left in Edit Mode from re-opening another job in Edit Mode.
  useEffect(() => {
    setIsEditing(false);
    setIsEditingJobId(false);
    setShowIssueForm(false);
    setShowDeleteConfirm(false);
    setShowSaveConfirm(false);
    setEditFiles([]);
  }, [event?.id]);

  // On My Way timer (runs silently in backend)
  const { data: timerData, refetch: refetchTimer } = useQuery<{ timer: any; allTimers: any[]; totalSeconds: number; eventTotalSeconds: number; activeUserIds: number[] }>({
    queryKey: ["/api/job-timers", event?.id],
    enabled: !!event,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const activeTimer = timerData?.timer?.status === "active" ? timerData.timer : null;
  const activeUserIds: number[] = timerData?.activeUserIds ?? [];
  const hasCompletedTime = timerData?.totalSeconds != null && timerData.totalSeconds > 0;
  const eventTotalSeconds = (timerData as any)?.eventTotalSeconds ?? 0;

  const updateJobIdMutation = useMutation({
    mutationFn: async (newJobId: string) => {
      const trimmed = newJobId.trim();
      if (!trimmed) throw new Error("Job ID cannot be empty");
      const currentTitle = (event as any)?.title || "";
      const currentJobId = event?.workJobNumber || "";
      // Replace the old job id in the title if present, else append "INSTALL - {id}"
      let newTitle = currentTitle;
      if (currentJobId && currentTitle.includes(currentJobId)) {
        newTitle = currentTitle.replace(currentJobId, trimmed);
      } else if (currentTitle.startsWith("INSTALL - ")) {
        newTitle = `INSTALL - ${trimmed}`;
      } else if (!currentTitle) {
        newTitle = `INSTALL - ${trimmed}`;
      }
      const res = await apiRequest("PATCH", `/api/calendar-events/${event?.id}`, {
        workJobNumber: trimmed,
        title: newTitle,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Job ID updated" });
      setIsEditingJobId(false);
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update Job ID", description: error.message, variant: "destructive" });
    },
  });

  const startTimerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/job-timers/${event?.id}/start`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to start timer");
      return res.json();
    },
    onSuccess: () => {
      refetchTimer();
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "On My Way!", description: "Customer notified. Drive safe!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // User assignment
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [showAssignmentDropdown, setShowAssignmentDropdown] = useState(false);

  const { data: allUsers } = useQuery<any[]>({
    queryKey: ["/api/admin/assignable-users"],
    enabled: (isAdmin || isInstallManager) && !!event,
  });

  const [showEmailPanel, setShowEmailPanel] = useState(false);
  const [emailUserIds, setEmailUserIds] = useState<number[]>([]);
  const [sendingEmailUserId, setSendingEmailUserId] = useState<number | null>(null);

  const assignmentMutation = useMutation({
    mutationFn: async (userIds: number[]) => {
      const res = await fetch(`/api/calendar-events/${event?.id}/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update assignments");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Assignments saved", description: "User assignments have been updated." });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setShowAssignmentDropdown(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update assignments", description: error.message, variant: "destructive" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (userIds: number[]) => {
      const res = await fetch(`/api/calendar-events/${event?.id}/send-assignment-emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to send emails");
      return res.json();
    },
    onSuccess: (data: { sentTo: string[]; failed: string[] }) => {
      if (data.sentTo.length > 0) {
        toast({ title: "Emails sent", description: `Notification sent to: ${data.sentTo.join(", ")}` });
      }
      if (data.failed.length > 0) {
        toast({ title: "Some emails failed", description: `Could not send to: ${data.failed.join(", ")}`, variant: "destructive" });
      }
      setEmailUserIds([]);
      setSendingEmailUserId(null);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to send emails", description: error.message, variant: "destructive" });
      setSendingEmailUserId(null);
    },
  });

  const [sendingCustomerEmail, setSendingCustomerEmail] = useState(false);
  const sendCustomerEmailMutation = useMutation({
    mutationFn: async () => {
      if (!event) throw new Error("No event selected");
      const job = eventDetails?.job;
      const evtData = eventDetails?.event as any;
      const customerEmail = job?.customerEmail || evtData?.customerEmail;
      if (!customerEmail) throw new Error("Customer email is required");
      const rawStartTime = event.startTime || event.date;
      const rawEndTime = event.endTime;
      const scheduledDate = formatEST(rawStartTime, "MMMM d, yyyy");
      const scheduledTime = rawEndTime
        ? `${formatEST(rawStartTime, "h:mm a")} - ${formatEST(rawEndTime, "h:mm a")}`
        : formatEST(rawStartTime, "h:mm a");
      const address = job?.formattedAddress || job?.address || evtData?.address || (event as any).address || "";
      const res = await fetch("/api/notifications/send-schedule-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: job?.id || null,
          calendarEventId: event.id,
          customerEmail,
          customerName: job?.customerName || evtData?.customerName || "Valued Customer",
          scheduledDate,
          scheduledTime,
          address,
        }),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Failed to send email" }));
        throw new Error(err.error || "Failed to send email");
      }
      return res.json();
    },
    onSuccess: () => {
      setSendingCustomerEmail(false);
      toast({ title: "Email Sent", description: "Confirmation email has been sent to the customer." });
    },
    onError: (error: Error) => {
      setSendingCustomerEmail(false);
      toast({ title: "Failed to send email", description: error.message, variant: "destructive" });
    },
  });

  const { data: eventDetails, isLoading, refetch } = useQuery<{
    event: CalendarEvent;
    job: any | null;
    installEvent: any | null;
    attachments: any[];
    assignments?: any[];
  }>({
    queryKey: ["/api/calendar-events", event?.id, "details"],
    queryFn: async () => {
      if (!event?.id) return null;
      const res = await fetch(`/api/calendar-events/${event.id}/details`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch event details");
      return res.json();
    },
    enabled: !!event?.id,
    refetchInterval: 30000,
    staleTime: 20000,
  });

  useEffect(() => {
    if (eventDetails?.assignments) {
      setSelectedUserIds(eventDetails.assignments.map((a: any) => a.userId));
    } else {
      setSelectedUserIds([]);
    }
  }, [eventDetails?.assignments]);

  // Event time window — mirror the backend assignment-conflict logic exactly:
  // start = startTime || date; end = endTime || (start + 1 hour).
  const evStartIso = (event?.startTime || event?.date) as string | undefined;
  const evStartMs = evStartIso ? new Date(evStartIso).getTime() : undefined;
  const evEndMs =
    event?.endTime
      ? new Date(event.endTime).getTime()
      : evStartMs !== undefined
        ? evStartMs + 60 * 60 * 1000
        : undefined;

  const { data: slotBlocks } = useQuery<AvailabilityBlockWithUser[]>({
    queryKey: [
      "/api/availability-blocks?from=" +
        (evStartMs !== undefined ? new Date(evStartMs).toISOString() : "") +
        "&to=" +
        (evEndMs !== undefined ? new Date(evEndMs).toISOString() : ""),
    ],
    enabled: !!event && evStartMs !== undefined && evEndMs !== undefined,
  });

  // Map of userId -> their overlapping block for this event's time window.
  // Uses strict overlap (startAt < end && endAt > start) to match the backend.
  const unavailableUserMap = (() => {
    const map = new Map<number, AvailabilityBlockWithUser>();
    if (!slotBlocks || evStartMs === undefined || evEndMs === undefined) return map;
    for (const b of slotBlocks) {
      const bStart = new Date(b.startAt).getTime();
      const bEnd = new Date(b.endAt).getTime();
      if (bStart < evEndMs && bEnd > evStartMs) {
        if (!map.has(b.userId)) map.set(b.userId, b);
      }
    }
    return map;
  })();

  // Extract address from description as fallback (pattern: "Address: ...")
  const descriptionAddress = (() => {
    const desc = eventDetails?.event?.description || event?.description || "";
    const match = desc.match(/Address:\s*(.+?)(?:\n|$)/);
    if (match && match[1]) {
      const addr = match[1].trim();
      if (addr && addr !== "No address provided" && addr !== "N/A") return addr;
    }
    return null;
  })();

  // Weather forecast query - prefer formattedAddress which includes city/state for better geocoding
  const weatherAddress = eventDetails?.job?.formattedAddress || eventDetails?.event?.address || 
    (eventDetails?.job?.address && eventDetails?.job?.city && eventDetails?.job?.state 
      ? `${eventDetails.job.address}, ${eventDetails.job.city}, ${eventDetails.job.state}` 
      : null) || descriptionAddress;
  const eventDateStr = event?.startTime || event?.date;
  
  interface WeatherForecastData {
    eventDay: {
      temp: number;
      feelsLike: number;
      precipProb: number;
      windSpeed: number;
      summary: string;
      icon: string;
      humidity: number;
    } | null;
    fiveDayForecast: Array<{
      date: string;
      dayOfWeek: string;
      tempHigh: number;
      tempLow: number;
      precipProb: number;
      summary: string;
      icon: string;
    }>;
  }
  
  const { data: weatherData, isLoading: isWeatherLoading } = useQuery<WeatherForecastData | null>({
    queryKey: ["/api/weather/forecast", weatherAddress, eventDateStr],
    queryFn: async () => {
      if (!weatherAddress) return null;
      const params = new URLSearchParams({ address: weatherAddress });
      if (eventDateStr) {
        params.append("eventDate", new Date(eventDateStr).toISOString());
      }
      const res = await fetch(`/api/weather/forecast?${params}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!weatherAddress && !!event?.id && !isLoading,
  });

  const updateEventMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/calendar-events/${event?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update event");
      return res.json();
    },
    onSuccess: (updatedEvent: CalendarEvent) => {
      toast({ title: "Event updated successfully" });
      setIsEditing(false);
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      if (event?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/calendar-events/${event.id}/activity`] });
        if (event.projectId) {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${event.projectId}/activity`] });
        }
      }
      refetch();
      if (onEventUpdated) {
        onEventUpdated(updatedEvent);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update event", description: error.message, variant: "destructive" });
    },
  });

  const rescheduleMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/calendar-events/${event?.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "NEEDS_RESCHEDULE", hasIssue: false }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to reschedule event");
      return res.json();
    },
    onSuccess: (updatedEvent: CalendarEvent) => {
      toast({ title: "Booking marked for reschedule" });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      if (event?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/calendar-events/${event.id}/activity`] });
        if (event.projectId) {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${event.projectId}/activity`] });
        }
      }
      refetch();
      if (onEventUpdated) {
        onEventUpdated(updatedEvent);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to reschedule", description: error.message, variant: "destructive" });
    },
  });

  const uploadPhotosMutation = useMutation({
    mutationFn: async ({ files, tags, description }: { files: FileList; tags: string[]; description: string }) => {
      const jobId = eventDetails?.job?.id;
      if (!jobId) throw new Error("No job linked to this event");
      
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append("photos", files[i]);
      }
      formData.append("tags", JSON.stringify(tags));
      formData.append("description", description);
      
      const res = await fetch(`/api/jobs/${jobId}/upload-photos`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to upload photos");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      const count = variables.files.length;
      toast({ title: `${count} photo${count !== 1 ? "s" : ""} uploaded successfully`, description: "AI is analyzing the images for tags", variant: "success" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setPendingPhotos(null);
      setPhotoTags([]);
      setPhotoDescription("");
      setShowTaggingForm(false);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to upload photos", description: error.message, variant: "destructive" });
    },
  });
  
  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachmentId: number) => {
      const res = await fetch(`/api/attachments/${attachmentId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete photo");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Photo removed" });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to remove photo", description: error.message, variant: "destructive" });
    },
  });

  const reportIssueMutation = useMutation({
    mutationFn: async (issueDesc: string) => {
      if (!event?.id) throw new Error("No event selected");
      const res = await fetch(`/api/calendar-events/${event.id}/report-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueDescription: issueDesc }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to report issue");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ 
        title: "Issue Reported", 
        description: data.emailSent ? "Email sent to sales and install team" : "Issue flagged (email pending)"
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      if (event?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/calendar-events/${event.id}/activity`] });
        if (event.projectId) {
          queryClient.invalidateQueries({ queryKey: [`/api/projects/${event.projectId}/activity`] });
        }
      }
      setShowIssueForm(false);
      setIssueDescription("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to report issue", description: error.message, variant: "destructive" });
    },
  });

  const handleStartEdit = () => {
    if (!event) return;
    const rawStart = event.startTime || event.date;
    const rawEnd = event.endTime || event.date;
    
    // Get address from event or job
    const eventAddress = (event as any).address || eventDetails?.job?.address || eventDetails?.job?.formattedAddress || "";
    
    const detailCustName = job?.customerName || (event as any)?.customerName || "";
    const detailCustPhone = job?.customerPhone || (event as any)?.customerPhone || "";
    const detailCustEmail = job?.customerEmail || (event as any)?.customerEmail || "";
    const detailSecPocName = (event as any)?.secondaryPocName || job?.secondaryPocName || "";
    const detailSecPocPhone = (event as any)?.secondaryPocPhone || job?.secondaryPocPhone || "";
    const detailSecPocEmail = (event as any)?.secondaryPocEmail || job?.secondaryPocEmail || "";
    setEditForm({
      title: event.title || "",
      description: event.description || "",
      startDate: formatEST(rawStart, "yyyy-MM-dd"),
      startTime: formatEST(rawStart, "HH:mm"),
      endDate: formatEST(rawEnd, "yyyy-MM-dd"),
      endTime: formatEST(rawEnd, "HH:mm"),
      status: event.status || "SCHEDULED",
      address: eventAddress,
      hasIssue: (event as any).hasIssue || false,
      issueDescription: (event as any).issueDescription || "",
      customerName: detailCustName,
      customerPhone: detailCustPhone,
      customerEmail: detailCustEmail,
      secondaryPocName: detailSecPocName,
      secondaryPocPhone: detailSecPocPhone,
      secondaryPocEmail: detailSecPocEmail,
    });
    setEditFiles([]);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    setShowSaveConfirm(true);
  };

  const doSaveEdit = async () => {
    const startDateTime = fromEST(editForm.startDate, editForm.startTime);
    const endDateTime = fromEST(editForm.endDate, editForm.endTime);

    const origRawStart = event?.startTime || event?.date;
    const origStartDateStr = origRawStart ? formatEST(origRawStart, "yyyy-MM-dd") : "";
    const origStartTimeStr = origRawStart ? formatEST(origRawStart, "HH:mm") : "";
    const dateOrTimeChanged =
      editForm.startDate !== origStartDateStr || editForm.startTime !== origStartTimeStr;
    if (dateOrTimeChanged) {
      const editValidationError = validateBookingDateTime(
        editForm.startDate,
        editForm.startTime,
        editForm.endDate,
        editForm.endTime,
      );
      if (editValidationError) {
        toast({ title: "Invalid booking time", description: editValidationError, variant: "destructive" });
        return;
      }
    }

    if (editForm.status === "NEEDS_RESCHEDULE" && event) {
      const origRawStart = event.startTime || event.date;
      const origStartDate = formatEST(origRawStart, "yyyy-MM-dd");
      const origStartTime = formatEST(origRawStart, "HH:mm");

      if (editForm.startDate === origStartDate && editForm.startTime === origStartTime) {
        toast({ title: "Date or time must be changed to reschedule", variant: "destructive" });
        return;
      }

      const nowEST = toEST(new Date());
      const newStartEST = toEST(startDateTime);
      if (newStartEST <= nowEST) {
        toast({ title: "Rescheduled time must be in the future (CST)", variant: "destructive" });
        return;
      }
    }

    // First, if there are files to upload, upload them
    if (editFiles.length > 0 && event?.id) {
      const formData = new FormData();
      editFiles.forEach(file => formData.append("files", file));
      
      try {
        const res = await fetch(`/api/calendar-events/${event.id}/add-files`, {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          toast({ title: "Failed to upload files", variant: "destructive" });
        } else {
          toast({ title: "Files uploaded successfully", variant: "success" });
          setEditFiles([]);
        }
      } catch (error) {
        console.error("File upload error:", error);
      }
    }
    
    updateEventMutation.mutate({
      title: editForm.title,
      description: editForm.description,
      date: startDateTime.toISOString(),
      startTime: startDateTime.toISOString(),
      endTime: endDateTime.toISOString(),
      status: editForm.status,
      address: editForm.address,
      hasIssue: editForm.hasIssue,
      issueDescription: editForm.issueDescription,
      customerName: editForm.customerName,
      customerPhone: editForm.customerPhone,
      customerEmail: editForm.customerEmail,
      secondaryPocName: editForm.secondaryPocName,
      secondaryPocPhone: editForm.secondaryPocPhone,
      secondaryPocEmail: editForm.secondaryPocEmail,
    });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const MAX_PHOTOS = 50;
      const existingCount = photoAttachments.length;
      const remaining = Math.max(0, MAX_PHOTOS - existingCount);

      if (remaining === 0) {
        toast({
          title: "Photo limit reached",
          description: `You already have ${MAX_PHOTOS} photos. Please delete some before adding more.`,
          variant: "destructive",
        });
        e.target.value = "";
        return;
      }

      let filesToUse = e.target.files;
      if (e.target.files.length > remaining) {
        const dt = new DataTransfer();
        for (let i = 0; i < remaining; i++) {
          dt.items.add(e.target.files[i]);
        }
        filesToUse = dt.files;
        toast({
          title: "Selection trimmed",
          description: `You selected ${e.target.files.length} photos but only ${remaining} more can be added (limit is ${MAX_PHOTOS}). The first ${remaining} photos will be uploaded.`,
        });
      }

      setPendingPhotos(filesToUse);
      setShowTaggingForm(true);
    }
  };
  
  const handleSubmitPhotosWithTags = () => {
    if (pendingPhotos) {
      uploadPhotosMutation.mutate({
        files: pendingPhotos,
        tags: photoTags,
        description: photoDescription,
      });
    }
  };
  
  const toggleTag = (tag: string) => {
    setPhotoTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  if (!event) return null;

  const isCompleted = event.status?.toUpperCase() === "COMPLETED";
  const isSurvey = event.status?.toUpperCase() === "SURVEY";
  const startTime = event.startTime ? toEST(event.startTime) : null;
  const endTime = event.endTime ? toEST(event.endTime) : null;
  const job = eventDetails?.job;
  const attachments = eventDetails?.attachments || [];
  const photoAttachments = attachments.filter((a: any) => a.category === "FINISHED_PHOTO");
  const docAttachments = attachments.filter((a: any) => a.category !== "FINISHED_PHOTO");

  const shouldShowDialog = isXlScreen ? !!forceOpen : !!event;

  return (
    <Dialog open={shouldShowDialog} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" data-testid="event-detail-dialog">
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-lg flex items-center justify-between">
            {isEditing ? "Edit Event" : event.title}
            {!isEditing && canEdit && !isCompleted && (
              <Button size="icon" variant="ghost" onClick={handleStartEdit} data-testid="button-edit-event">
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>
        
        {isEditing ? (
          <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editForm.title}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                data-testid="input-event-title"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  min={todayDateStr}
                  value={editForm.startDate}
                  onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })}
                  data-testid="input-start-date"
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  min={editForm.startDate || todayDateStr}
                  value={editForm.endDate}
                  onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })}
                  data-testid="input-end-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                  <SelectTrigger data-testid="select-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SCHEDULED" data-testid="option-scheduled">Scheduled</SelectItem>
                    <SelectItem value="CONFIRMED" data-testid="option-confirmed">Confirmed</SelectItem>
                    <SelectItem value="SURVEY" data-testid="option-survey">Survey</SelectItem>
                    <SelectItem value="NEEDS_RESCHEDULE" data-testid="option-reschedule">Needs Reschedule</SelectItem>
                    <SelectItem value="ISSUE" data-testid="option-issue">Issue</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-end">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <TimePickerSelect
                  value={editForm.startTime}
                  onChange={(startTime) => setEditForm({ ...editForm, startTime })}
                  data-testid="input-start-time"
                />
              </div>
              <div className="flex items-center justify-center text-muted-foreground text-lg font-light hidden sm:flex pb-2">—</div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <TimePickerSelect
                  value={editForm.endTime}
                  onChange={(endTime) => setEditForm({ ...editForm, endTime })}
                  data-testid="input-end-time"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={2}
                  data-testid="input-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Address</Label>
                <Input
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="Enter address for weather forecast..."
                  data-testid="input-event-address"
                />
              </div>
            </div>
            <div className="space-y-3 p-3 border rounded-lg">
              <h4 className="font-medium text-sm">Contact Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Customer Name</Label>
                  <Input
                    value={editForm.customerName}
                    onChange={(e) => setEditForm({ ...editForm, customerName: e.target.value })}
                    placeholder="Customer name"
                    data-testid="input-edit-customer-name"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input
                    value={editForm.customerPhone}
                    onChange={(e) => setEditForm({ ...editForm, customerPhone: e.target.value })}
                    placeholder="Phone number"
                    data-testid="input-edit-customer-phone"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Email</Label>
                  <Input
                    type="email"
                    value={editForm.customerEmail}
                    onChange={(e) => setEditForm({ ...editForm, customerEmail: e.target.value })}
                    placeholder="Email address"
                    data-testid="input-edit-customer-email"
                  />
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Secondary Point of Contact</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <Input
                      value={editForm.secondaryPocName}
                      onChange={(e) => setEditForm({ ...editForm, secondaryPocName: e.target.value })}
                      placeholder="Secondary contact name"
                      data-testid="input-edit-secondary-poc-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Phone</Label>
                    <Input
                      value={editForm.secondaryPocPhone}
                      onChange={(e) => setEditForm({ ...editForm, secondaryPocPhone: e.target.value })}
                      placeholder="Secondary phone"
                      data-testid="input-edit-secondary-poc-phone"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <Input
                      type="email"
                      value={editForm.secondaryPocEmail}
                      onChange={(e) => setEditForm({ ...editForm, secondaryPocEmail: e.target.value })}
                      placeholder="Secondary email"
                      data-testid="input-edit-secondary-poc-email"
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="space-y-3 p-3 rounded-md border border-destructive/30 bg-destructive/5">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="hasIssue"
                  checked={editForm.hasIssue}
                  onCheckedChange={(checked) => setEditForm({ ...editForm, hasIssue: !!checked })}
                  data-testid="checkbox-has-issue"
                />
                <Label htmlFor="hasIssue" className="text-destructive font-medium cursor-pointer">
                  Flag Issue
                </Label>
              </div>
              {editForm.hasIssue && (
                <div className="space-y-2">
                  <Label className="text-sm">Issue Description</Label>
                  <Textarea
                    value={editForm.issueDescription}
                    onChange={(e) => setEditForm({ ...editForm, issueDescription: e.target.value })}
                    placeholder="Describe the issue..."
                    rows={3}
                    data-testid="textarea-issue-description"
                  />
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Add Files (PDFs, images)</Label>
              <input
                ref={editFileInputRef}
                type="file"
                accept=".pdf,image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    setEditFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                  }
                }}
                data-testid="input-edit-files"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => editFileInputRef.current?.click()}
                data-testid="button-add-edit-files"
              >
                <FileText className="h-4 w-4 mr-2" />
                Add Files
              </Button>
              {editFiles.length > 0 && (
                <div className="space-y-1 mt-2">
                  {editFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between gap-2 text-sm bg-muted/50 rounded-md p-2">
                      <span className="truncate flex-1 min-w-0">{file.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditFiles(prev => prev.filter((_, i) => i !== index))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSaveEdit} disabled={updateEventMutation.isPending} data-testid="button-save-event">
                {updateEventMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save
              </Button>
              <Button variant="outline" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-2 overflow-y-auto flex-1 min-h-0 pr-1">
            {/* Time Display */}
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <div className="font-medium">
                  {event.startTime 
                    ? formatEST(event.startTime, "EEEE, MMMM d, yyyy")
                    : formatEST(event.date, "EEEE, MMMM d, yyyy")
                  }
                </div>
                {startTime && endTime && (
                  <div className="text-sm text-muted-foreground">
                    {formatEST(event.startTime, "h:mm a")} - {formatEST(event.endTime, "h:mm a")}
                    <span className="ml-2 text-xs">
                      ({Math.round((endTime.getTime() - startTime.getTime()) / (1000 * 60))} min)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Status Badge & Work Job Number & On My Way */}
            <div className="flex items-center gap-2 flex-wrap">
              {event.status && (
                <Badge
                  className={
                    event.status === "CONFIRMED"
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : event.status === "SCHEDULED"
                      ? "bg-orange-500 text-white hover:bg-orange-600"
                      : event.status === "NEEDS_RESCHEDULE"
                      ? "bg-blue-500 text-white hover:bg-blue-600"
                      : event.status === "ISSUE"
                      ? "bg-red-600 text-white hover:bg-red-700"
                      : event.status === "COMPLETED"
                      ? "bg-gray-400 text-white hover:bg-gray-500"
                      : ""
                  }
                >
                  {event.status === "NEEDS_RESCHEDULE" ? "RESCHEDULE" : event.status}
                </Badge>
              )}
              {event.workJobNumber && (
                isEditingJobId && canEdit && !isCompleted ? (
                  <div className="inline-flex items-center gap-1">
                    <Input
                      value={jobIdDraft}
                      onChange={(e) => setJobIdDraft(e.target.value)}
                      className="h-7 w-32 text-xs px-2"
                      autoFocus
                      data-testid="input-edit-job-id"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); updateJobIdMutation.mutate(jobIdDraft); }
                        if (e.key === "Escape") { e.preventDefault(); setIsEditingJobId(false); }
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => updateJobIdMutation.mutate(jobIdDraft)}
                      disabled={updateJobIdMutation.isPending || !jobIdDraft.trim() || jobIdDraft.trim() === event.workJobNumber}
                      data-testid="button-save-job-id"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setIsEditingJobId(false)}
                      disabled={updateJobIdMutation.isPending}
                      data-testid="button-cancel-job-id"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Badge
                    variant="outline"
                    data-testid="badge-work-job-number"
                    className={canEdit && !isCompleted ? "cursor-pointer hover-elevate active-elevate-2 inline-flex items-center gap-1" : ""}
                    onClick={() => {
                      if (!canEdit || isCompleted) return;
                      setJobIdDraft(event.workJobNumber || "");
                      setIsEditingJobId(true);
                    }}
                  >
                    {event.workJobNumber}
                    {canEdit && !isCompleted && <Edit2 className="h-3 w-3 opacity-60" />}
                  </Badge>
                )
              )}
              {!isEditing && eventTotalSeconds > 0 && (
                <Badge variant="outline" data-testid="badge-total-time">
                  <Timer className="h-3 w-3 mr-1" />
                  {formatDuration(eventTotalSeconds)}
                </Badge>
              )}
              {!isEditing && currentUser && event.status !== "COMPLETED" && (
                activeUserIds.length > 0 ? (
                  <Badge className="bg-green-600 text-white" data-testid="badge-timer-active">
                    <Car className="h-3 w-3 mr-1" />
                    In Progress
                  </Badge>
                ) : !isAdmin && !hasCompletedTime && eventDetails?.assignments?.some((a: any) => a.userId === currentUser.id) ? (
                  <Badge
                    className="bg-green-600 text-white cursor-pointer"
                    onClick={() => !startTimerMutation.isPending && startTimerMutation.mutate()}
                    data-testid="button-on-my-way"
                  >
                    <Car className="h-3 w-3 mr-1" />
                    {startTimerMutation.isPending ? "Starting..." : "On My Way"}
                  </Badge>
                ) : null
              )}
            </div>

            {(event.hasIssue || event.status === "ISSUE") && event.status !== "NEEDS_RESCHEDULE" && !isEditing && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-red-600 dark:text-red-400">
                  <AlertCircle className="h-4 w-4" />
                  Issue Reported
                </div>
                {event.issueDescription && (
                  <p className="text-sm text-red-600/80 dark:text-red-400/80">{event.issueDescription}</p>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-blue-500 text-blue-600 dark:text-blue-400"
                  onClick={() => {
                    if (!event) return;
                    const rawStart = event.startTime || event.date;
                    const rawEnd = event.endTime || event.date;
                    const eventAddress = (event as any).address || eventDetails?.job?.address || eventDetails?.job?.formattedAddress || "";
                    setEditForm({
                      title: event.title || "",
                      description: event.description || "",
                      startDate: formatEST(rawStart, "yyyy-MM-dd"),
                      startTime: formatEST(rawStart, "HH:mm"),
                      endDate: formatEST(rawEnd, "yyyy-MM-dd"),
                      endTime: formatEST(rawEnd, "HH:mm"),
                      status: "NEEDS_RESCHEDULE",
                      address: eventAddress,
                      hasIssue: false,
                      issueDescription: (event as any).issueDescription || "",
                    });
                    setEditFiles([]);
                    setIsEditing(true);
                  }}
                  data-testid="button-reschedule"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reschedule
                </Button>
              </div>
            )}

            {/* Job Details (from linked job or event customer fields) */}
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading details...
              </div>
            ) : (() => {
              const detailName = job?.customerName || (eventDetails?.event as any)?.customerName;
              const detailPhone = job?.customerPhone || (eventDetails?.event as any)?.customerPhone;
              const detailEmail = job?.customerEmail || (eventDetails?.event as any)?.customerEmail;
              const detailAddress = job?.formattedAddress || job?.address || (eventDetails?.event as any)?.address || (event as any)?.address;
              const secPocName = (eventDetails?.event as any)?.secondaryPocName || (job as any)?.secondaryPocName;
              const secPocPhone = (eventDetails?.event as any)?.secondaryPocPhone || (job as any)?.secondaryPocPhone;
              const secPocEmail = (eventDetails?.event as any)?.secondaryPocEmail || (job as any)?.secondaryPocEmail;
              const hasDetails = detailName || detailPhone || detailEmail || detailAddress;
              const hasSecondaryPoc = secPocName || secPocPhone || secPocEmail;

              return (hasDetails || hasSecondaryPoc) ? (
                <div className="space-y-2 p-3 border rounded-lg">
                  <h4 className="font-medium text-sm">Job Details</h4>
                  {detailName && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span>{detailName}</span>
                    </div>
                  )}
                  {detailPhone && (() => {
                    const { display, tel } = splitContactPhone(detailPhone);
                    return (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <a href={`tel:${tel}`} className="text-primary hover:underline" data-testid="link-customer-phone">
                          {display}
                        </a>
                      </div>
                    );
                  })()}
                  {detailEmail && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${detailEmail}`} className="text-primary hover:underline">
                        {detailEmail}
                      </a>
                    </div>
                  )}
                  {detailAddress && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                      <MapLinkPicker address={detailAddress} testIdPrefix="event-address">
                        <button
                          type="button"
                          className="text-primary hover:underline cursor-pointer text-left"
                          data-testid="link-address-map"
                        >
                          {detailAddress}
                        </button>
                      </MapLinkPicker>
                    </div>
                  )}
                  {hasSecondaryPoc && (
                    <div className="border-t pt-2 mt-2 space-y-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Secondary Contact</p>
                      {secPocName && (
                        <div className="flex items-center gap-2 text-sm">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{secPocName}</span>
                        </div>
                      )}
                      {secPocPhone && (() => {
                        const { display, tel } = splitContactPhone(secPocPhone);
                        return (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <a href={`tel:${tel}`} className="text-primary hover:underline" data-testid="link-secondary-phone">
                              {display}
                            </a>
                          </div>
                        );
                      })()}
                      {secPocEmail && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a href={`mailto:${secPocEmail}`} className="text-primary hover:underline">
                            {secPocEmail}
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : null;
            })()}

            {/* Send Email to Customer Button */}
            {(isAdmin || isInstallManager) && !isEditing && (job?.customerEmail || (eventDetails?.event as any)?.customerEmail) && (
              <div className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">Customer Notification</p>
                    <p className="text-xs text-muted-foreground">Send schedule confirmation to {job?.customerEmail || (eventDetails?.event as any)?.customerEmail}</p>
                  </div>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => {
                      setSendingCustomerEmail(true);
                      sendCustomerEmailMutation.mutate();
                    }}
                    disabled={sendCustomerEmailMutation.isPending}
                    data-testid="button-send-customer-email"
                  >
                    {sendCustomerEmailMutation.isPending ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</>
                    ) : (
                      <><Mail className="h-4 w-4 mr-2" />Send Email</>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {/* Assigned Users Section */}
            <div className="space-y-2 p-3 border rounded-lg" data-testid="assigned-users-section">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Assigned Users
                </h4>
                {canEdit && !isCompleted && (
                  <div className="flex items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setShowAssignmentDropdown(!showAssignmentDropdown); setShowEmailPanel(false); }}
                          data-testid="button-manage-assignments"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit assignments</TooltipContent>
                    </Tooltip>
                    {eventDetails?.assignments && eventDetails.assignments.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setShowEmailPanel(!showEmailPanel);
                              setShowAssignmentDropdown(false);
                              if (!showEmailPanel && eventDetails?.assignments) {
                                setEmailUserIds(eventDetails.assignments.map((a: any) => a.userId));
                              }
                            }}
                            data-testid="button-open-email-panel"
                          >
                            <Send className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Send email notifications</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
              {eventDetails?.assignments && eventDetails.assignments.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {eventDetails.assignments.map((assignment: any) => {
                    const isInProgress = activeUserIds.includes(assignment.userId);
                    const unavailBlock = unavailableUserMap.get(assignment.userId);
                    return (
                      <div key={assignment.userId} className="flex items-center gap-2" data-testid={`assigned-user-row-${assignment.userId}`}>
                        <Badge variant="secondary" data-testid={`badge-assigned-user-${assignment.userId}`}>
                          {assignment.user?.fullName || assignment.user?.username || `User #${assignment.userId}`}
                        </Badge>
                        {isInProgress && (
                          <Badge className="bg-green-600 text-white text-xs" data-testid={`badge-inprogress-${assignment.userId}`}>
                            In Progress
                          </Badge>
                        )}
                        {unavailBlock && (
                          <Badge
                            variant="outline"
                            className="text-xs border-rose-300 text-rose-700 dark:text-rose-300"
                            title={unavailBlock.reason || "Unavailable for this time slot"}
                            data-testid={`badge-unavailable-assigned-${assignment.userId}`}
                          >
                            Unavailable
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No users assigned</p>
              )}

              {/* Edit Assignments Panel */}
              {canEdit && showAssignmentDropdown && allUsers && (
                <div className="space-y-2 pt-2 border-t" data-testid="assignment-dropdown">
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {currentUser?.role === "super_admin" ? (
                      (() => {
                        const grouped = new Map<string, any[]>();
                        allUsers.forEach((u: any) => {
                          const adminName = u.adminName || "Unassigned";
                          if (!grouped.has(adminName)) grouped.set(adminName, []);
                          grouped.get(adminName)!.push(u);
                        });
                        return Array.from(grouped.entries()).map(([adminName, groupUsers]) => (
                          <div key={adminName} className="mb-2" data-testid={`admin-group-${adminName}`}>
                            <div className="flex items-center gap-1.5 px-1.5 py-1">
                              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{adminName}</span>
                            </div>
                            {groupUsers.map((u: any) => {
                              const unavailBlock = unavailableUserMap.get(u.id);
                              const hasConflict = !!unavailBlock;
                              // Disable adding a conflicting user, but allow unassigning one.
                              const isUnavailable = hasConflict && !selectedUserIds.includes(u.id);
                              return (
                              <label
                                key={u.id}
                                className={`flex items-center gap-2 text-sm p-1.5 pl-6 rounded ${isUnavailable ? "opacity-60 cursor-not-allowed" : "hover-elevate cursor-pointer"}`}
                                data-testid={`label-assign-user-${u.id}`}
                              >
                                <Checkbox
                                  checked={selectedUserIds.includes(u.id)}
                                  disabled={isUnavailable}
                                  onCheckedChange={(checked) => {
                                    if (isUnavailable) return;
                                    setSelectedUserIds(prev =>
                                      checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                                    );
                                  }}
                                  data-testid={`checkbox-assign-user-${u.id}`}
                                />
                                <span>{u.fullName || u.name || u.username}</span>
                                {hasConflict && (
                                  <Badge
                                    variant="outline"
                                    className="ml-auto text-[10px] border-rose-300 text-rose-700 dark:text-rose-300"
                                    title={unavailBlock?.reason || "Unavailable for this time slot"}
                                    data-testid={`badge-unavailable-assign-${u.id}`}
                                  >
                                    Unavailable
                                  </Badge>
                                )}
                              </label>
                              );
                            })}
                          </div>
                        ));
                      })()
                    ) : (
                      allUsers.map((u: any) => {
                        const unavailBlock = unavailableUserMap.get(u.id);
                        const hasConflict = !!unavailBlock;
                        // Disable adding a conflicting user, but allow unassigning one.
                        const isUnavailable = hasConflict && !selectedUserIds.includes(u.id);
                        return (
                        <label
                          key={u.id}
                          className={`flex items-center gap-2 text-sm p-1.5 rounded ${isUnavailable ? "opacity-60 cursor-not-allowed" : "hover-elevate cursor-pointer"}`}
                          data-testid={`label-assign-user-${u.id}`}
                        >
                          <Checkbox
                            checked={selectedUserIds.includes(u.id)}
                            disabled={isUnavailable}
                            onCheckedChange={(checked) => {
                              if (isUnavailable) return;
                              setSelectedUserIds(prev =>
                                checked ? [...prev, u.id] : prev.filter(id => id !== u.id)
                              );
                            }}
                            data-testid={`checkbox-assign-user-${u.id}`}
                          />
                          <span>{u.fullName || u.name || u.username}</span>
                          {hasConflict && (
                            <Badge
                              variant="outline"
                              className="ml-auto text-[10px] border-rose-300 text-rose-700 dark:text-rose-300"
                              title={unavailBlock?.reason || "Unavailable for this time slot"}
                              data-testid={`badge-unavailable-assign-${u.id}`}
                            >
                              Unavailable
                            </Badge>
                          )}
                        </label>
                        );
                      })
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => assignmentMutation.mutate(selectedUserIds)}
                    disabled={assignmentMutation.isPending}
                    data-testid="button-save-assignments"
                  >
                    {assignmentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Assignments
                  </Button>
                </div>
              )}

              {/* Send Email Notification Panel */}
              {canEdit && showEmailPanel && eventDetails?.assignments && eventDetails.assignments.length > 0 && (
                <div className="space-y-2 pt-2 border-t" data-testid="email-notification-panel">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase">Send Email Notification</p>
                    <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={emailUserIds.length === eventDetails.assignments.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEmailUserIds(eventDetails.assignments!.map((a: any) => a.userId));
                          } else {
                            setEmailUserIds([]);
                          }
                        }}
                        data-testid="checkbox-select-all-email"
                      />
                      <span>Select all</span>
                    </label>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {eventDetails.assignments.map((assignment: any) => {
                      const userName = assignment.user?.fullName || assignment.user?.username || `User #${assignment.userId}`;
                      const userEmail = assignment.user?.email;
                      return (
                        <div
                          key={assignment.userId}
                          className="flex items-center justify-between gap-2 text-sm p-1.5 rounded"
                          data-testid={`email-row-user-${assignment.userId}`}
                        >
                          <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                            <Checkbox
                              checked={emailUserIds.includes(assignment.userId)}
                              onCheckedChange={(checked) => {
                                setEmailUserIds(prev =>
                                  checked ? [...prev, assignment.userId] : prev.filter((id: number) => id !== assignment.userId)
                                );
                              }}
                              data-testid={`checkbox-email-user-${assignment.userId}`}
                            />
                            <span className="truncate">{userName}</span>
                            {userEmail && (
                              <span className="text-xs text-muted-foreground truncate hidden sm:inline">({userEmail})</span>
                            )}
                          </label>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                disabled={!userEmail || sendEmailMutation.isPending}
                                onClick={() => {
                                  setSendingEmailUserId(assignment.userId);
                                  sendEmailMutation.mutate([assignment.userId]);
                                }}
                                data-testid={`button-send-email-${assignment.userId}`}
                              >
                                {sendingEmailUserId === assignment.userId && sendEmailMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Mail className="h-3.5 w-3.5" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>{userEmail ? "Send email to this user" : "No email address"}</TooltipContent>
                          </Tooltip>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => sendEmailMutation.mutate(emailUserIds)}
                    disabled={emailUserIds.length === 0 || sendEmailMutation.isPending}
                    data-testid="button-send-selected-emails"
                  >
                    {sendEmailMutation.isPending && sendingEmailUserId === null ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Send to Selected ({emailUserIds.length})
                  </Button>
                </div>
              )}
            </div>

            {/* Weather Forecast Section */}
            {weatherAddress && (
              <div 
                className="space-y-3 p-3 border rounded-lg bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30"
                data-testid="weather-forecast-section"
              >
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-blue-500" />
                  Weather Forecast
                </h4>
                
                {isWeatherLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="weather-loading">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading weather...
                  </div>
                ) : weatherData ? (
                  <div className="space-y-3">
                    {/* Event Day Weather */}
                    {weatherData.eventDay && (
                      <div className="p-3 bg-white/50 dark:bg-black/20 rounded-lg" data-testid="weather-event-day">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Event Day</span>
                          <img 
                            src={`https://openweathermap.org/img/wn/${weatherData.eventDay.icon || '01d'}@2x.png`}
                            alt={weatherData.eventDay.summary || 'Weather'}
                            className="h-10 w-10"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="flex items-center gap-1.5" data-testid="weather-temp">
                            <Thermometer className="h-3.5 w-3.5 text-orange-500" />
                            <span>{weatherData.eventDay.temp}°F</span>
                            <span className="text-muted-foreground text-xs">(feels {weatherData.eventDay.feelsLike}°)</span>
                          </div>
                          <div className="flex items-center gap-1.5" data-testid="weather-precip">
                            <Droplets className="h-3.5 w-3.5 text-blue-500" />
                            <span>{weatherData.eventDay.precipProb}% rain</span>
                          </div>
                          <div className="flex items-center gap-1.5" data-testid="weather-wind">
                            <Wind className="h-3.5 w-3.5 text-gray-500" />
                            <span>{weatherData.eventDay.windSpeed} mph</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground" data-testid="weather-summary">
                            <span className="capitalize">{weatherData.eventDay.summary}</span>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground" data-testid="weather-unavailable">
                    Weather data unavailable
                  </div>
                )}
              </div>
            )}

            {/* Completed Project Read-Only View */}
            {isCompleted && (
              <div className="p-3 bg-gray-100 dark:bg-gray-800/50 border border-gray-300 dark:border-gray-700 rounded-lg" data-testid="completed-banner">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600 dark:text-gray-400">
                  <Shield className="h-4 w-4" />
                  This project is completed and cannot be edited
                </div>
              </div>
            )}

            {/* Photo Section - visible to all users except super admin */}
            {!isSuperAdmin && (isCompleted ? (
              <div className="space-y-2" data-testid="completed-photos-section">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Completed Install Photos
                </h4>
                {photoAttachments.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {photoAttachments.map((photo: any) => (
                      <div key={photo.id} className="relative aspect-square bg-muted rounded-lg overflow-hidden group">
                        <a
                          href={getImageUrl(photo.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full h-full hover:opacity-80 transition-opacity"
                          data-testid={`completed-photo-${photo.id}`}
                        >
                          <img
                            src={getImageUrl(photo.fileUrl)}
                            alt={photo.fileName}
                            className="w-full h-full object-cover"
                          />
                        </a>
                        {canEdit && (
                          <button
                            className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              if (window.confirm("Delete this photo? This cannot be undone.")) {
                                deleteAttachmentMutation.mutate(photo.id);
                              }
                            }}
                            title="Remove photo"
                            data-testid={`button-delete-photo-${photo.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {event.projectId ? (
                  <div className="flex gap-2">
                    <Link href={`/projects/${event.projectId}`}>
                      <Button
                        size="sm"
                        data-testid="button-view-completed-project"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        View Completed Project
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No linked project found</p>
                )}
              </div>
            ) : job ? (
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  {isSurvey ? "Site Survey Photos" : "Finished Install Photos"}
                </h4>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handlePhotoUpload}
                  data-testid="input-photo-upload"
                />
                {!showTaggingForm && (
                  <div className="flex gap-2 flex-wrap">
                    {isSurvey ? (
                      <Link href={(() => {
                        const params = new URLSearchParams();
                        if (event?.id) params.set("calendarEventId", String(event.id));
                        if (event?.title) params.set("jobName", event.title);
                        const evtData = eventDetails?.event as any;
                        const fullAddr = job?.formattedAddress || job?.address || evtData?.address || (event as any)?.address || "";
                        if (fullAddr) params.set("address", fullAddr);
                        if (event?.description) params.set("description", event.description);
                        const qs = params.toString();
                        return `/surveys/new${qs ? `?${qs}` : ""}`;
                      })()}>
                        <Button
                          size="sm"
                          data-testid="button-survey-photos-link"
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          <ClipboardCheck className="h-4 w-4 mr-2" />
                          Survey Photos
                        </Button>
                      </Link>
                    ) : (
                      <Link href={(() => {
                        const params = new URLSearchParams();
                        const evtData = eventDetails?.event as any;
                        if (event?.id) params.set("calendarEventId", String(event.id));
                        if (event?.workJobNumber) {
                          params.set("jobLabel", event.workJobNumber);
                        } else if (event?.title) {
                          const woMatch = event.title.match(/WO\s*(\S+)/i);
                          if (woMatch) params.set("jobLabel", `WO ${woMatch[1]}`);
                        }
                        const cName = job?.customerName || evtData?.customerName || (event as any)?.customerName;
                        const cPhone = job?.customerPhone || evtData?.customerPhone || (event as any)?.customerPhone;
                        const cEmail = job?.customerEmail || evtData?.customerEmail || (event as any)?.customerEmail;
                        if (cName) params.set("customerName", cName);
                        if (cPhone) params.set("customerPhone", cPhone);
                        if (cEmail) params.set("customerEmail", cEmail);
                        const fullAddr = job?.formattedAddress || job?.address || evtData?.address || (event as any)?.address || "";
                        if (fullAddr) params.set("address", fullAddr);
                        if (job?.city) { params.set("city", job.city); }
                        if (job?.state) { params.set("state", job.state); }
                        if (job?.postalCode) { params.set("postalCode", job.postalCode); }
                        if (!job?.city && fullAddr) {
                          const addrParts = fullAddr.split(",").map((s: string) => s.trim());
                          if (addrParts.length >= 3) {
                            params.set("city", addrParts[1]);
                            const stateZip = addrParts[2].trim().split(/\s+/);
                            if (stateZip[0]) params.set("state", stateZip[0]);
                            if (stateZip[1]) params.set("postalCode", stateZip[1]);
                          }
                        }
                        if (event?.description) params.set("description", event.description);
                        const qs = params.toString();
                        return `/projects/new${qs ? `?${qs}` : ""}`;
                      })()}>
                        <Button
                          size="sm"
                          data-testid="button-completed-photos-link"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Completed Photos
                        </Button>
                      </Link>
                    )}
                  </div>
                )}
                
                {/* Tagging Form - shown after selecting photos */}
                {showTaggingForm && pendingPhotos && (
                  <div className="space-y-3 p-3 bg-muted/30 rounded-lg border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">
                        {pendingPhotos.length} photo(s) selected
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setShowTaggingForm(false);
                          setPendingPhotos(null);
                          setPhotoTags([]);
                          setPhotoDescription("");
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs">Add Tags</Label>
                      <div className="flex flex-wrap gap-1">
                        {detailGlobalTags.map((tag) => (
                          <Badge
                            key={tag.id}
                            variant={photoTags.includes(tag.name) ? "default" : "outline"}
                            className="cursor-pointer text-xs"
                            onClick={() => toggleTag(tag.name)}
                            data-testid={`tag-${tag.name.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            {tag.name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs">Description (optional)</Label>
                      <Textarea
                        placeholder="Add notes about the finished install..."
                        value={photoDescription}
                        onChange={(e) => setPhotoDescription(e.target.value)}
                        className="text-sm resize-none"
                        rows={2}
                        data-testid="input-photo-description"
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSubmitPhotosWithTags}
                        disabled={uploadPhotosMutation.isPending}
                        data-testid="button-submit-photos"
                      >
                        {uploadPhotosMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Camera className="h-4 w-4 mr-2" />
                        )}
                        Upload with Tags
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => photoInputRef.current?.click()}
                        data-testid="button-add-more-photos"
                      >
                        Add More
                      </Button>
                    </div>
                  </div>
                )}
                
                {uploadPhotosMutation.isPending && pendingPhotos && (
                  <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg" data-testid="upload-progress-banner">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Uploading {pendingPhotos.length} photo{pendingPhotos.length !== 1 ? "s" : ""}...
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Please wait, this may take a moment for large files</p>
                    </div>
                  </div>
                )}

                {/* Display uploaded photos */}
                {photoAttachments.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                    {photoAttachments.map((photo: any) => (
                      <div key={photo.id} className="relative aspect-square bg-muted rounded-lg overflow-hidden group">
                        <a
                          href={getImageUrl(photo.fileUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block w-full h-full hover:opacity-80 transition-opacity"
                        >
                          <img
                            src={getImageUrl(photo.fileUrl)}
                            alt={photo.fileName}
                            className="w-full h-full object-cover"
                          />
                        </a>
                        {canEdit && (
                          <button
                            className="absolute top-1 right-1 bg-black/60 hover:bg-red-600 text-white rounded-full p-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              if (window.confirm("Delete this photo? This cannot be undone.")) {
                                deleteAttachmentMutation.mutate(photo.id);
                              }
                            }}
                            title="Remove photo"
                            data-testid={`button-delete-upload-photo-${photo.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              !isLoading ? (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Camera className="h-4 w-4" />
                    {isSurvey ? "Site Survey Photos" : "Finished Install Photos"}
                  </h4>
                  <div className="flex gap-2 flex-wrap">
                    {isSurvey ? (
                      <Link href={(() => {
                        const params = new URLSearchParams();
                        if (event?.id) params.set("calendarEventId", String(event.id));
                        if (event?.title) params.set("jobName", event.title);
                        const evtData = eventDetails?.event as any;
                        const fullAddr = evtData?.address || event?.address || "";
                        if (fullAddr) params.set("address", fullAddr);
                        if (event?.description) params.set("description", event.description);
                        const qs = params.toString();
                        return `/surveys/new${qs ? `?${qs}` : ""}`;
                      })()}>
                        <Button
                          size="sm"
                          data-testid="button-survey-photos-link-no-job"
                          className="bg-purple-600 hover:bg-purple-700 text-white"
                        >
                          <ClipboardCheck className="h-4 w-4 mr-2" />
                          Survey Photos
                        </Button>
                      </Link>
                    ) : (
                      <Link href={(() => {
                        const params = new URLSearchParams();
                        const evtData = eventDetails?.event as any;
                        if (event?.id) params.set("calendarEventId", String(event.id));
                        if (event?.workJobNumber) {
                          params.set("jobLabel", event.workJobNumber);
                        } else if (event?.title) {
                          const woMatch = event.title.match(/WO\s*(\S+)/i);
                          if (woMatch) params.set("jobLabel", `WO ${woMatch[1]}`);
                        }
                        const cName = evtData?.customerName || (event as any)?.customerName;
                        const cPhone = evtData?.customerPhone || (event as any)?.customerPhone;
                        const cEmail = evtData?.customerEmail || (event as any)?.customerEmail;
                        if (cName) params.set("customerName", cName);
                        if (cPhone) params.set("customerPhone", cPhone);
                        if (cEmail) params.set("customerEmail", cEmail);
                        const fullAddr = evtData?.address || event?.address || "";
                        if (fullAddr) {
                          params.set("address", fullAddr);
                          const addrParts = fullAddr.split(",").map((s: string) => s.trim());
                          if (addrParts.length >= 3) {
                            params.set("city", addrParts[1]);
                            const stateZip = addrParts[2].trim().split(/\s+/);
                            if (stateZip[0]) params.set("state", stateZip[0]);
                            if (stateZip[1]) params.set("postalCode", stateZip[1]);
                          }
                        }
                        if (event?.description) params.set("description", event.description);
                        const qs = params.toString();
                        return `/projects/new${qs ? `?${qs}` : ""}`;
                      })()}>
                        <Button
                          size="sm"
                          data-testid="button-completed-photos-link-no-job"
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Completed Photos
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ) : null
            ))}

            {/* Issue Reporting Section - shows after photos are uploaded, hidden for completed */}
            {!isCompleted && photoAttachments.length > 0 && (
              <div className="space-y-2">
                {!showIssueForm ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setShowIssueForm(true)}
                    className="w-full"
                    data-testid="button-report-issue"
                  >
                    <AlertCircle className="h-4 w-4 mr-2" />
                    Report Issue
                  </Button>
                ) : (
                  <div className="space-y-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                    <Label className="text-sm font-medium text-destructive">Describe the Issue</Label>
                    <Textarea
                      placeholder="What issue needs to be addressed?"
                      value={issueDescription}
                      onChange={(e) => setIssueDescription(e.target.value)}
                      className="resize-none"
                      rows={3}
                      data-testid="input-issue-description"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => reportIssueMutation.mutate(issueDescription)}
                        disabled={reportIssueMutation.isPending || !issueDescription.trim()}
                        data-testid="button-submit-issue"
                      >
                        {reportIssueMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : null}
                        Send Report
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowIssueForm(false);
                          setIssueDescription("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sends email to sales rep and waltham.install@fastsigns.com
                    </p>
                  </div>
                )}
              </div>
            )}


            {/* Document Attachments */}
            {docAttachments.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Documents ({docAttachments.length})
                </h4>
                <div className="space-y-1">
                  {docAttachments.map((attachment: any) => (
                    <div
                      key={attachment.id}
                      className="flex items-center gap-2 p-2 text-sm bg-muted/50 rounded hover:bg-muted transition-colors"
                    >
                      <FileText className="h-4 w-4 text-primary shrink-0" />
                      <a
                        href={`/api/attachments/${attachment.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 truncate min-w-0 hover:underline"
                        data-testid={`link-document-${attachment.id}`}
                      >
                        {attachment.fileName}
                      </a>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {attachment.category}
                      </Badge>
                      <a
                        href={`/api/attachments/${attachment.id}/download`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 p-1 rounded hover:bg-muted-foreground/10"
                        title="Download"
                        data-testid={`button-download-document-${attachment.id}`}
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </a>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete "${attachment.fileName}"? This cannot be undone.`)) {
                              deleteAttachmentMutation.mutate(attachment.id);
                            }
                          }}
                          disabled={deleteAttachmentMutation.isPending}
                          className="shrink-0 p-1 rounded text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          title="Delete document"
                          data-testid={`button-delete-document-${attachment.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="space-y-1">
                <h4 className="font-medium text-sm">Notes</h4>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted/30 p-2 rounded">
                  <NotesWithLinks text={event.description} />
                </div>
              </div>
            )}

            {/* Last Updates */}
            <LastUpdates
              resourceType="calendar_event"
              resourceId={event.id}
              title="Last Updates"
            />
          </div>
        )}

        <DialogFooter className="flex gap-2 shrink-0 border-t pt-3">
          <Button variant="outline" onClick={onClose} data-testid="button-close-dialog">
            Close
          </Button>
          {!isEditing && canDelete && (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isDeleting}
              data-testid="button-delete-event"
            >
              {isDeleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => {
          onDelete(event.id);
          setShowDeleteConfirm(false);
        }}
        title="Are you sure?"
        description="This will permanently delete this event."
        confirmLabel="Yes"
        variant="destructive"
      />

      <ConfirmDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        onConfirm={() => {
          setShowSaveConfirm(false);
          doSaveEdit();
        }}
        title="Are you sure?"
        description="This will update the event details."
        confirmLabel="Yes"
      />
    </Dialog>
  );
}
