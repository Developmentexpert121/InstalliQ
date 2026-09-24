import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { Users, Plus, Trash2, Shield, User, Loader2, Crown, Edit, Mail, Search, ChevronLeft, ChevronRight, ArrowUpDown, MapPin, ChevronDown, ChevronRight as ChevronRightIcon, Download, Archive, Bot, CreditCard, Phone, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ClipboardList, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { usePageHeader } from "@/lib/page-header";
import type { User as UserType } from "@shared/schema";
import { JOB_TITLE_OPTIONS } from "@shared/schema";
import { UserManagementLogs } from "@/components/user-management-logs";

type SafeUser = Omit<UserType, "password">;

const createUserBaseSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().optional().refine(val => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), "Please enter a valid email address"),
  phone: z.string().optional(),
  role: z.enum(["user", "admin", "super_admin"]),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
});
const createUserSchema = createUserBaseSchema.refine(data => {
  if (data.role === "admin") {
    return !!data.email && data.email.length > 0;
  }
  return (!!data.email && data.email.length > 0) || (!!data.phone && data.phone.length > 0);
}, {
  message: "Either a valid email or phone number is required",
  path: ["email"],
});

const updateUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().optional().refine(val => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), "Please enter a valid email address"),
  phone: z.string().optional(),
  role: z.enum(["user", "admin", "super_admin"]),
  jobTitle: z.string().optional(),
  location: z.string().optional(),
});

type CreateUserFormData = z.infer<typeof createUserSchema>;
type UpdateUserFormData = z.infer<typeof updateUserSchema>;

