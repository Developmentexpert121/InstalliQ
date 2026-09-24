import { useQuery } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { Loader2, ClipboardList, KeyRound, UserCog, ShieldCheck, User as UserIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Change = { field: string; before: any; after: any };

type LogEntry = {
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
  metadata: {
    targetUserId?: number;
    targetUserName?: string;
    targetUserRole?: string;
    isSelfEdit?: boolean;
    passwordReset?: boolean;
    changes?: Change[];
  } | null;
  createdAt: string;
};

const FIELD_LABELS: Record<string, string> = {
  name: "Full name",
  email: "Email",
  phone: "Phone",
  role: "Role",
  jobTitle: "Job title",
  location: "Location",
};

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

function actorRoleLabel(role: string | null | undefined): string {
  switch (role) {
    case "super_admin":
      return "Super Admin";
    case "admin":
      return "Owner";
    case "install_manager":
      return "Install Manager";
    case "user":
      return "User";
    default:
      return role ?? "User";
  }
}

function ActionBadge({ entry }: { entry: LogEntry }) {
  if (entry.action === "CHANGE_PASSWORD") {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50">
        <KeyRound className="h-3 w-3 mr-1" />
        Password changed
      </Badge>
    );
  }
  if (entry.metadata?.passwordReset) {
    return (
      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50">
        <KeyRound className="h-3 w-3 mr-1" />
        Password reset
      </Badge>
    );
  }
  if (entry.metadata?.isSelfEdit) {
    return (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800/50">
        <UserIcon className="h-3 w-3 mr-1" />
        Self-edit
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-700">
      <UserCog className="h-3 w-3 mr-1" />
      Profile updated
    </Badge>
  );
}

function ChangeLine({ change }: { change: Change }) {
  const label = FIELD_LABELS[change.field] ?? change.field;
  const renderVal = (v: any) => {
    if (v === null || v === undefined || v === "") return <span className="italic text-muted-foreground">empty</span>;
    return <span className="font-medium text-foreground">{String(v)}</span>;
  };
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
      data-testid={`log-change-${change.field}`}
    >
      <span className="text-muted-foreground min-w-[80px]">{label}:</span>
      <span className="line-through text-muted-foreground">{renderVal(change.before)}</span>
      <span className="text-muted-foreground">→</span>
      {renderVal(change.after)}
    </div>
  );
}

export function UserManagementLogs() {
  const { data, isLoading, error } = useQuery<LogEntry[]>({
    queryKey: ["/api/admin/user-management-logs"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16" data-testid="user-management-logs-loading">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-16 text-sm text-destructive" data-testid="user-management-logs-error">
        Couldn't load logs. Please try again.
      </div>
    );
  }
  const logs = data ?? [];
  if (logs.length === 0) {
    return (
      <div className="text-center py-16" data-testid="user-management-logs-empty">
        <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No profile changes recorded yet.</p>
        <p className="text-xs text-muted-foreground/70 mt-1">Edits to user profiles and password changes will appear here.</p>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 py-4 space-y-3" data-testid="user-management-logs-list">
      {logs.map((entry) => {
        const targetName = entry.metadata?.targetUserName ?? null;
        const targetRole = entry.metadata?.targetUserRole;
        const isSelf = !!entry.metadata?.isSelfEdit;
        const changes = entry.metadata?.changes ?? [];
        const created = new Date(entry.createdAt);
        return (
          <Card key={entry.id} className="hover-elevate" data-testid={`log-entry-${entry.id}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-9 w-9 shrink-0 mt-0.5">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {initials(entry.userName)}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold text-foreground" data-testid={`log-actor-${entry.id}`}>
                      {entry.userName ?? "Unknown user"}
                    </span>
                    {entry.userRole === "super_admin" && (
                      <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/50">
                        <ShieldCheck className="h-3 w-3 mr-1" />
                        Super Admin
                      </Badge>
                    )}
                    {entry.userRole && entry.userRole !== "super_admin" && (
                      <span className="text-xs text-muted-foreground">{actorRoleLabel(entry.userRole)}</span>
                    )}
                    <ActionBadge entry={entry} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground ml-auto" data-testid={`log-time-${entry.id}`}>
                          {formatDistanceToNow(created, { addSuffix: true })}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>{format(created, "PPpp")}</TooltipContent>
                    </Tooltip>
                  </div>

                  <p className="text-sm text-muted-foreground mt-1" data-testid={`log-description-${entry.id}`}>
                    {isSelf
                      ? <>Updated their own profile</>
                      : <>Updated profile for <span className="font-medium text-foreground">{targetName ?? `user #${entry.resourceId}`}</span>{targetRole ? <span className="text-muted-foreground"> ({actorRoleLabel(targetRole)})</span> : null}</>}
                  </p>

                  {changes.length > 0 && (
                    <div className="mt-2.5 space-y-1 pl-3 border-l-2 border-border">
                      {changes.map((c, idx) => (
                        <ChangeLine key={`${entry.id}-${c.field}-${idx}`} change={c} />
                      ))}
                    </div>
                  )}

                  {entry.metadata?.passwordReset && entry.action !== "CHANGE_PASSWORD" && changes.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-2 italic">Password was reset.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
