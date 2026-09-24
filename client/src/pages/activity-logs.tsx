import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Search, RefreshCw, Filter, ScrollText, Shield, LogIn, LogOut,
  UserPlus, UserMinus, Calendar, FolderOpen, Key, ChevronLeft, ChevronRight,
  User, Mail, Phone, MapPin, Briefcase, Clock, CheckCircle, XCircle, Building2,
  Edit, CreditCard, Settings, Camera, ArrowUpDown, Trash2, CheckCheck, X, Loader2,
  Archive, ArchiveRestore, FileText
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { usePageHeader } from "@/lib/page-header";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

interface ActivityLog {
  id: number;
  userId: number | null;
  userName: string | null;
  userEmail: string | null;
  userRole: string | null;
  adminName: string | null;
  adminEmail: string | null;
  action: string;
  category: string;
  description: string;
  resourceId: string | null;
  resourceType: string | null;
  metadata: string | null;
  ipAddress: string | null;
  createdAt: string;
}

interface ActivityLogsResponse {
  logs: ActivityLog[];
  total: number;
  limit: number;
  offset: number;
}

interface UserProfile {
  id: number;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: string;
  location: string | null;
  job_title: string | null;
  created_at: string;
  face_enabled: boolean;
  google_enabled: boolean;
  onboarding_completed: boolean;
  is_master: string;
  deleted_at: string | null;
  admin_id: number | null;
  admin_name: string | null;
  admin_email: string | null;
  admin_location: string | null;
  business_address: string | null;
  installation_range: string | null;
  team_size: string | null;
  scheduling_poc: string | null;
  calendar_owner: string | null;
  has_bucket_truck: string | null;
  ladder_max_height: string | null;
  sign_types: string[] | null;
  pricing_product_list: string | null;
  install_time_standards: string | null;
  additional_notes: string | null;
  onboarding_completed_at: string | null;
}

const CATEGORIES = ["All", "Auth", "User Management", "Bookings", "Projects", "Surveys", "Subscriptions", "Settings", "AI", "Storage", "Email", "CompanyCam", "Admin"];

const ACTION_ICONS: Record<string, typeof LogIn> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  CREATE_USER: UserPlus,
  DELETE_USER: UserMinus,
  UPDATE_USER: Edit,
  CREATE_BOOKING: Calendar,
  UPDATE_BOOKING: Edit,
  COMPLETE_BOOKING: CheckCircle,
  DELETE_BOOKING: Calendar,
  CREATE_PROJECT: FolderOpen,
  CHANGE_PASSWORD: Key,
  RESET_USER_PASSWORD: Key,
  PURCHASE_PLAN: CreditCard,
  ASSIGN_PLAN: ArrowUpDown,
  UPDATE_SETTINGS: Settings,
  FACE_REGISTERED: Camera,
  FACE_DISABLED: Camera,
  PASSWORD_RESET_COMPLETED: Key,
  CREATE_TAG: Settings,
  UPDATE_TAG: Edit,
  DELETE_TAG: Trash2,
  SEND_EMAIL: Mail,
  REPORT_ISSUE: XCircle,
  RESOLVE_ISSUE: CheckCircle,
  DELETE_PROJECT: Trash2,
  UPDATE_PROJECT: Edit,
  PHOTO_UPLOADED: Camera,
  RESCHEDULE_REQUESTED: Calendar,
  RESCHEDULE_RESPONSE: Calendar,
  AI_SCHEDULER: Calendar,
  EXPORT: ArrowUpDown,
  LLM_IMAGE_ANALYSIS: Camera,
  LLM_PDF_EXTRACTION: FileText,
  LLM_FILE_EXTRACTION: FileText,
  LLM_SCHEDULE_ANALYSIS: Calendar,
  LLM_ASSISTANT_CREATED: Settings,
  LLM_ASSISTANT_UPDATE: Edit,
  STORAGE_UPLOAD: ArrowUpDown,
  STORAGE_UPLOAD_FAILED: XCircle,
  EMAIL_SENT: Mail,
  EMAIL_FAILED: XCircle,
};