function AdminMembersMobile({ adminId, onEdit, onDelete, onResetPassword, currentUser }: { adminId: number; onEdit: (user: SafeUser) => void; onDelete: (user: SafeUser) => void; onResetPassword: (user: SafeUser) => void; currentUser: SafeUser | null }) {
  const { data: members = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users", adminId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${adminId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="px-4 py-3 flex items-center justify-center bg-muted/10">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (members.length === 0) {
    return (
      <div className="px-4 py-3 text-xs text-muted-foreground text-center bg-muted/10">
        No users created by this owner yet.
      </div>
    );
  }
  return (
    <div className="divide-y divide-border/50 bg-muted/10">
      {members.map((member) => (
        <div key={member.id} className="flex items-center gap-3 px-4 py-2.5" data-testid={`member-card-mobile-${member.id}`}>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <User className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{member.name}</p>
            <p className="text-xs text-muted-foreground truncate">{member.email || member.phone || member.username || "—"}</p>
          </div>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(member)} data-testid={`button-edit-member-mobile-${member.id}`}>
              <Edit className="h-3.5 w-3.5" />
            </Button>
            {member.id !== currentUser?.id && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onResetPassword(member)} data-testid={`button-reset-member-mobile-${member.id}`}>
                  <KeyRound className="h-3.5 w-3.5 text-orange-500" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDelete(member)} data-testid={`button-delete-member-mobile-${member.id}`}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AdminMembers({ adminId, onEdit, onDelete, onResetPassword, currentUser }: { adminId: number; onEdit: (user: SafeUser) => void; onDelete: (user: SafeUser) => void; onResetPassword: (user: SafeUser) => void; currentUser: SafeUser | null }) {
  const { data: members = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users", adminId, "members"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${adminId}/members`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch members");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="py-4">
          <div className="flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        </TableCell>
      </TableRow>
    );
  }

  if (members.length === 0) {
    return (
      <TableRow>
        <TableCell colSpan={8} className="py-3 text-sm text-muted-foreground text-center">
          No users created by this owner yet.
        </TableCell>
      </TableRow>
    );
  }

  return (
    <>
      {members.map((member) => (
        <TableRow
          key={member.id}
          className="bg-muted/20 hover:bg-muted/40"
          data-testid={`member-card-${member.id}`}
        >
          <TableCell className="pl-4 sm:pl-6 text-center text-xs text-muted-foreground">—</TableCell>
          <TableCell className="pl-6 sm:pl-8">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium text-sm">{member.name}</span>
            </div>
          </TableCell>
          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
            {member.email || "—"}
          </TableCell>
          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
            {member.username}
          </TableCell>
          <TableCell>
            <Badge variant="outline" className="text-xs">User</Badge>
          </TableCell>
          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
            {(member as any).jobTitle || "—"}
          </TableCell>
          <TableCell className="hidden xl:table-cell text-sm text-muted-foreground whitespace-nowrap">
            {format(new Date(member.createdAt), "MMM d, yyyy")}
          </TableCell>
          <TableCell>
            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onEdit(member)}
                    data-testid={`button-edit-user-${member.id}`}
                  >
                    <Edit className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit user</TooltipContent>
              </Tooltip>
              {member.id !== currentUser?.id && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onResetPassword(member)}
                        data-testid={`button-reset-password-${member.id}`}
                      >
                        <KeyRound className="h-5 w-5 text-orange-500" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset Password</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onDelete(member)}
                        data-testid={`button-delete-user-${member.id}`}
                      >
                        <Trash2 className="h-5 w-5 text-destructive" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete user</TooltipContent>
                  </Tooltip>
                </>
              )}
            </div>
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

function AdminVerificationTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: users = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
  });
  const [verificationSubTab, setVerificationSubTab] = useState<"verified" | "unverified">("verified");
  const [hasSynced, setHasSynced] = useState(false);
  const [selectedAdmin, setSelectedAdmin] = useState<SafeUser | null>(null);
  const [isEditingSender, setIsEditingSender] = useState(false);
  const [editSenderForm, setEditSenderForm] = useState({
    firstName: "",
    fromEmail: "",
    replyTo: "",
    companyAddress: "",
    city: "",
    country: "",
    nickname: "",
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/sync-sender-status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
  });

  const updateSenderMutation = useMutation({
    mutationFn: async (data: { userId: number; senderData: typeof editSenderForm }) => {
      const res = await apiRequest("POST", `/api/admin/update-sender/${data.userId}`, data.senderData);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Sender details updated", description: result.requiresVerification ? "A verification email has been sent for the new email address." : "Changes saved successfully." });
      setSelectedAdmin(null);
      setIsEditingSender(false);
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  const openAdminDetails = (admin: SafeUser) => {
    setSelectedAdmin(admin);
    setIsEditingSender(false);
    setEditSenderForm({
      firstName: admin.senderFirstName || "",
      fromEmail: admin.senderFromEmail || "",
      replyTo: admin.senderReplyTo || "",
      companyAddress: admin.senderCompanyAddress || "",
      city: admin.senderCity || "",
      country: admin.senderCountry || "",
      nickname: admin.senderNickname || "",
    });
  };

  useEffect(() => {
    if (!hasSynced && !isLoading) {
      setHasSynced(true);
      syncMutation.mutate();
    }
  }, [hasSynced, isLoading]);

  const adminUsers = useMemo(() => users.filter(u => u.role === "admin"), [users]);
  const verifiedAdmins = useMemo(() => adminUsers.filter(u => u.senderFromEmail && u.senderVerified), [adminUsers]);
  const unverifiedAdmins = useMemo(() => adminUsers.filter(u => !u.senderFromEmail || !u.senderVerified), [adminUsers]);

  const displayedAdmins = verificationSubTab === "verified" ? verifiedAdmins : unverifiedAdmins;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
        <p className="text-sm text-muted-foreground">Loading admins...</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 p-1 bg-muted/50 rounded-lg">
          <Button
            variant={verificationSubTab === "verified" ? "default" : "ghost"}
            size="sm"
            onClick={() => setVerificationSubTab("verified")}
            data-testid="button-verified-tab"
            className="gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4" />
            Verified ({verifiedAdmins.length})
          </Button>
          <Button
            variant={verificationSubTab === "unverified" ? "default" : "ghost"}
            size="sm"
            onClick={() => setVerificationSubTab("unverified")}
            data-testid="button-unverified-tab"
            className="gap-1.5"
          >
            <XCircle className="h-4 w-4" />
            Unverified ({unverifiedAdmins.length})
          </Button>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          data-testid="button-sync-sender-status"
          className="gap-1.5"
        >
          <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync from SendGrid"}
        </Button>
      </div>

      {displayedAdmins.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            {verificationSubTab === "verified" ? (
              <CheckCircle2 className="h-7 w-7 text-muted-foreground/50" />
            ) : (
              <AlertTriangle className="h-7 w-7 text-muted-foreground/50" />
            )}
          </div>
          <h3 className="text-base font-medium">
            {verificationSubTab === "verified" ? "No verified admins" : "No unverified admins"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {verificationSubTab === "verified"
              ? "No admin has completed sender email verification yet."
              : "All admins have completed their sender email verification."}
          </p>
        </div>
      ) : (
        <div className="space-y-0">
          <div className="hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-muted/30">
                  <TableHead className="w-12 font-semibold text-xs pl-6 text-center">S.No.</TableHead>
                  <TableHead className="font-semibold text-xs">Name</TableHead>
                  <TableHead className="font-semibold text-xs">Login Email</TableHead>
                  <TableHead className="font-semibold text-xs">Sender Email</TableHead>
                  <TableHead className="font-semibold text-xs">Nickname</TableHead>
                  <TableHead className="font-semibold text-xs text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayedAdmins.map((admin, index) => (
                  <TableRow key={admin.id} data-testid={`row-admin-verification-${admin.id}`} className="cursor-pointer" onClick={() => openAdminDetails(admin)}>
                    <TableCell className="text-center text-xs text-muted-foreground pl-6">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                          <Shield className="h-4 w-4 text-primary" />
                        </div>
                        <span className="font-medium text-sm" data-testid={`text-admin-name-${admin.id}`}>{admin.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-admin-email-${admin.id}`}>
                      {admin.email || "—"}
                    </TableCell>
                    <TableCell className="text-sm" data-testid={`text-admin-sender-email-${admin.id}`}>
                      {admin.senderFromEmail || <span className="text-muted-foreground italic">Not configured</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground" data-testid={`text-admin-nickname-${admin.id}`}>
                      {admin.senderNickname || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {admin.senderVerified ? (
                        <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700 gap-1" data-testid={`badge-verified-${admin.id}`}>
                          <CheckCircle2 className="h-3 w-3" />
                          Verified
                        </Badge>
                      ) : admin.senderFromEmail ? (
                        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700 gap-1" data-testid={`badge-pending-${admin.id}`}>
                          <AlertTriangle className="h-3 w-3" />
                          Pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground gap-1" data-testid={`badge-unconfigured-${admin.id}`}>
                          <XCircle className="h-3 w-3" />
                          Not Set Up
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="sm:hidden divide-y divide-border">
            {displayedAdmins.map((admin) => (
              <div key={admin.id} className="px-3 py-3 flex items-center gap-3 cursor-pointer" onClick={() => openAdminDetails(admin)} data-testid={`card-admin-verification-mobile-${admin.id}`}>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 flex-shrink-0">
                  <Shield className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm truncate">{admin.name}</span>
                    {admin.senderVerified ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700 gap-1 text-[10px] px-1.5 py-0 h-[18px]">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified
                      </Badge>
                    ) : admin.senderFromEmail ? (
                      <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700 gap-1 text-[10px] px-1.5 py-0 h-[18px]">
                        <AlertTriangle className="h-3 w-3" />
                        Pending
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground gap-1 text-[10px] px-1.5 py-0 h-[18px]">
                        <XCircle className="h-3 w-3" />
                        Not Set Up
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {admin.senderFromEmail || admin.email || "—"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!selectedAdmin} onOpenChange={(open) => { if (!open) { setSelectedAdmin(null); setIsEditingSender(false); } }}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              {selectedAdmin?.name} — Sender Details
            </DialogTitle>
            <DialogDescription>
              {isEditingSender ? "Edit sender email configuration" : "View sender email configuration for this owner"}
            </DialogDescription>
          </DialogHeader>

          {selectedAdmin && !isEditingSender && (
            <div className="space-y-4 overflow-y-auto flex-1">
              <div className="flex items-center gap-2">
                {selectedAdmin.senderVerified ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700 gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Verified
                  </Badge>
                ) : selectedAdmin.senderFromEmail ? (
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/40 dark:text-yellow-300 dark:border-yellow-700 gap-1">
                    <AlertTriangle className="h-3 w-3" /> Pending Verification
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground gap-1">
                    <XCircle className="h-3 w-3" /> Not Set Up
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs font-medium">Sender Name</p>
                  <p className="font-medium" data-testid="text-detail-sender-name">{selectedAdmin.senderFirstName || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium">Nickname</p>
                  <p className="font-medium" data-testid="text-detail-nickname">{selectedAdmin.senderNickname || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs font-medium">From Email</p>
                  <p className="font-medium" data-testid="text-detail-from-email">{selectedAdmin.senderFromEmail || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs font-medium">Reply-To Email</p>
                  <p className="font-medium" data-testid="text-detail-reply-to">{selectedAdmin.senderReplyTo || "—"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs font-medium">Company Address</p>
                  <p className="font-medium" data-testid="text-detail-address">{selectedAdmin.senderCompanyAddress || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium">City</p>
                  <p className="font-medium" data-testid="text-detail-city">{selectedAdmin.senderCity || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium">Country</p>
                  <p className="font-medium" data-testid="text-detail-country">{selectedAdmin.senderCountry || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium">Login Email</p>
                  <p className="font-medium">{selectedAdmin.email || "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs font-medium">Phone</p>
                  <p className="font-medium">{selectedAdmin.phone || "—"}</p>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setIsEditingSender(true)} data-testid="button-edit-sender-details" className="gap-1.5">
                  <Edit className="h-4 w-4" />
                  Edit Details
                </Button>
              </div>
            </div>
          )}

          {selectedAdmin && isEditingSender && (
            <div className="space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Sender Name *</label>
                  <Input
                    value={editSenderForm.firstName}
                    onChange={(e) => setEditSenderForm(prev => ({ ...prev, firstName: e.target.value }))}
                    placeholder="Sender first name"
                    data-testid="input-edit-sender-name"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">From Email *</label>
                  <Input
                    type="email"
                    value={editSenderForm.fromEmail}
                    onChange={(e) => setEditSenderForm(prev => ({ ...prev, fromEmail: e.target.value }))}
                    placeholder="sender@example.com"
                    data-testid="input-edit-from-email"
                  />
                  {editSenderForm.fromEmail.toLowerCase() !== (selectedAdmin.senderFromEmail || "").toLowerCase() && editSenderForm.fromEmail && (
                    <p className="text-xs text-yellow-600 mt-1">Changing the email will require re-verification.</p>
                  )}
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Reply-To Email *</label>
                  <Input
                    type="email"
                    value={editSenderForm.replyTo}
                    onChange={(e) => setEditSenderForm(prev => ({ ...prev, replyTo: e.target.value }))}
                    placeholder="reply@example.com"
                    data-testid="input-edit-reply-to"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Company Address *</label>
                  <Input
                    value={editSenderForm.companyAddress}
                    onChange={(e) => setEditSenderForm(prev => ({ ...prev, companyAddress: e.target.value }))}
                    placeholder="Company address"
                    data-testid="input-edit-company-address"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">City *</label>
                  <Input
                    value={editSenderForm.city}
                    onChange={(e) => setEditSenderForm(prev => ({ ...prev, city: e.target.value }))}
                    placeholder="City"
                    data-testid="input-edit-city"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Country *</label>
                  <Input
                    value={editSenderForm.country}
                    onChange={(e) => setEditSenderForm(prev => ({ ...prev, country: e.target.value }))}
                    placeholder="Country"
                    data-testid="input-edit-country"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Nickname *</label>
                  <Input
                    value={editSenderForm.nickname}
                    onChange={(e) => setEditSenderForm(prev => ({ ...prev, nickname: e.target.value }))}
                    placeholder="Nickname"
                    data-testid="input-edit-nickname"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setIsEditingSender(false)} data-testid="button-cancel-edit-sender">
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!editSenderForm.firstName || !editSenderForm.fromEmail || !editSenderForm.replyTo || !editSenderForm.companyAddress || !editSenderForm.city || !editSenderForm.country || !editSenderForm.nickname) {
                      toast({ title: "All fields are required", variant: "destructive" });
                      return;
                    }
                    updateSenderMutation.mutate({ userId: selectedAdmin.id, senderData: editSenderForm });
                  }}
                  disabled={updateSenderMutation.isPending}
                  data-testid="button-save-sender-details"
                  className="gap-1.5"
                >
                  {updateSenderMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminPage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { setHeaderInfo } = usePageHeader();
  const [, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<SafeUser | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<SafeUser | null>(null);
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<UpdateUserFormData | null>(null);
  const [isResetPasswordDialogOpen, setIsResetPasswordDialogOpen] = useState(false);
  const [userToResetPassword, setUserToResetPassword] = useState<SafeUser | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [expandedAdmins, setExpandedAdmins] = useState<Set<number>>(new Set());
  const [autoExpandDone, setAutoExpandDone] = useState(false);
  const [activeTab, setActiveTab] = useState<"users" | "admins" | "logs">("users");

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [selectedAdminId, setSelectedAdminId] = useState<number | "all">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const USERS_PER_PAGE = 10;

  const isSuperAdmin = currentUser?.role === "super_admin";

  useEffect(() => {
    setHeaderInfo({
      title: "User Management",
      description: isSuperAdmin ? "Manage owners and their locations" : "Manage your users",
      icon: <Users className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
      actions: (
        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            data-testid="button-archive"
            onClick={() => setLocation("/archive")}
          >
            <Archive className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Archive</span>
          </Button>
          <Button
            variant="outline"
            data-testid="button-export-csv"
            onClick={() => {
              window.open("/api/admin/users/export-xlsx", "_blank");
            }}
          >
            <Download className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Export All Data</span>
          </Button>
          <Button data-testid="button-add-user" onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{isSuperAdmin ? "Add Owner" : "Add User"}</span>
          </Button>
        </div>
      ),
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo, isSuperAdmin]);

  const { data: users = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
  });

  useEffect(() => {
    if (isSuperAdmin && users.length > 0 && !autoExpandDone) {
      setExpandedAdmins(new Set());
      setAutoExpandDone(true);
    }
  }, [isSuperAdmin, users, autoExpandDone]);

  const ownerOptions = useMemo(
    () => users.filter((u) => u.role === "admin"),
    [users],
  );

  const filteredAndSortedUsers = useMemo(() => {
    let result = [...users];
    const hasSearch = searchQuery.trim().length > 0;

    if (isSuperAdmin) {
      if (selectedAdminId !== "all") {
        // A specific owner is selected — show only that owner's users.
        result = result.filter(
          (u) => (u.role === "user" || u.role === "installer") && u.createdBy === selectedAdminId,
        );
      } else if (!hasSearch) {
        // Default view: list of owners + any users not assigned to a visible admin
        // (so orphaned/unassigned installers stay visible and editable).
        const adminIds = new Set(users.filter((u) => u.role === "admin").map((u) => u.id));
        result = result.filter(
          (u) =>
            u.role === "admin" ||
            ((u.role === "user" || u.role === "installer") &&
              (!u.createdBy || !adminIds.has(u.createdBy))),
        );
      }
      // Else: "All Owners" + active search → search across everyone
      // (owners and their users) so emails of regular users are found.
    }

    if (hasSearch) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.username.toLowerCase().includes(query) ||
          (user.email && user.email.toLowerCase().includes(query)) ||
          (user.phone && user.phone.includes(query))
      );
    }
    
    result.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });
    
    return result;
  }, [users, searchQuery, sortOrder, selectedAdminId, isSuperAdmin]);

  const totalPages = Math.ceil(filteredAndSortedUsers.length / USERS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * USERS_PER_PAGE;
    return filteredAndSortedUsers.slice(start, start + USERS_PER_PAGE);
  }, [filteredAndSortedUsers, currentPage]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const toggleAdmin = (adminId: number) => {
    setExpandedAdmins(prev => {
      const next = new Set(prev);
      if (next.has(adminId)) {
        next.delete(adminId);
      } else {
        next.add(adminId);
      }
      return next;
    });
  };

  const createForm = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: isSuperAdmin ? "admin" : "user",
      location: "",
    },
  });

  const editForm = useForm<UpdateUserFormData>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "user",
      location: "",
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      return apiRequest("POST", "/api/admin/users", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: isSuperAdmin ? "Owner created" : "User created",
        description: "Account created successfully. Login credentials have been sent if email was provided.",
      });
      createForm.reset();
      setIsCreateDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: isSuperAdmin ? "Failed to create owner" : "Failed to create user",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const invalidateAllUserQueries = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
    queryClient.invalidateQueries({ queryKey: ["/api/admin/user-management-logs"] });
    expandedAdmins.forEach(adminId => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", adminId, "members"] });
    });
  };

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UpdateUserFormData }) => {
      return apiRequest("PATCH", `/api/admin/users/${id}`, data);
    },
    onSuccess: () => {
      invalidateAllUserQueries();
      toast({
        title: "User updated",
        description: "The user has been updated successfully.",
      });
      setIsEditDialogOpen(false);
      setSelectedUser(null);
    },
    onError: (error) => {
      toast({
        title: "Failed to update user",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      invalidateAllUserQueries();
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/deleted"] });
      toast({
        title: "User deleted",
        description: "The user has been deleted successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to delete user",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const paymentToggleMutation = useMutation({
    mutationFn: async ({ userId, paymentRequired }: { userId: number; paymentRequired: boolean }) => {
      const res = await fetch(`/api/admin/users/${userId}/payment-toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentRequired }),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update payment setting");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Payment setting updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update payment setting", variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number; newPassword: string }) => {
      return apiRequest("POST", `/api/admin/users/${userId}/reset-password`, { newPassword });
    },
    onSuccess: () => {
      toast({
        title: "Password Reset",
        description: "The new password has been set and sent to the user's email.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to reset password",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  function openResetPasswordDialog(user: SafeUser) {
    setUserToResetPassword(user);
    setResetPasswordValue("");
    setIsResetPasswordDialogOpen(true);
  }

  function confirmResetPassword() {
    if (userToResetPassword && resetPasswordValue.length >= 6) {
      resetPasswordMutation.mutate({ userId: userToResetPassword.id, newPassword: resetPasswordValue });
      setIsResetPasswordDialogOpen(false);
      setUserToResetPassword(null);
      setResetPasswordValue("");
    }
  }

  function onCreateSubmit(data: CreateUserFormData) {
    createUserMutation.mutate(data);
  }

  function onEditSubmit(data: UpdateUserFormData) {
    if (selectedUser) {
      setPendingFormData(data);
      setIsSaveDialogOpen(true);
    }
  }

  function confirmSaveChanges() {
    if (selectedUser && pendingFormData) {
      updateUserMutation.mutate({ id: selectedUser.id, data: pendingFormData });
      setIsSaveDialogOpen(false);
      setPendingFormData(null);
    }
  }

  function confirmDeleteUser() {
    if (userToDelete) {
      deleteUserMutation.mutate(userToDelete.id);
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
    }
  }

  function openEditDialog(user: SafeUser) {
    setSelectedUser(user);
    editForm.reset({
      name: user.name,
      email: user.email || "",
      phone: user.phone || "",
      role: user.role as "user" | "admin" | "super_admin",
      jobTitle: (user as any).jobTitle || "",
      location: (user as any).location || "",
    });
    setIsEditDialogOpen(true);
  }

  function openDeleteDialog(user: SafeUser) {
    setUserToDelete(user);
    setIsDeleteDialogOpen(true);
  }

  if (currentUser?.role !== "admin" && currentUser?.role !== "super_admin") {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-8 w-8 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium">Access Denied</h3>
            <p className="text-muted-foreground text-sm text-center mt-1">
              You don't have permission to access this page. Only administrators can manage users.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle>{isSuperAdmin ? "Add New Owner" : "Add New User"}</DialogTitle>
              <DialogDescription>
                {isSuperAdmin
                  ? "Create a new owner account. A temporary password will be generated and sent to their email."
                  : "Create a new user account. A temporary password will be generated and sent to their email."}
              </DialogDescription>
            </DialogHeader>

            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4 overflow-y-auto flex-1 px-1 -mx-1">
                <FormField
                  control={createForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., John Doe"
                          data-testid="input-new-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isSuperAdmin ? "Email (Required)" : "Email"}</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="e.g., john@example.com"
                          data-testid="input-new-email"
                          {...field}
                        />
                      </FormControl>
                      {!isSuperAdmin && (
                        <p className="text-xs text-muted-foreground">Either email or phone number is required for login</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={createForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isSuperAdmin ? "Phone Number (Optional)" : "Phone Number"}</FormLabel>
                      <FormControl>
                        <Input
                          type="tel"
                          placeholder="e.g., (555) 123-4567"
                          data-testid="input-new-phone"
                          {...field}
                        />
                      </FormControl>
                      {!isSuperAdmin && (
                        <p className="text-xs text-muted-foreground">Either email or phone number is required for login</p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {!isSuperAdmin && (
                  <FormField
                    control={createForm.control}
                    name="jobTitle"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Title</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-job-title">
                              <SelectValue placeholder="Select a job title" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {JOB_TITLE_OPTIONS.map((title) => (
                              <SelectItem key={title} value={title} data-testid={`option-job-${title.toLowerCase().replace(/\s+/g, '-')}`}>
                                {title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                {isSuperAdmin && (
                <FormField
                  control={createForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-role">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin" data-testid="option-admin">
                            <span className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Admin
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

                {isSuperAdmin && (
                  <FormField
                    control={createForm.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Waltham, MA"
                            data-testid="input-new-location"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    data-testid="button-cancel"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createUserMutation.isPending}
                    data-testid="button-create-user"
                  >
                    {createUserMutation.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {isSuperAdmin ? "Create Owner" : "Create User"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

      <div className="px-4 sm:px-6 pt-3 border-b border-border bg-background overflow-x-auto">
        <div className="flex gap-0 min-w-max">
          <button
            onClick={() => setActiveTab("users")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "users"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-users"
          >
            <Users className="h-4 w-4 inline-block mr-1.5 -mt-0.5" />
            {isSuperAdmin ? "Owners" : "Users"}
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "logs"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-user-management-logs"
          >
            <ClipboardList className="h-4 w-4 inline-block mr-1.5 -mt-0.5" />
            User Management Logs
          </button>
          {/* Admins tab hidden */}
          {false && isSuperAdmin && (
          <button
            onClick={() => setActiveTab("admins")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "admins"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            data-testid="tab-admins"
          >
            <Shield className="h-4 w-4 inline-block mr-1.5 -mt-0.5" />
            Admins
          </button>
          )}
        </div>
      </div>

      {activeTab === "admins" && isSuperAdmin ? (
        <div className="flex-1 overflow-auto">
          <AdminVerificationTab />
        </div>
      ) : activeTab === "logs" ? (
        <div className="flex-1 overflow-auto">
          <UserManagementLogs />
        </div>
      ) : (
      <>
      <div className="px-4 sm:px-6 py-3 border-b border-border bg-background">
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={
                isSuperAdmin
                  ? selectedAdminId === "all"
                    ? "Search owners by name, email..."
                    : "Search this owner's users by name, email..."
                  : "Search by name, email, or phone..."
              }
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-9"
              data-testid="input-search-users"
            />
          </div>
          {isSuperAdmin && (
            <Select
              value={selectedAdminId === "all" ? "all" : String(selectedAdminId)}
              onValueChange={(value) => {
                setSelectedAdminId(value === "all" ? "all" : Number(value));
                setCurrentPage(1);
              }}
            >
              <SelectTrigger
                className="w-full sm:w-[220px] h-9"
                data-testid="select-filter-admin"
              >
                <Shield className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter by owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" data-testid="option-filter-all-owners">
                  All Owners
                </SelectItem>
                {ownerOptions.map((owner) => (
                  <SelectItem
                    key={owner.id}
                    value={String(owner.id)}
                    data-testid={`option-filter-owner-${owner.id}`}
                  >
                    {owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sortOrder} onValueChange={(value: "newest" | "oldest") => setSortOrder(value)}>
            <SelectTrigger className="w-full sm:w-[180px] h-9" data-testid="select-sort-order">
              <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" data-testid="option-newest">Newest First</SelectItem>
              <SelectItem value="oldest" data-testid="option-oldest">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">Loading users...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium">No {isSuperAdmin ? "owners" : "users"} yet</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Click "{isSuperAdmin ? "Add Owner" : "Add User"}" to create the first account.
            </p>
          </div>
        ) : filteredAndSortedUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Search className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium">No {isSuperAdmin ? "owners" : "users"} found</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Try adjusting your search criteria.
            </p>
          </div>
        ) : (
          <>
            <div className="sm:hidden divide-y divide-border">
              {paginatedUsers.map((user, index) => {
                const isExpanded = isSuperAdmin && expandedAdmins.has(user.id);
                const roleBadgeClass = user.role === "super_admin"
                  ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700"
                  : user.role === "admin"
                  ? "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700"
                  : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
                const roleLabel = user.role === "super_admin" ? "Admin" : user.role === "admin" ? "Owner" : "User";

                return (
                  <div key={user.id} data-testid={`user-card-mobile-${user.id}`}>
                    <div
                      className={`flex items-center gap-3 px-3 py-3 ${isSuperAdmin && user.role === "admin" ? "cursor-pointer active:bg-muted/40" : ""} ${isExpanded ? "bg-muted/10" : ""}`}
                      onClick={() => isSuperAdmin && user.role === "admin" && toggleAdmin(user.id)}
                    >
                      {isSuperAdmin && user.role === "admin" && (
                        <div className="shrink-0 w-4 flex items-center justify-center">
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                          ) : (
                            <ChevronRightIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </div>
                      )}

                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        {user.role === "super_admin" ? (
                          <Crown className="h-4 w-4 text-primary" />
                        ) : user.role === "admin" ? (
                          <Shield className="h-4 w-4 text-primary" />
                        ) : (
                          <User className="h-4 w-4 text-primary" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate">{user.name}</span>
                          <Badge variant="outline" className={`text-[10px] font-medium px-1.5 py-0 h-[18px] flex-shrink-0 ${roleBadgeClass}`}>
                            {roleLabel}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {user.email || user.phone || user.username || "—"}
                        </p>
                      </div>

                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {isSuperAdmin && user.role === "admin" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-primary"
                            onClick={(e) => { e.stopPropagation(); setLocation(`/assistant-settings/${user.id}`); }}
                            data-testid={`button-ai-assistant-mobile-${user.id}`}
                          >
                            <Bot className="h-4 w-4" />
                          </Button>
                        )}
                        {(user.isMaster !== "true" || (isSuperAdmin && user.role === "admin")) && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => { e.stopPropagation(); openEditDialog(user); }}
                              data-testid={`button-edit-user-mobile-${user.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {user.id !== currentUser?.id && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => { e.stopPropagation(); openResetPasswordDialog(user); }}
                                  data-testid={`button-reset-password-mobile-${user.id}`}
                                >
                                  <KeyRound className="h-4 w-4 text-orange-500" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={(e) => { e.stopPropagation(); openDeleteDialog(user); }}
                                  disabled={deleteUserMutation.isPending}
                                  data-testid={`button-delete-user-mobile-${user.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <AdminMembersMobile
                        adminId={user.id}
                        onEdit={openEditDialog}
                        onDelete={openDeleteDialog}
                        onResetPassword={openResetPasswordDialog}
                        currentUser={currentUser as SafeUser}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden sm:block min-w-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/30">
                    <TableHead className="w-12 font-semibold text-xs pl-6 text-center">S.No.</TableHead>
                    <TableHead className="font-semibold text-xs">Full Name</TableHead>
                    <TableHead className="font-semibold text-xs">Email</TableHead>
                    <TableHead className="hidden md:table-cell font-semibold text-xs">Username</TableHead>
                    <TableHead className="font-semibold text-xs">Role</TableHead>
                    <TableHead className="hidden lg:table-cell font-semibold text-xs">{isSuperAdmin ? "Location" : "Job Title"}</TableHead>
                    <TableHead className="hidden xl:table-cell font-semibold text-xs">Joined Date</TableHead>
                    <TableHead className="font-semibold text-xs pr-6">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedUsers.map((user, index) => {
                    const isExpanded = isSuperAdmin && expandedAdmins.has(user.id);
                    return (
                      <UserTableRows
                        key={user.id}
                        user={user}
                        serialNo={((currentPage - 1) * USERS_PER_PAGE) + index + 1}
                        isSuperAdmin={isSuperAdmin}
                        isExpanded={isExpanded}
                        currentUser={currentUser as SafeUser}
                        onToggle={() => toggleAdmin(user.id)}
                        onEdit={openEditDialog}
                        onDelete={openDeleteDialog}
                        onResetPassword={openResetPasswordDialog}
                        onNavigate={setLocation}
                        deleteDisabled={deleteUserMutation.isPending}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>

      {totalPages > 0 && filteredAndSortedUsers.length > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-t border-border bg-muted/20 flex-shrink-0">
          <p className="text-xs text-muted-foreground" data-testid="text-pagination-info">
            {((currentPage - 1) * USERS_PER_PAGE) + 1}–{Math.min(currentPage * USERS_PER_PAGE, filteredAndSortedUsers.length)} of {filteredAndSortedUsers.length} {isSuperAdmin ? "owners" : "users"}
          </p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                data-testid="button-prev-page"
              >
                <ChevronLeft className="h-4 w-4 mr-0.5" />
                Prev
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  let page: number;
                  if (totalPages <= 5) {
                    page = i + 1;
                  } else if (currentPage <= 3) {
                    page = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    page = totalPages - 4 + i;
                  } else {
                    page = currentPage - 2 + i;
                  }
                  return (
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
                  );
                })}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                data-testid="button-next-page"
              >
                Next
                <ChevronRight className="h-4 w-4 ml-0.5" />
              </Button>
            </div>
          )}
        </div>
      )}
      </>
      )}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit {selectedUser?.role === "admin" ? "Owner" : "User"}</DialogTitle>
            <DialogDescription>
              Update information for {selectedUser?.name}
            </DialogDescription>
          </DialogHeader>

          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(onEditSubmit, (errors) => {
              console.error("[EditUser] form validation failed", errors);
              const firstError = Object.values(errors)[0] as any;
              toast({
                title: "Please fix the form",
                description: firstError?.message || "Some fields are invalid.",
                variant: "destructive",
              });
            })} className="space-y-4">
              <FormField
                control={editForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Full Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., John Doe"
                        data-testid="input-edit-name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="e.g., john@example.com"
                        data-testid="input-edit-email"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={editForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="tel"
                        placeholder="e.g., (555) 123-4567"
                        data-testid="input-edit-phone"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {selectedUser?.role === "user" && (
                <FormField
                  control={editForm.control}
                  name="jobTitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Title</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-job-title">
                            <SelectValue placeholder="Select a job title" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {JOB_TITLE_OPTIONS.map((title) => (
                            <SelectItem key={title} value={title} data-testid={`option-edit-job-${title.toLowerCase().replace(/\s+/g, '-')}`}>
                              {title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isSuperAdmin && selectedUser?.role !== "admin" && (
                <FormField
                  control={editForm.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-edit-role">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="admin">
                            <span className="flex items-center gap-2">
                              <Shield className="h-4 w-4" />
                              Admin
                            </span>
                          </SelectItem>
                          <SelectItem value="user">
                            <span className="flex items-center gap-2">
                              <User className="h-4 w-4" />
                              User
                            </span>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isSuperAdmin && (
                <FormField
                  control={editForm.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Location</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Waltham, MA"
                          data-testid="input-edit-location"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  data-testid="button-save-user"
                >
                  {updateUserMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  Save Changes
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {userToDelete?.role === "admin" ? "Owner" : "User"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {userToDelete?.name}? They will no longer be able to log in. You can restore them later from the "Deleted Users" section.
              {userToDelete?.role === "admin" && " All users created by this owner will also need to be reassigned."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setUserToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteUser}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteUserMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isResetPasswordDialogOpen} onOpenChange={(open) => { setIsResetPasswordDialogOpen(open); if (!open) { setUserToResetPassword(null); setResetPasswordValue(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password</AlertDialogTitle>
            <AlertDialogDescription>
              Set a new password for {userToResetPassword?.name}. The password will be sent to their email ({userToResetPassword?.email}).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              type="text"
              placeholder="Enter new password (min 6 characters)"
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
              data-testid="input-reset-password"
            />
            {resetPasswordValue.length > 0 && resetPasswordValue.length < 6 && (
              <p className="text-xs text-destructive mt-1">Password must be at least 6 characters</p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setUserToResetPassword(null); setResetPasswordValue(""); }}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmResetPassword}
              disabled={resetPasswordValue.length < 6}
              data-testid="button-confirm-reset-password"
            >
              {resetPasswordMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Reset Password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save Changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to save the changes for {selectedUser?.name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingFormData(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmSaveChanges}
              data-testid="button-confirm-save"
            >
              {updateUserMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function UserTableRows({
  user,
  serialNo,
  isSuperAdmin,
  isExpanded,
  currentUser,
  onToggle,
  onEdit,
  onDelete,
  onResetPassword,
  onNavigate,
  deleteDisabled,
}: {
  user: SafeUser;
  serialNo: number;
  isSuperAdmin: boolean;
  isExpanded: boolean;
  currentUser: SafeUser;
  onToggle: () => void;
  onEdit: (user: SafeUser) => void;
  onDelete: (user: SafeUser) => void;
  onResetPassword: (user: SafeUser) => void;
  onNavigate: (path: string) => void;
  deleteDisabled: boolean;
}) {
  const roleBadgeClass = user.role === "super_admin"
    ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-700"
    : user.role === "admin"
    ? "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-700"
    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

  const roleLabel = user.role === "super_admin" ? "Admin" : user.role === "admin" ? "Owner" : "User";

  return (
    <>
      <TableRow
        className={`hover:bg-muted/30 transition-colors ${isExpanded ? "bg-muted/10" : ""}`}
        data-testid={`user-card-${user.id}`}
      >
        <TableCell className="pl-4 sm:pl-6 text-center text-sm text-muted-foreground font-medium w-12">
          {serialNo}
        </TableCell>
        <TableCell>
          <div
            className={`flex items-center gap-3 ${isSuperAdmin && user.role === "admin" ? "cursor-pointer" : ""}`}
            onClick={() => isSuperAdmin && user.role === "admin" && onToggle()}
            data-testid={`button-toggle-admin-${user.id}`}
          >
            {isSuperAdmin && user.role === "admin" && (
              <div className="shrink-0 w-5 flex items-center justify-center">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            )}
            {isSuperAdmin && user.role !== "admin" && (
              <div className="shrink-0 w-5" />
            )}
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
              {user.role === "super_admin" ? (
                <Crown className="h-4 w-4 text-primary" />
              ) : user.role === "admin" ? (
                <Shield className="h-4 w-4 text-primary" />
              ) : (
                <User className="h-4 w-4 text-primary" />
              )}
            </div>
            <span className="font-medium text-sm">{user.name}</span>
          </div>
        </TableCell>
        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
          {user.email || "—"}
        </TableCell>
        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
          {user.username}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className={`text-xs font-medium ${roleBadgeClass}`}>
            {roleLabel}
          </Badge>
        </TableCell>
        <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
          {isSuperAdmin
            ? ((user as any).location || "—")
            : ((user as any).jobTitle || "—")}
        </TableCell>
        <TableCell className="hidden xl:table-cell text-sm text-muted-foreground whitespace-nowrap">
          {format(new Date(user.createdAt), "MMM d, yyyy")}
        </TableCell>
        <TableCell className="pr-2 sm:pr-6">
          <div className="flex items-center gap-0.5">
            {isSuperAdmin && user.role === "admin" && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      onClick={() => onNavigate(`/assistant-settings/${user.id}`)}
                      data-testid={`button-ai-assistant-${user.id}`}
                    >
                      <Bot className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI Assistant Settings</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-primary"
                      onClick={() => onNavigate(`/admin/questionnaire/${user.id}`)}
                      data-testid={`button-questionnaire-${user.id}`}
                    >
                      <ClipboardList className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View Questionnaire</TooltipContent>
                </Tooltip>
              </>
            )}
            {(user.isMaster !== "true" || (isSuperAdmin && user.role === "admin")) && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(user)}
                      data-testid={`button-edit-user-${user.id}`}
                    >
                      <Edit className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Edit {isSuperAdmin ? "owner" : "user"}</TooltipContent>
                </Tooltip>
                {user.id !== currentUser?.id && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onResetPassword(user)}
                          data-testid={`button-reset-password-${user.id}`}
                        >
                          <KeyRound className="h-5 w-5 text-orange-500" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Reset Password</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => onDelete(user)}
                          disabled={deleteDisabled}
                          data-testid={`button-delete-user-${user.id}`}
                        >
                          <Trash2 className="h-5 w-5 text-destructive" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete {isSuperAdmin ? "owner" : "user"}</TooltipContent>
                    </Tooltip>
                  </>
                )}
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
      {isExpanded && (
        <AdminMembers
          adminId={user.id}
          onEdit={onEdit}
          onDelete={onDelete}
          onResetPassword={onResetPassword}
          currentUser={currentUser}
        />
      )}
    </>
  );
}
