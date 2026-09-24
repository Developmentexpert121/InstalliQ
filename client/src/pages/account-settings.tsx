import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Settings, Loader2, Check, X, ScanFace, Shield, ShieldCheck, ShieldAlert, Smartphone, Chrome, Mail, KeyRound, User, Eye, EyeOff, Lock, CalendarDays, MapPin, Briefcase, Bell, Volume2, VolumeX, Music, FileText, Upload, Building2, Download, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { usePageHeader } from "@/lib/page-header";
import FaceCapture from "@/components/face-capture";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { getNotificationSoundEnabled, setNotificationSoundEnabled, useTestNotificationSound, useSelectedTone, NOTIFICATION_TONES } from "@/hooks/use-notification-sound";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

function ProfileAvatar({ name, photo, size = "lg" }: { name: string; photo?: string | null; size?: "sm" | "lg" }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sizeClass = size === "lg" ? "h-16 w-16" : "h-10 w-10";
  const textSize = size === "lg" ? "text-xl" : "text-sm";

  if (photo) {
    return (
      <img
        src={photo}
        alt={name}
        className={`${sizeClass} rounded-full object-cover ring-2 ring-primary/10 shrink-0`}
        style={{ transform: "scaleX(-1)" }}
      />
    );
  }

  return (
    <div className={`${sizeClass} rounded-full bg-gradient-to-br from-primary to-primary/70 ring-2 ring-primary/10 flex items-center justify-center shrink-0`}>
      <span className={`${textSize} font-bold text-primary-foreground`}>{initials}</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description }: { icon: React.ElementType; title: string; description: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-3.5">
      <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-foreground leading-tight">{title}</h3>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function SecurityMethodCard({
  icon: Icon,
  label,
  description,
  isActive,
  activeDetail,
  activePhoto,
  children,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  isActive: boolean;
  activeDetail?: string;
  activePhoto?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className={`relative p-3 sm:p-4 rounded-xl border transition-all ${
      isActive
        ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40"
        : "bg-card border-border hover:border-muted-foreground/20"
    }`}>
      <div className="flex items-start gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
          isActive ? "bg-emerald-100 dark:bg-emerald-900/50" : "bg-muted"
        }`}>
          {activePhoto ? (
            <img
              src={activePhoto}
              alt="Face"
              className="h-11 w-11 rounded-xl object-cover"
              style={{ transform: "scaleX(-1)" }}
              data-testid="img-face-photo"
            />
          ) : (
            <Icon className={`h-5 w-5 ${isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-sm font-semibold text-foreground">{label}</h4>
            {isActive ? (
              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400 border-0 text-[10px] px-2 py-0 h-5 font-semibold no-default-active-elevate">
                Enabled
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[10px] px-2 py-0 h-5 font-medium no-default-active-elevate">
                Off
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
          {activeDetail && (
            <p className="text-xs text-muted-foreground mt-1 truncate">{activeDetail}</p>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AccountSettingsPage() {
  const { user, refreshUser, logout } = useAuth();
  const { toast } = useToast();
  const { setHeaderInfo } = usePageHeader();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showFaceCapture, setShowFaceCapture] = useState(false);
  const [isFaceProcessing, setIsFaceProcessing] = useState(false);
  const [showFaceDisableConfirm, setShowFaceDisableConfirm] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const queryClient = useQueryClient();

  const { data: faceStatus } = useQuery<{ faceEnabled: boolean; faceRegisteredAt: string | null; facePhoto: string | null }>({
    queryKey: ["/api/auth/face-status"],
  });

  const { data: googleStatus } = useQuery<{ googleEnabled: boolean; googleEmail: string | null }>({
    queryKey: ["/api/auth/google/status"],
  });

  const [isGoogleUnlinking, setIsGoogleUnlinking] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteAccountPassword, setDeleteAccountPassword] = useState("");
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState("");
  const [showDeletePassword, setShowDeletePassword] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [notifSoundEnabled, setNotifSoundEnabled] = useState(getNotificationSoundEnabled);

  const { data: selfDeleteSetting } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/app-settings/self-delete-enabled"],
    enabled: user?.role === "user",
  });
  const isOwnerAdmin = user?.role === "admin";
  const isAdminOrSuper = user?.role === "admin" || user?.role === "super_admin";
  const { data: pdfBranding, refetch: refetchBranding } = useQuery<{
    pdfLogoUrl: string | null;
    pdfTemplateUrl: string | null;
    pdfCompanyName: string | null;
    pdfCompanyAddress: string | null;
    pdfCompanyPhone: string | null;
    pdfCompanyEmail: string | null;
  }>({
    queryKey: ["/api/auth/pdf-branding"],
    enabled: isAdminOrSuper,
  });
  const [brandingForm, setBrandingForm] = useState({
    companyName: "",
    companyAddress: "",
    companyPhone: "",
    companyEmail: "",
  });
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [templateUploading, setTemplateUploading] = useState(false);

  useEffect(() => {
    if (pdfBranding) {
      setBrandingForm({
        companyName: pdfBranding.pdfCompanyName || "",
        companyAddress: pdfBranding.pdfCompanyAddress || "",
        companyPhone: pdfBranding.pdfCompanyPhone || "",
        companyEmail: pdfBranding.pdfCompanyEmail || "",
      });
    }
  }, [pdfBranding]);
  const handleBrandingSave = async () => {
    setBrandingSaving(true);
    try {
      const res = await apiRequest("PATCH", "/api/auth/pdf-branding", {
        pdfCompanyName: brandingForm.companyName,
        pdfCompanyAddress: brandingForm.companyAddress,
        pdfCompanyPhone: brandingForm.companyPhone,
        pdfCompanyEmail: brandingForm.companyEmail,
      });
      const data = await res.json();
      if (data.success) {
        refetchBranding();
        toast({ title: "Branding Updated", description: "Your PDF branding has been saved." });
      } else {
        toast({ title: "Error", description: data.error || "Failed to save branding.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save branding.", variant: "destructive" });
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please upload an image file (PNG, JPG, etc).", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Logo must be under 5MB.", variant: "destructive" });
      return;
    }
    setLogoUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/auth/pdf-branding/logo", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (data.success) {
        refetchBranding();
        toast({ title: "Logo Uploaded", description: "Your company logo has been saved.", variant: "success" });
      } else {
        toast({ title: "Error", description: data.error || "Failed to upload logo.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to upload logo.", variant: "destructive" });
    } finally {
      setLogoUploading(false);
      e.target.value = "";
    }
  };

  const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isPdf = file.type === "application/pdf";
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) {
      toast({ title: "Invalid File", description: "Please upload a PDF or image file (PNG, JPG).", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Template must be under 10MB.", variant: "destructive" });
      return;
    }
    setTemplateUploading(true);
    try {
      const formData = new FormData();
      formData.append("template", file);
      const res = await fetch("/api/auth/pdf-branding/template", { method: "POST", body: formData, credentials: "include" });
      const data = await res.json();
      if (data.success) {
        refetchBranding();
        toast({ title: "Template Uploaded", description: "Your PDF template has been saved. All reports will now use this branded template.", variant: "success" });
      } else {
        toast({ title: "Error", description: data.error || "Failed to upload template.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to upload template.", variant: "destructive" });
    } finally {
      setTemplateUploading(false);
      e.target.value = "";
    }
  };

  const handleLogoRemove = async () => {
    try {
      const res = await fetch("/api/auth/pdf-branding/logo", { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (data.success) {
        refetchBranding();
        toast({ title: "Logo Removed", description: "Reports will use the default layout without a logo." });
      }
    } catch {
      toast({ title: "Error", description: "Failed to remove logo.", variant: "destructive" });
    }
  };

  const handleTemplateRemove = async () => {
    try {
      const res = await fetch("/api/auth/pdf-branding/template", { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (data.success) {
        refetchBranding();
        toast({ title: "Template Removed", description: "Reports will use the default layout with your logo." });
      }
    } catch {
      toast({ title: "Error", description: "Failed to remove template.", variant: "destructive" });
    }
  };

  const testSound = useTestNotificationSound();
  const [selectedTone, setSelectedTone] = useSelectedTone();

  useEffect(() => {
    setHeaderInfo({
      title: "Account Settings",
      description: "Manage your profile and security preferences",
      icon: <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") === "google_linked") {
      toast({ title: "Google account linked", description: "You can now log in using Google." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/google/status"] });
      refreshUser();
      window.history.replaceState({}, "", "/account");
    }
    if (params.get("error") === "google_already_linked") {
      toast({ title: "Link failed", description: params.get("message") || "This Google account is already linked to another user.", variant: "destructive" });
      window.history.replaceState({}, "", "/account");
    }
  }, []);

  const form = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const newPassword = form.watch("newPassword");

  const passwordChecks = [
    { label: "8+ characters", valid: newPassword.length >= 8 },
    { label: "Uppercase letter", valid: /[A-Z]/.test(newPassword) },
    { label: "Number", valid: /[0-9]/.test(newPassword) },
    { label: "Special character", valid: /[!@#$%^&*(),.?":{}|<>]/.test(newPassword) },
  ];

  async function onSubmit(data: ChangePasswordFormData) {
    try {
      setIsSubmitting(true);
      await apiRequest("POST", "/api/auth/change-password", {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      await refreshUser();
      toast({
        title: "Password changed",
        description: "Your password has been updated successfully.",
      });
      form.reset();
      setShowChangePassword(false);
    } catch (error) {
      toast({
        title: "Failed to change password",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const getRoleLabel = (u: typeof user) => {
    if (!u) return "";
    if (u.role === "super_admin") return "Admin";
    if (u.role === "admin") return "Owner";
    return (u as any).jobTitle || "Installer";
  };

  const roleBadgeClass: Record<string, string> = {
    super_admin: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    admin: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400 border-orange-200 dark:border-orange-800",
    user: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  };

  const securityScore = [
    !!faceStatus?.faceEnabled,
    !!googleStatus?.googleEnabled,
  ].filter(Boolean).length;

  const securityLabel = securityScore === 2 ? "Excellent" : securityScore === 1 ? "Good" : "Needs Attention";
  const securityColor = securityScore === 2 ? "text-emerald-600 dark:text-emerald-400" : securityScore >= 1 ? "text-yellow-600 dark:text-yellow-400" : "text-orange-600 dark:text-orange-400";
  const securityBarColor = securityScore === 3 ? "bg-emerald-500" : securityScore >= 2 ? "bg-yellow-500" : "bg-orange-500";

  const joinDate = user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null;

  return (
    <div className="p-3 sm:p-5 w-full h-full overflow-y-auto">
      <div className="w-full space-y-2.5">

        <Card className="overflow-hidden">
          <div className="h-14 sm:h-16 bg-gradient-to-r from-primary/15 via-primary/8 to-primary/4 dark:from-primary/10 dark:via-primary/5 dark:to-transparent" />
          <CardContent className="px-4 sm:px-6 pb-4 -mt-7 sm:-mt-8">
            <div className="flex flex-col sm:flex-row sm:items-end gap-4">
              <ProfileAvatar name={user?.name || "U"} photo={faceStatus?.facePhoto} />
              <div className="flex-1 min-w-0 sm:pb-1">
                <div className="flex items-center gap-2.5 mb-1.5 flex-wrap">
                  <h2 className="text-xl font-bold text-foreground truncate" data-testid="text-profile-name">{user?.name}</h2>
                  <Badge className={`${roleBadgeClass[user?.role || "user"]} border text-[11px] px-2.5 py-0.5 font-semibold no-default-active-elevate`}>
                    {getRoleLabel(user)}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1.5" data-testid="text-username">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    @{user?.username}
                  </span>
                  {user?.email && (
                    <span className="flex items-center gap-1.5 truncate" data-testid="text-email">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      {user.email}
                    </span>
                  )}
                  {user?.phone && (
                    <span className="flex items-center gap-1.5" data-testid="text-phone">
                      <Smartphone className="h-3.5 w-3.5 shrink-0" />
                      {user.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-3 pt-3 border-t border-border/60">
              {user?.role !== "user" && user?.location && (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Location</p>
                    <p className="text-xs font-medium text-foreground truncate">{user.location}</p>
                  </div>
                </div>
              )}
              {user?.role === "user" && user?.jobTitle && (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Job Title</p>
                    <p className="text-xs font-medium text-foreground truncate">{user.jobTitle}</p>
                  </div>
                </div>
              )}
              {joinDate && (
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Joined</p>
                    <p className="text-xs font-medium text-foreground truncate">{joinDate}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
                  securityScore >= 2 ? "bg-emerald-100 dark:bg-emerald-900/40" : "bg-orange-100 dark:bg-orange-900/40"
                }`}>
                  {securityScore >= 2
                    ? <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    : <ShieldAlert className="h-3.5 w-3.5 text-orange-600 dark:text-orange-400" />
                  }
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Security</p>
                  <p className={`text-xs font-semibold ${securityColor}`}>{securityLabel}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-start">

          <Card>
            <CardContent className="p-4 sm:p-5">
              <SectionHeader icon={Lock} title="Password" description="Keep your account secure with a strong password" />

              {!showChangePassword ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg bg-background border border-border flex items-center justify-center">
                      <KeyRound className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">Password set</p>
                      <p className="text-xs text-muted-foreground">Last updated recently</p>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowChangePassword(true)}
                    className="h-8 text-xs font-medium"
                    data-testid="button-toggle-password"
                  >
                    Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                      <FormField
                        control={form.control}
                        name="currentPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Current Password</FormLabel>
                            <FormControl>
                              <div className="relative flex items-center">
                                <Input
                                  type={showCurrentPassword ? "text" : "password"}
                                  placeholder="Enter current password"
                                  className="h-10 pr-10 w-full"
                                  data-testid="input-current-password"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                  tabIndex={-1}
                                  aria-label="Toggle password visibility"
                                >
                                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="newPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">New Password</FormLabel>
                            <FormControl>
                              <div className="relative flex items-center">
                                <Input
                                  type={showNewPassword ? "text" : "password"}
                                  placeholder="Enter new password"
                                  className="h-10 pr-10 w-full"
                                  data-testid="input-new-password"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                                  onClick={() => setShowNewPassword(!showNewPassword)}
                                  tabIndex={-1}
                                  aria-label="Toggle password visibility"
                                >
                                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {newPassword && (
                        <div className="grid grid-cols-2 gap-2">
                          {passwordChecks.map((check, index) => (
                            <div
                              key={index}
                              className={`flex items-center gap-1.5 text-xs py-1.5 px-2.5 rounded-lg transition-colors ${
                                check.valid
                                  ? "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400"
                                  : "bg-muted/50 text-muted-foreground/60"
                              }`}
                            >
                              {check.valid ? <Check className="h-3 w-3 shrink-0" /> : <X className="h-3 w-3 shrink-0" />}
                              {check.label}
                            </div>
                          ))}
                        </div>
                      )}

                      <FormField
                        control={form.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs font-medium">Confirm New Password</FormLabel>
                            <FormControl>
                              <div className="relative flex items-center">
                                <Input
                                  type={showConfirmPassword ? "text" : "password"}
                                  placeholder="Confirm new password"
                                  className="h-10 pr-10 w-full"
                                  data-testid="input-confirm-password"
                                  {...field}
                                />
                                <button
                                  type="button"
                                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-none"
                                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                  tabIndex={-1}
                                  aria-label="Toggle password visibility"
                                >
                                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          type="submit"
                          size="sm"
                          disabled={isSubmitting}
                          className="h-9 px-4 text-xs font-medium"
                          data-testid="button-change-password"
                        >
                          {isSubmitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                          Update Password
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => { setShowChangePassword(false); form.reset(); }}
                          className="h-9 px-4 text-xs font-medium"
                          data-testid="button-cancel-password"
                        >
                          Cancel
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <SectionHeader icon={Shield} title="Security & Login Methods" description="Manage how you sign in to your account" />

              <div className="flex items-center gap-3 mb-3 p-2.5 rounded-xl bg-muted/40 border border-border/60">
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-xs text-muted-foreground font-medium">Protection:</span>
                  <div className="flex items-center gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`h-2 w-6 rounded-full transition-all ${
                          i < securityScore ? securityBarColor : "bg-muted-foreground/15"
                        }`}
                      />
                    ))}
                  </div>
                  <span className={`text-xs font-semibold ml-1 ${securityColor}`}>
                    {securityLabel}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{securityScore}/3 methods</span>
              </div>

              <div className="space-y-3">
                <SecurityMethodCard
                  icon={ScanFace}
                  label="Face Login"
                  description={faceStatus?.faceEnabled
                    ? `Registered ${faceStatus.faceRegisteredAt ? new Date(faceStatus.faceRegisteredAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}`
                    : "Sign in using facial recognition"}
                  isActive={!!faceStatus?.faceEnabled}
                  activePhoto={faceStatus?.faceEnabled ? faceStatus?.facePhoto : null}
                >
                  {!showFaceCapture ? (
                    <>
                      <Button
                        size="sm"
                        variant={faceStatus?.faceEnabled ? "outline" : "default"}
                        onClick={() => setShowFaceCapture(true)}
                        className="h-8 text-xs font-medium"
                        data-testid="button-register-face"
                      >
                        <ScanFace className="h-3.5 w-3.5 mr-1.5" />
                        {faceStatus?.faceEnabled ? "Re-register" : "Register Face"}
                      </Button>
                      {faceStatus?.faceEnabled && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setShowFaceDisableConfirm(true)}
                          className="h-8 text-xs font-medium text-destructive hover:text-destructive"
                          data-testid="button-disable-face"
                        >
                          Disable
                        </Button>
                      )}
                    </>
                  ) : (
                    <div className="w-full -ml-14.5">
                      <FaceCapture
                        mode="register"
                        isProcessing={isFaceProcessing}
                        onCancel={() => setShowFaceCapture(false)}
                        onDescriptorCaptured={async (descriptor, photo) => {
                          setIsFaceProcessing(true);
                          try {
                            await apiRequest("POST", "/api/auth/face-register", {
                              descriptor: Array.from(descriptor),
                              photo: photo || undefined,
                            });
                            queryClient.invalidateQueries({ queryKey: ["/api/auth/face-status"] });
                            setShowFaceCapture(false);
                            toast({ title: "Face registered", description: "Face login has been enabled." });
                          } catch (error) {
                            toast({
                              title: "Registration failed",
                              description: error instanceof Error ? error.message : "Could not register face.",
                              variant: "destructive",
                            });
                          } finally {
                            setIsFaceProcessing(false);
                          }
                        }}
                      />
                    </div>
                  )}
                </SecurityMethodCard>


                <SecurityMethodCard
                  icon={Chrome}
                  label="Google Login"
                  description={googleStatus?.googleEnabled
                    ? `Linked to ${googleStatus.googleEmail || "your Google account"}`
                    : "Sign in with your Google account"}
                  isActive={!!googleStatus?.googleEnabled}
                >
                  {!googleStatus?.googleEnabled ? (
                    <Button
                      size="sm"
                      onClick={() => { window.location.href = "/api/auth/google?mode=link"; }}
                      className="h-8 text-xs font-medium"
                      data-testid="button-enable-google"
                    >
                      <Chrome className="h-3.5 w-3.5 mr-1.5" />
                      Link Google
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isGoogleUnlinking}
                      onClick={async () => {
                        setIsGoogleUnlinking(true);
                        try {
                          await apiRequest("POST", "/api/auth/google/unlink");
                          queryClient.invalidateQueries({ queryKey: ["/api/auth/google/status"] });
                          refreshUser();
                          toast({ title: "Google unlinked", description: "Google login has been disabled." });
                        } catch {
                          toast({ title: "Error", description: "Failed to unlink Google account.", variant: "destructive" });
                        } finally {
                          setIsGoogleUnlinking(false);
                        }
                      }}
                      className="h-8 text-xs font-medium text-destructive hover:text-destructive"
                      data-testid="button-disable-google"
                    >
                      {isGoogleUnlinking && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                      Unlink
                    </Button>
                  )}
                </SecurityMethodCard>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Notification Sound Settings */}
        <Card className="border shadow-sm">
          <CardContent className="p-4 sm:p-5">
              <SectionHeader
                icon={Bell}
                title="Notification Sound"
                description="Choose your preferred notification tone"
              />

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border/60 mb-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (notifSoundEnabled) {
                        setNotifSoundEnabled(false);
                        setNotificationSoundEnabled(false);
                        toast({ title: "Sound muted", description: "Notification sounds have been turned off." });
                      } else {
                        setNotifSoundEnabled(true);
                        setNotificationSoundEnabled(true);
                        testSound(selectedTone);
                        toast({ title: "Sound enabled", description: "You'll hear a notification tone when new alerts arrive." });
                      }
                    }}
                    className={`relative h-10 w-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                      notifSoundEnabled
                        ? "bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-md shadow-emerald-500/25"
                        : "bg-muted text-muted-foreground hover:bg-muted-foreground/15"
                    }`}
                    data-testid={notifSoundEnabled ? "button-disable-sound" : "button-enable-sound"}
                  >
                    {notifSoundEnabled ? (
                      <Volume2 className="h-5 w-5" />
                    ) : (
                      <VolumeX className="h-5 w-5" />
                    )}
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">
                        {notifSoundEnabled ? "Sound On" : "Sound Off"}
                      </h4>
                      <span className={`inline-block h-2 w-2 rounded-full ${notifSoundEnabled ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground/30"}`} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {notifSoundEnabled
                        ? NOTIFICATION_TONES.find(t => t.id === selectedTone)?.name || "Gentle Chime"
                        : "Tap the icon to enable sounds"}
                    </p>
                  </div>
                </div>
                {notifSoundEnabled && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => testSound(selectedTone)}
                    className="h-8 text-xs font-medium shrink-0"
                    data-testid="button-test-sound"
                  >
                    <Volume2 className="h-3.5 w-3.5 mr-1.5" />
                    Preview
                  </Button>
                )}
              </div>

              {notifSoundEnabled && (
                <div data-testid="tone-picker-section">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Select Tone</h4>
                    <span className="text-[10px] text-muted-foreground">Tap to preview & select</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-1.5">
                    {NOTIFICATION_TONES.map((tone) => {
                      const isActive = selectedTone === tone.id;
                      return (
                        <button
                          key={tone.id}
                          onClick={() => {
                            setSelectedTone(tone.id);
                            testSound(tone.id);
                          }}
                          className={`group relative flex flex-col items-center gap-1 px-1.5 py-2 rounded-lg border text-center transition-all duration-200 ${
                            isActive
                              ? "border-primary bg-primary/5 dark:bg-primary/10 shadow-sm"
                              : "border-transparent bg-muted/30 hover:bg-muted/60 hover:border-border"
                          }`}
                          data-testid={`tone-${tone.id}`}
                        >
                          <div className={`relative h-7 w-7 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 ${
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "bg-background border border-border text-muted-foreground group-hover:text-foreground group-hover:border-primary/30"
                          }`}>
                            {isActive ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Music className="h-3.5 w-3.5" />
                            )}
                          </div>
                          <span className={`text-[11px] leading-tight font-medium truncate w-full ${
                            isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                          }`}>
                            {tone.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

        {isAdminOrSuper && (
          <Card className="border shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <SectionHeader icon={FileText} title="PDF Branding" description="Customize the logo and company info on generated PDF reports" />
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="relative shrink-0">
                    {pdfBranding?.pdfLogoUrl ? (
                      <img
                        src={pdfBranding.pdfLogoUrl}
                        alt="Company Logo"
                        className="h-20 w-20 rounded-lg border object-contain bg-white"
                        data-testid="img-pdf-logo"
                      />
                    ) : (
                      <div className="h-20 w-20 rounded-lg border border-dashed flex items-center justify-center bg-muted/30" data-testid="placeholder-pdf-logo">
                        <Building2 className="h-8 w-8 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Company Logo</p>
                    <p className="text-xs text-muted-foreground">Appears in PDF header. PNG or JPG, max 5MB.</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 cursor-pointer">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-medium"
                          disabled={logoUploading}
                          asChild
                          data-testid="button-upload-logo"
                        >
                          <span>
                            {logoUploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                            {logoUploading ? "Uploading..." : pdfBranding?.pdfLogoUrl ? "Update Logo" : "Upload Logo"}
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleLogoUpload}
                          disabled={logoUploading}
                          data-testid="input-logo-file"
                        />
                      </label>
                      {pdfBranding?.pdfLogoUrl && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs font-medium text-destructive hover:text-destructive"
                          onClick={handleLogoRemove}
                          data-testid="button-remove-logo"
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-3 space-y-3 bg-muted/10">
                  <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                      {pdfBranding?.pdfTemplateUrl ? (
                        <img
                          src={pdfBranding.pdfTemplateUrl}
                          alt="PDF Template"
                          className="h-20 w-16 rounded-lg border object-cover bg-white"
                          data-testid="img-pdf-template"
                        />
                      ) : (
                        <div className="h-20 w-16 rounded-lg border border-dashed flex items-center justify-center bg-muted/30" data-testid="placeholder-pdf-template">
                          <FileText className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <p className="text-sm font-medium text-foreground">Branded PDF Template</p>
                      <p className="text-xs text-muted-foreground">
                        {pdfBranding?.pdfTemplateUrl
                          ? "Your custom template is active. It will be used as the background for all generated PDFs."
                          : "Upload a branded PDF or image to use as the background for all reports. If not set, the default layout with your logo will be used."}
                      </p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <label className="inline-flex items-center gap-1.5 cursor-pointer">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs font-medium"
                            disabled={templateUploading}
                            asChild
                            data-testid="button-upload-template"
                          >
                            <span>
                              {templateUploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                              {templateUploading ? "Uploading..." : pdfBranding?.pdfTemplateUrl ? "Replace Template" : "Upload Template"}
                            </span>
                          </Button>
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="hidden"
                            onChange={handleTemplateUpload}
                            disabled={templateUploading}
                            data-testid="input-template-file"
                          />
                        </label>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs font-medium"
                          asChild
                          data-testid="button-download-blank-template"
                        >
                          <a href="/api/auth/pdf-branding/template/blank" download>
                            <Download className="h-3 w-3 mr-1" />
                            Download Blank Template
                          </a>
                        </Button>
                        {pdfBranding?.pdfTemplateUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-xs font-medium text-destructive hover:text-destructive"
                            onClick={handleTemplateRemove}
                            data-testid="button-remove-template"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Company Name</label>
                    <Input
                      value={brandingForm.companyName}
                      onChange={e => setBrandingForm(p => ({ ...p, companyName: e.target.value }))}
                      placeholder="e.g. FASTSIGNS of Waltham"
                      className="h-9 text-sm"
                      data-testid="input-pdf-company-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Company Email</label>
                    <Input
                      value={brandingForm.companyEmail}
                      onChange={e => setBrandingForm(p => ({ ...p, companyEmail: e.target.value }))}
                      placeholder="e.g. info@yourcompany.com"
                      className="h-9 text-sm"
                      data-testid="input-pdf-company-email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Company Address</label>
                    <Input
                      value={brandingForm.companyAddress}
                      onChange={e => setBrandingForm(p => ({ ...p, companyAddress: e.target.value }))}
                      placeholder="e.g. 922 Main Street, Waltham, MA 02451"
                      className="h-9 text-sm"
                      data-testid="input-pdf-company-address"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Company Phone</label>
                    <Input
                      value={brandingForm.companyPhone}
                      onChange={e => setBrandingForm(p => ({ ...p, companyPhone: e.target.value }))}
                      placeholder="e.g. (781) 894-4000"
                      className="h-9 text-sm"
                      data-testid="input-pdf-company-phone"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleBrandingSave}
                    disabled={brandingSaving}
                    size="sm"
                    className="h-8 text-xs font-medium"
                    data-testid="button-save-branding"
                  >
                    {brandingSaving && <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />}
                    Save Branding
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}


        {user?.role === "user" && selfDeleteSetting?.enabled && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 sm:p-5">
              <SectionHeader
                icon={AlertTriangle}
                title="Danger Zone"
                description="Permanently delete your account and all associated data"
              />
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl bg-background border border-destructive/30">
                <div className="flex items-start gap-2.5">
                  <div className="h-9 w-9 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center justify-center shrink-0">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Delete my account</p>
                    <p className="text-xs text-muted-foreground">
                      This action is permanent and cannot be undone. Your profile, login, and personal data will be removed.
                    </p>
                  </div>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs font-medium shrink-0"
                  onClick={() => {
                    setDeleteAccountPassword("");
                    setDeleteAccountConfirmText("");
                    setShowDeletePassword(false);
                    setShowDeleteAccount(true);
                  }}
                  data-testid="button-open-delete-account"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Account
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      <Dialog open={showDeleteAccount} onOpenChange={(open) => {
        if (isDeletingAccount) return;
        setShowDeleteAccount(open);
        if (!open) {
          setDeleteAccountPassword("");
          setDeleteAccountConfirmText("");
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Delete your account?
            </DialogTitle>
            <DialogDescription>
              This will permanently delete your account and remove your access. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 text-xs text-foreground space-y-1">
              <p className="font-medium text-destructive">What will happen:</p>
              <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                <li>Your login and profile will be deleted</li>
                <li>You will be signed out immediately</li>
                <li>Any work history (projects, jobs, surveys) will be kept but unassigned</li>
              </ul>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Confirm with your password</label>
              <div className="relative flex items-center">
                <Input
                  type={showDeletePassword ? "text" : "password"}
                  value={deleteAccountPassword}
                  onChange={(e) => setDeleteAccountPassword(e.target.value)}
                  placeholder="Enter your current password"
                  className="pr-10 h-9 text-sm"
                  autoComplete="current-password"
                  data-testid="input-delete-account-password"
                />
                <button
                  type="button"
                  onClick={() => setShowDeletePassword((s) => !s)}
                  className="absolute right-2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  data-testid="button-toggle-delete-password"
                >
                  {showDeletePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">
                Type <span className="font-mono text-destructive">DELETE</span> to confirm
              </label>
              <Input
                value={deleteAccountConfirmText}
                onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
                placeholder="DELETE"
                className="h-9 text-sm font-mono"
                autoComplete="off"
                data-testid="input-delete-account-confirm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDeleteAccount(false)}
              disabled={isDeletingAccount}
              data-testid="button-cancel-delete-account"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={
                isDeletingAccount ||
                deleteAccountPassword.length === 0 ||
                deleteAccountConfirmText !== "DELETE"
              }
              onClick={async () => {
                setIsDeletingAccount(true);
                try {
                  await apiRequest("POST", "/api/auth/delete-account", {
                    password: deleteAccountPassword,
                  });
                  toast({
                    title: "Account deleted",
                    description: "Your account has been permanently removed.",
                  });
                  queryClient.clear();
                  await logout();
                } catch (error) {
                  toast({
                    title: "Failed to delete account",
                    description: error instanceof Error ? error.message : "Please try again.",
                    variant: "destructive",
                  });
                  setIsDeletingAccount(false);
                }
              }}
              data-testid="button-confirm-delete-account"
            >
              {isDeletingAccount && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
              Permanently Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={showFaceDisableConfirm}
        onOpenChange={setShowFaceDisableConfirm}
        onConfirm={async () => {
          setShowFaceDisableConfirm(false);
          try {
            await apiRequest("POST", "/api/auth/face-disable");
            queryClient.invalidateQueries({ queryKey: ["/api/auth/face-status"] });
            toast({
              title: "Face login disabled",
              description: "You can re-enable it anytime.",
            });
          } catch {
            toast({
              title: "Error",
              description: "Failed to disable face login.",
              variant: "destructive",
            });
          }
        }}
        title="Disable Face Login?"
        description="Are you sure you want to disable face login? You can re-enable it anytime by registering your face again."
        confirmLabel="Disable"
        variant="destructive"
      />
    </div>
  );
}