const ACTION_LABELS: Record<string, string> = {
  LOGIN: "Login",
  LOGOUT: "Logout",
  CREATE_USER: "User Created",
  DELETE_USER: "User Deleted",
  UPDATE_USER: "User Updated",
  CREATE_BOOKING: "Booking Created",
  UPDATE_BOOKING: "Booking Updated",
  COMPLETE_BOOKING: "Booking Completed",
  DELETE_BOOKING: "Booking Deleted",
  CREATE_PROJECT: "Photo Uploaded",
  CHANGE_PASSWORD: "Password Changed",
  RESET_USER_PASSWORD: "Password Reset",
  PURCHASE_PLAN: "Plan Purchased",
  ASSIGN_PLAN: "Plan Assigned",
  UPDATE_SETTINGS: "Settings Updated",
  FACE_REGISTERED: "Face Registered",
  FACE_DISABLED: "Face Disabled",
  PASSWORD_RESET_COMPLETED: "Password Reset",
  CREATE_TAG: "Tag Created",
  UPDATE_TAG: "Tag Updated",
  DELETE_TAG: "Tag Deleted",
  SEND_EMAIL: "Email Sent",
  REPORT_ISSUE: "Issue Reported",
  RESOLVE_ISSUE: "Issue Resolved",
  DELETE_PROJECT: "Project Deleted",
  UPDATE_PROJECT: "Project Updated",
  PHOTO_UPLOADED: "Photo Uploaded",
  RESCHEDULE_REQUESTED: "Reschedule Request",
  RESCHEDULE_RESPONSE: "Reschedule Response",
  AI_SCHEDULER: "AI Scheduled",
  EXPORT: "Data Exported",
  LLM_IMAGE_ANALYSIS: "AI Image Analysis",
  LLM_PDF_EXTRACTION: "AI PDF Extraction",
  LLM_FILE_EXTRACTION: "AI File Extraction",
  LLM_SCHEDULE_ANALYSIS: "AI Schedule Analysis",
  LLM_ASSISTANT_CREATED: "AI Assistant Created",
  LLM_ASSISTANT_UPDATE: "AI Assistant Updated",
  STORAGE_UPLOAD: "File Uploaded",
  STORAGE_UPLOAD_FAILED: "File Upload Failed",
  EMAIL_SENT: "Email Sent",
  EMAIL_FAILED: "Email Failed",
};

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  LOGOUT: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  CREATE_USER: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  DELETE_USER: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  UPDATE_USER: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  CREATE_BOOKING: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  UPDATE_BOOKING: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  COMPLETE_BOOKING: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  DELETE_BOOKING: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  CREATE_PROJECT: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  CHANGE_PASSWORD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  RESET_USER_PASSWORD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  PURCHASE_PLAN: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  ASSIGN_PLAN: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  UPDATE_SETTINGS: "bg-gray-100 text-gray-800 dark:bg-gray-900/40 dark:text-gray-300",
  FACE_REGISTERED: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  FACE_DISABLED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  PASSWORD_RESET_COMPLETED: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  CREATE_TAG: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  UPDATE_TAG: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  DELETE_TAG: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  SEND_EMAIL: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  REPORT_ISSUE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  RESOLVE_ISSUE: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  DELETE_PROJECT: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  UPDATE_PROJECT: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
  PHOTO_UPLOADED: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  RESCHEDULE_REQUESTED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  RESCHEDULE_RESPONSE: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  AI_SCHEDULER: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300",
  EXPORT: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-300",
  LLM_IMAGE_ANALYSIS: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  LLM_PDF_EXTRACTION: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  LLM_FILE_EXTRACTION: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  LLM_SCHEDULE_ANALYSIS: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  LLM_ASSISTANT_CREATED: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  LLM_ASSISTANT_UPDATE: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  STORAGE_UPLOAD: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
  STORAGE_UPLOAD_FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  EMAIL_SENT: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  EMAIL_FAILED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

const CATEGORY_COLORS: Record<string, string> = {
  Auth: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
  "User Management": "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  Bookings: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-700",
  Projects: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700",
  Subscriptions: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700",
  Settings: "bg-gray-50 text-gray-700 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700",
  AI: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:border-purple-700",
  Storage: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300 dark:border-teal-700",
  Email: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Owner",
  user: "User",
};

const USER_FIELD_LABELS: Record<string, string> = {
  name: "Full name",
  email: "Email",
  phone: "Phone",
  role: "Role",
  jobTitle: "Job title",
  location: "Location",
  username: "Username",
};

function formatDiffValue(v: any): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string" && USER_FIELD_LABELS && Object.values(ROLE_LABELS).length) {
    if (ROLE_LABELS[v]) return ROLE_LABELS[v];
  }
  return String(v);
}

interface UserChange { field: string; before: any; after: any; }

interface UserUpdateMeta {
  targetUserId?: number;
  targetUserName?: string;
  targetUserRole?: string;
  isSelfEdit?: boolean;
  passwordReset?: boolean;
  changes?: UserChange[];
}

function parseUserUpdateMeta(raw: string | null | undefined): UserUpdateMeta | null {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : (raw as any);
  } catch {
    return null;
  }
}

function UserUpdateDetails({ log, compact = false }: { log: ActivityLog; compact?: boolean }) {
  const meta = parseUserUpdateMeta(log.metadata);
  if (!meta) return null;
  const targetName = meta.targetUserName ?? null;
  const targetRoleLabel = meta.targetUserRole ? (ROLE_LABELS[meta.targetUserRole] ?? meta.targetUserRole) : null;
  const isSelf = !!meta.isSelfEdit;
  const changes = Array.isArray(meta.changes) ? meta.changes : [];
  const passwordReset = !!meta.passwordReset;
  const passwordChange = log.action === "CHANGE_PASSWORD";

  return (
    <div className={compact ? "mt-1 space-y-1.5" : "mt-1.5 space-y-1.5"} data-testid={`user-update-details-${log.id}`}>
      {targetName && (
        <div className="text-[12px] text-muted-foreground">
          {isSelf ? (
            <span>Updated their own profile</span>
          ) : passwordChange ? (
            <span>
              Password changed for <span className="font-medium text-foreground">{targetName}</span>
              {targetRoleLabel ? <span className="text-muted-foreground"> ({targetRoleLabel})</span> : null}
            </span>
          ) : (
            <span>
              Target: <span className="font-medium text-foreground">{targetName}</span>
              {targetRoleLabel ? <span className="text-muted-foreground"> ({targetRoleLabel})</span> : null}
            </span>
          )}
        </div>
      )}

      {changes.length > 0 && (
        <div className="space-y-0.5 pl-2.5 border-l-2 border-border/70">
          {changes.map((c, idx) => (
            <div
              key={`${log.id}-${c.field}-${idx}`}
              className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px]"
              data-testid={`change-${log.id}-${c.field}`}
            >
              <span className="text-muted-foreground font-medium min-w-[72px]">
                {USER_FIELD_LABELS[c.field] ?? c.field}:
              </span>
              <span className="line-through text-muted-foreground/80 break-all">
                {formatDiffValue(c.before)}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium text-foreground break-all">
                {formatDiffValue(c.after)}
              </span>
            </div>
          ))}
        </div>
      )}

      {passwordReset && !passwordChange && (
        <div className="text-[12px] text-amber-700 dark:text-amber-400 italic">
          Password was reset by admin.
        </div>
      )}
    </div>
  );
}

function isUserUpdateLog(log: ActivityLog): boolean {
  return log.resourceType === "user" && (log.action === "UPDATE_USER" || log.action === "CHANGE_PASSWORD" || log.action === "RESET_USER_PASSWORD");
}

const ROLE_COLORS: Record<string, string> = {
  super_admin: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  admin: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
  user: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const PAGE_SIZE = 20;

const ROLE_BG: Record<string, string> = {
  super_admin: "from-orange-500 to-orange-600",
  admin: "from-indigo-500 to-violet-600",
  user: "from-teal-500 to-cyan-600",
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest whitespace-nowrap">{children}</p>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: typeof User; label: string; value: React.ReactNode }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex items-start gap-2.5 rounded-lg px-3 py-2.5 bg-muted/40 border border-border/50 overflow-hidden">
      <div className="h-7 w-7 rounded-md bg-background flex items-center justify-center flex-shrink-0 border border-border/50 shadow-sm">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0 overflow-hidden">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium text-foreground mt-0.5 truncate" title={typeof value === "string" ? value : undefined}>{value}</p>
      </div>
    </div>
  );
}

function FeaturePill({ enabled, label }: { enabled: boolean; label: string }) {
  return (
    <div className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border flex-1 min-w-0 ${enabled ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-700" : "bg-muted/30 border-border/50"}`}>
      <div className={`h-7 w-7 rounded-full flex items-center justify-center ${enabled ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-muted"}`}>
        {enabled
          ? <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          : <XCircle className="h-4 w-4 text-muted-foreground/50" />}
      </div>
      <span className={`text-[10px] font-semibold text-center leading-tight ${enabled ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`}>{label}</span>
    </div>
  );
}

function UserProfileDialog({ userId, userName, open, onClose }: {
  userId: number;
  userName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/admin/users", userId, "profile"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${userId}/profile`);
      if (!res.ok) throw new Error("Failed to fetch user profile");
      return res.json();
    },
    enabled: open,
  });

  const gradientClass = profile ? (ROLE_BG[profile.role] ?? "from-slate-400 to-slate-500") : "from-slate-400 to-slate-500";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)] p-0 overflow-hidden max-h-[90vh] flex flex-col" data-testid="dialog-user-profile">
        <DialogHeader className="sr-only">
          <DialogTitle>User Profile</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Loading profile...</div>
        ) : !profile ? (
          <div className="py-16 text-center text-muted-foreground text-sm">Could not load profile.</div>
        ) : (
          <>
            <div className={`bg-gradient-to-br ${gradientClass} px-6 pt-8 pb-6 pr-14`}>
              <div className="flex items-end gap-4">
                <div className="h-16 w-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl font-bold text-white shadow-lg border border-white/30 flex-shrink-0">
                  {profile.name?.charAt(0).toUpperCase()}
                </div>
                <div className="pb-0.5 min-w-0">
                  <h2 className="text-xl font-bold text-white leading-tight truncate">{profile.name}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/25 text-white border border-white/30">
                      {ROLE_LABELS[profile.role] ?? profile.role}
                    </span>
                    {profile.deleted_at && (
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500/80 text-white border border-red-400/50">
                        Deleted
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-5 bg-background">
              <div>
                <SectionHeading>Account Information</SectionHeading>
                <div className="grid grid-cols-2 gap-2">
                  <InfoItem icon={User} label="Username" value={profile.username} />
                  <InfoItem icon={Mail} label="Email" value={profile.email} />
                  <InfoItem icon={Phone} label="Phone" value={profile.phone} />
                  <InfoItem icon={Briefcase} label="Job Title" value={profile.job_title} />
                  {profile.location && <InfoItem icon={MapPin} label="Location" value={profile.location} />}
                  <InfoItem icon={Clock} label="Account Created" value={format(new Date(profile.created_at), "MMM d, yyyy")} />
                  {profile.onboarding_completed_at && (
                    <InfoItem icon={CheckCircle} label="Onboarding Completed" value={format(new Date(profile.onboarding_completed_at), "MMM d, yyyy")} />
                  )}
                  {profile.deleted_at && (
                    <InfoItem icon={XCircle} label="Deleted On" value={format(new Date(profile.deleted_at), "MMM d, yyyy")} />
                  )}
                </div>
              </div>

              <div>
                <SectionHeading>Security & Features</SectionHeading>
                <div className="flex gap-2">
                  <FeaturePill enabled={profile.face_enabled} label="Face Login" />
                  <FeaturePill enabled={profile.google_enabled} label="Google SSO" />
                  <FeaturePill enabled={profile.onboarding_completed} label="Onboarding" />
                </div>
              </div>

              {profile.admin_name && (
                <div>
                  <SectionHeading>Admin (Owner)</SectionHeading>
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700">
                    <div className="h-10 w-10 rounded-xl bg-indigo-500 flex items-center justify-center text-sm font-bold text-white shadow-sm flex-shrink-0">
                      {profile.admin_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground truncate">{profile.admin_name}</p>
                      {profile.admin_email && <p className="text-xs text-muted-foreground truncate">{profile.admin_email}</p>}
                      {profile.admin_location && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3" />{profile.admin_location}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-500 text-white flex-shrink-0">Owner</span>
                  </div>
                </div>
              )}

              {(profile.business_address || profile.team_size || profile.installation_range || profile.scheduling_poc) && (
                <div>
                  <SectionHeading>Business Information</SectionHeading>
                  <div className="grid grid-cols-2 gap-2">
                    <InfoItem icon={Building2} label="Business Address" value={profile.business_address} />
                    <InfoItem icon={User} label="Team Size" value={profile.team_size} />
                    <InfoItem icon={MapPin} label="Installation Range" value={profile.installation_range} />
                    <InfoItem icon={User} label="Scheduling POC" value={profile.scheduling_poc} />
                    <InfoItem icon={User} label="Calendar Owner" value={profile.calendar_owner} />
                    {profile.ladder_max_height && <InfoItem icon={MapPin} label="Max Ladder Height" value={`${profile.ladder_max_height} ft`} />}
                    {profile.has_bucket_truck && <InfoItem icon={CheckCircle} label="Bucket Truck" value={profile.has_bucket_truck === "true" ? "Yes" : "No"} />}
                  </div>
                </div>
              )}

              {profile.sign_types && profile.sign_types.length > 0 && (
                <div>
                  <SectionHeading>Sign Types</SectionHeading>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.sign_types.map((s) => (
                      <span key={s} className="text-xs font-medium px-2.5 py-1 rounded-lg bg-muted border border-border/60 text-foreground">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {profile.additional_notes && (
                <div>
                  <SectionHeading>Additional Notes</SectionHeading>
                  <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted/40 rounded-lg p-3 border border-border/50">{profile.additional_notes}</p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ActivityLogsPage() {
  const { user } = useAuth();
  const { setHeaderInfo } = usePageHeader();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const searchString = useSearch();
  const urlCategory = (() => {
    const params = new URLSearchParams(searchString || "");
    return params.get("category") || "All";
  })();
  const [category, setCategory] = useState(urlCategory);
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    setCategory(urlCategory);
    setOffset(0);
  }, [urlCategory]);
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  const [selectedUser, setSelectedUser] = useState<{ id: number; name: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [showPermanentDeleteConfirm, setShowPermanentDeleteConfirm] = useState(false);

  const isSuperAdmin = user?.role === "super_admin";

  useEffect(() => {
    setHeaderInfo({
      title: "Activity Log",
      description: isSuperAdmin
        ? "Full audit trail of all user and owner actions"
        : "Activity history for you and your team",
      icon: <ScrollText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
      actions: (
        <div className="flex items-center gap-2">
          {isSuperAdmin && selectedIds.size > 0 && (
            <div className="hidden sm:flex items-center gap-2">
              {activeTab === "active" ? (
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-9 gap-1.5"
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="button-soft-delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete ({selectedIds.size})
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => setShowRestoreConfirm(true)}
                    data-testid="button-restore"
                  >
                    <ArchiveRestore className="h-3.5 w-3.5" />
                    Restore ({selectedIds.size})
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-9 gap-1.5"
                    onClick={() => setShowPermanentDeleteConfirm(true)}
                    data-testid="button-permanent-delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Permanently ({selectedIds.size})
                  </Button>
                </>
              )}
            </div>
          )}
          {isSuperAdmin && (
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "active" | "archived")} data-testid="tabs-activity-logs">
              <TabsList className="h-9">
                <TabsTrigger value="active" className="px-3 sm:px-4 text-xs sm:text-sm gap-1.5" data-testid="tab-active">
                  Active
                </TabsTrigger>
                <TabsTrigger value="archived" className="px-3 sm:px-4 text-xs sm:text-sm gap-1.5" data-testid="tab-archived">
                  <Archive className="h-3.5 w-3.5" />
                  Archived
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      ),
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo, isSuperAdmin, selectedIds.size, activeTab]);

  const tabInitRef = useRef(true);
  useEffect(() => {
    if (tabInitRef.current) {
      tabInitRef.current = false;
      return;
    }
    setSelectedIds(new Set());
    setOffset(0);
    setSearch("");
    setDebouncedSearch("");
    setCategory("All");
  }, [activeTab]);

  const params = new URLSearchParams({
    limit: String(PAGE_SIZE),
    offset: String(offset),
    ...(category !== "All" ? { category } : {}),
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(activeTab === "archived" ? { archived: "only" } : {}),
  });

  const { data, isLoading, refetch, isFetching } = useQuery<ActivityLogsResponse>({
    queryKey: ["/api/admin/activity-logs", category, debouncedSearch, offset, activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/admin/activity-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const softDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/admin/activity-logs/soft-delete", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity-logs"] });
      setSelectedIds(new Set());
      toast({ title: "Logs archived successfully" });
    },
    onError: () => {
      toast({ title: "Failed to archive logs", variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/admin/activity-logs/restore", { ids });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity-logs"] });
      setSelectedIds(new Set());
      toast({ title: "Logs restored successfully" });
    },
    onError: () => {
      toast({ title: "Failed to restore logs", variant: "destructive" });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/admin/activity-logs/permanent-delete", { ids });
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/activity-logs"] });
      setSelectedIds(new Set());
      toast({
        title: ids.length === 1 ? "Log permanently deleted" : `${ids.length} logs permanently deleted`,
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

  const logs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const allVisibleIds = logs.map(l => l.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedIds.has(id));

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  }

  function handleSearch(val: string) {
    setSearch(val);
    clearTimeout((window as any)._logSearchTimer);
    (window as any)._logSearchTimer = setTimeout(() => {
      setDebouncedSearch(val);
      setOffset(0);
    }, 400);
  }

  function handleCategoryChange(val: string) {
    setCategory(val);
    setOffset(0);
  }

  function handleSoftDelete() {
    softDeleteMutation.mutate(Array.from(selectedIds));
    setShowDeleteConfirm(false);
  }

  function handleRestore() {
    restoreMutation.mutate(Array.from(selectedIds));
    setShowRestoreConfirm(false);
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {selectedIds.size > 0 && (
        <div className="flex sm:hidden items-center gap-2 px-4 py-2 bg-primary/[0.04] border-b border-border">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-1.5 ml-auto">
            {activeTab === "active" ? (
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={softDeleteMutation.isPending}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setShowRestoreConfirm(true)}
                  disabled={restoreMutation.isPending}
                  data-testid="button-bulk-restore"
                >
                  <ArchiveRestore className="h-3 w-3" />
                  Restore
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs gap-1"
                  onClick={() => setShowPermanentDeleteConfirm(true)}
                  disabled={permanentDeleteMutation.isPending}
                  data-testid="button-bulk-permanent-delete"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete Permanently
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setSelectedIds(new Set())}
              data-testid="button-clear-selection"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      <div className="px-4 sm:px-6 py-3 border-b border-border bg-background">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9 h-9"
              placeholder="Search by user, action, or description..."
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              data-testid="input-search-logs"
            />
          </div>
          <div className="flex gap-2">
            <Select value={category} onValueChange={handleCategoryChange}>
              <SelectTrigger className="flex-1 sm:w-44 sm:flex-none h-9" data-testid="select-category-filter">
                <Filter className="h-3.5 w-3.5 mr-2 text-muted-foreground flex-shrink-0" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c === "All" ? "All Categories" : c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0" onClick={() => refetch()} disabled={isFetching} data-testid="button-refresh-logs">
                  <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Refresh</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading activity logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              {activeTab === "archived" ? (
                <Archive className="h-8 w-8 opacity-40" />
              ) : (
                <ScrollText className="h-8 w-8 opacity-40" />
              )}
            </div>
            <p className="text-sm">
              {activeTab === "archived"
                ? "No archived logs found."
                : "No activity found for the selected filters."}
            </p>
          </div>
        ) : (
          <>
            <div className="sm:hidden">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-7 px-2 text-xs gap-1 ${allSelected ? "text-primary" : "text-muted-foreground"}`}
                  onClick={toggleSelectAll}
                  data-testid="checkbox-select-all-mobile"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  {allSelected ? "Deselect all" : "Select all"}
                </Button>
                <span className="ml-auto text-[11px] text-muted-foreground">{total} total</span>
              </div>
              <div className="divide-y divide-border">
                {logs.map((log) => {
                  const Icon = ACTION_ICONS[log.action] ?? ScrollText;
                  const ts = new Date(log.createdAt);
                  const isClickable = !!log.userId;
                  const isSelected = selectedIds.has(log.id);
                  return (
                    <div
                      key={log.id}
                      className={`px-4 py-3.5 transition-colors ${isSelected ? "bg-primary/[0.04]" : ""}`}
                      data-testid={`row-activity-${log.id}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="pt-0.5 flex-shrink-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(log.id)}
                            className="rounded-full"
                            data-testid={`checkbox-log-${log.id}`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground"}`}>
                              <Icon className="h-3 w-3 flex-shrink-0" />
                              {ACTION_LABELS[log.action] ?? log.action.replace(/_/g, " ")}
                            </span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium whitespace-nowrap ${CATEGORY_COLORS[log.category] ?? "bg-muted text-muted-foreground"}`}>
                              {log.category}
                            </span>
                          </div>
                          <p className={`text-[13px] text-foreground leading-snug mb-1 ${isUserUpdateLog(log) ? "" : "line-clamp-2"}`}>{log.description}</p>
                          {isUserUpdateLog(log) && <UserUpdateDetails log={log} compact />}
                          {log.category === "AI" && log.metadata && (() => {
                            try {
                              const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
                              if (meta.totalTokens || meta.estimatedCostUSD) {
                                return (
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                                    {meta.totalTokens && <span>{meta.totalTokens.toLocaleString()} tokens</span>}
                                    {meta.estimatedCostUSD != null && <span className="font-medium text-purple-600 dark:text-purple-400">${meta.estimatedCostUSD.toFixed(4)}</span>}
                                    {meta.durationMs && <span>{(meta.durationMs / 1000).toFixed(1)}s</span>}
                                  </div>
                                );
                              }
                            } catch {}
                            return null;
                          })()}
                          <div className="flex items-center gap-3 flex-wrap">
                            {log.userName && (
                              <button
                                className={`inline-flex items-center gap-1.5 text-xs font-medium ${isClickable ? "text-primary active:opacity-70" : "text-muted-foreground"}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isClickable) setSelectedUser({ id: log.userId!, name: log.userName! });
                                }}
                                data-testid={`button-user-mobile-${log.id}`}
                              >
                                <div className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${log.userRole === "super_admin" ? "bg-amber-500" : log.userRole === "admin" ? "bg-indigo-500" : "bg-teal-500"}`}>
                                  {log.userName.charAt(0).toUpperCase()}
                                </div>
                                <span>{log.userName}</span>
                                {log.userRole && (
                                  <Badge variant="secondary" className={`text-[9px] leading-none px-1.5 py-0.5 ${ROLE_COLORS[log.userRole] ?? ""}`}>
                                    {ROLE_LABELS[log.userRole] ?? log.userRole}
                                  </Badge>
                                )}
                              </button>
                            )}
                            <span className="text-[11px] text-muted-foreground/60 flex items-center gap-1 ml-auto">
                              <Clock className="h-3 w-3" />
                              {format(ts, "MMM d, h:mm a")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="hidden sm:block min-w-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/30">
                    <TableHead className="w-10 pl-6">
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
                    </TableHead>
                    <TableHead className="w-12 font-semibold text-xs text-center">S.No.</TableHead>
                    <TableHead className="hidden md:table-cell w-36 font-semibold text-xs">Timestamp</TableHead>
                    <TableHead className="font-semibold text-xs">Action</TableHead>
                    <TableHead className="hidden lg:table-cell w-28 font-semibold text-xs">Category</TableHead>
                    <TableHead className="font-semibold text-xs">Description</TableHead>
                    <TableHead className="font-semibold text-xs">User</TableHead>
                    <TableHead className="hidden lg:table-cell w-24 font-semibold text-xs">Role</TableHead>
                    <TableHead className="hidden xl:table-cell w-32 font-semibold text-xs pr-6">IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log, index) => {
                    const Icon = ACTION_ICONS[log.action] ?? ScrollText;
                    const ts = new Date(log.createdAt);
                    const isClickable = !!log.userId;
                    const isSelected = selectedIds.has(log.id);
                    const serialNo = offset + index + 1;
                    return (
                      <TableRow
                        key={log.id}
                        className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/[0.03]" : ""}`}
                        data-testid={`row-activity-${log.id}`}
                      >
                        <TableCell className="pl-6 pr-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(log.id)}
                            className="rounded-full"
                            data-testid={`checkbox-log-${log.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-center text-sm text-muted-foreground font-medium w-12">
                          {serialNo}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap" data-testid={`text-timestamp-${log.id}`}>
                          <div className="font-medium text-foreground">{format(ts, "MMM d, yyyy")}</div>
                          <div className="mt-0.5">{format(ts, "h:mm a")}</div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md whitespace-nowrap ${ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground"}`}>
                            <Icon className="h-3 w-3 flex-shrink-0" />
                            {ACTION_LABELS[log.action] ?? log.action.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className={`text-xs px-2 py-1 rounded-md border font-medium whitespace-nowrap ${CATEGORY_COLORS[log.category] ?? "bg-muted text-muted-foreground"}`}>
                            {log.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-foreground max-w-md">
                          <span className={isUserUpdateLog(log) ? "" : "line-clamp-2"}>{log.description}</span>
                          {isUserUpdateLog(log) && <UserUpdateDetails log={log} />}
                          {log.category === "AI" && log.metadata && (() => {
                            try {
                              const meta = typeof log.metadata === "string" ? JSON.parse(log.metadata) : log.metadata;
                              if (meta.totalTokens || meta.estimatedCostUSD) {
                                return (
                                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                                    {meta.totalTokens && <span>{meta.totalTokens.toLocaleString()} tokens</span>}
                                    {meta.estimatedCostUSD != null && <span className="font-medium text-purple-600 dark:text-purple-400">${meta.estimatedCostUSD.toFixed(4)}</span>}
                                    {meta.durationMs && <span>{(meta.durationMs / 1000).toFixed(1)}s</span>}
                                  </div>
                                );
                              }
                            } catch {}
                            return null;
                          })()}
                        </TableCell>
                        <TableCell>
                          {log.userName ? (
                            <button
                              className={`text-left min-w-0 w-full ${isClickable ? "cursor-pointer group" : ""}`}
                              onClick={() => isClickable && setSelectedUser({ id: log.userId!, name: log.userName! })}
                              data-testid={`button-user-${log.id}`}
                            >
                              <div className={`text-sm font-medium truncate ${isClickable ? "text-primary group-hover:underline" : "text-foreground"}`}>
                                {log.userName}
                              </div>
                              {log.userEmail && (
                                <div className="text-xs text-muted-foreground truncate hidden md:block mt-0.5">{log.userEmail}</div>
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {log.userRole ? (
                            <Badge variant="secondary" className={`text-xs font-medium ${ROLE_COLORS[log.userRole] ?? ""}`}>
                              {ROLE_LABELS[log.userRole] ?? log.userRole}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="hidden xl:table-cell text-xs text-muted-foreground font-mono whitespace-nowrap pr-6">
                          {log.ipAddress ?? "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {totalPages > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border bg-muted/20 flex-shrink-0">
          <p className="text-xs text-muted-foreground" data-testid="text-pagination-info">
            {isLoading ? "Loading..." : `${total > 0 ? offset + 1 : 0}–${Math.min(offset + PAGE_SIZE, total)} of ${total.toLocaleString()}`}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4 mr-0.5" />
                Prev
              </Button>
              <span className="text-xs text-muted-foreground px-2">{currentPage} / {totalPages}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-0.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {selectedUser && (
        <UserProfileDialog
          userId={selectedUser.id}
          userName={selectedUser.name}
          open={!!selectedUser}
          onClose={() => setSelectedUser(null)}
        />
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={handleSoftDelete}
        title="Delete Activity Logs?"
        description={`This will move ${selectedIds.size} selected log${selectedIds.size > 1 ? " entries" : " entry"} to the archive. You can restore them later.`}
        confirmLabel="Delete"
      />

      <ConfirmDialog
        open={showRestoreConfirm}
        onOpenChange={setShowRestoreConfirm}
        onConfirm={handleRestore}
        title="Restore Activity Logs?"
        description={`Restore ${selectedIds.size} selected log${selectedIds.size > 1 ? " entries" : " entry"} back to the active log?`}
        confirmLabel="Restore"
      />

      <ConfirmDialog
        open={showPermanentDeleteConfirm}
        onOpenChange={setShowPermanentDeleteConfirm}
        onConfirm={() => {
          permanentDeleteMutation.mutate(Array.from(selectedIds));
          setShowPermanentDeleteConfirm(false);
        }}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "log" : "logs"} permanently?`}
        description="The selected archived activity logs will be removed from the database forever. This cannot be undone."
        confirmLabel="Delete Permanently"
        variant="destructive"
      />
    </div>
  );
}
