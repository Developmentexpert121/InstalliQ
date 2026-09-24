import { useEffect, useState, lazy, Suspense } from "react";
import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  SidebarProvider,
  SidebarTrigger,
  SidebarInset,
} from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthProvider, useAuth } from "@/lib/auth";
import { PageHeaderProvider, usePageHeader } from "@/lib/page-header";
import { AppSidebar } from "@/components/app-sidebar";
import { FeedbackWidget } from "@/components/feedback-widget";
import { SignSuiteIqAppSwitcher } from "@/components/signsuiteiq-app-switcher";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import NotFound from "@/pages/not-found";
import PaymentModal from "@/pages/payment";
const LoginPage = lazy(() => import("@/pages/login"));
const ForgotPasswordPage = lazy(() => import("@/pages/forgot-password"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));

const OnboardingPage = lazy(() => import("@/pages/onboarding"));
const DashboardPage = lazy(() => import("@/pages/dashboard"));
const ProjectNewPage = lazy(() => import("@/pages/project-new"));
const ProjectDetailPage = lazy(() => import("@/pages/project-detail"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const GoogleCalendarPage = lazy(() => import("@/pages/google-calendar"));
const AdminPage = lazy(() => import("@/pages/admin"));
const QuestionnaireManagementPage = lazy(() => import("@/pages/questionnaire-management"));
const AccountSettingsPage = lazy(() => import("@/pages/account-settings"));
const ConfirmBookingPage = lazy(() => import("@/pages/confirm-booking"));
const RescheduleBookingPage = lazy(() => import("@/pages/reschedule-booking"));
const NotificationsPage = lazy(() => import("@/pages/reschedule-requests"));
const ArchivePage = lazy(() => import("@/pages/archive"));
const AssistantSettingsPage = lazy(() => import("@/pages/assistant-settings"));
const EmailTemplatesPage = lazy(() => import("@/pages/email-templates"));
const JobNotificationsPage = lazy(() => import("@/pages/job-notifications"));
const ActivityLogsPage = lazy(() => import("@/pages/activity-logs"));
const SubscriptionPlansPage = lazy(() => import("@/pages/subscription-plans"));
const DeveloperGuidePage = lazy(() => import("@/pages/developer-guide"));
const UserManualPage = lazy(() => import("@/pages/user-manual"));
const OwnerAdminManualPage = lazy(() => import("@/pages/owner-admin-manual"));
const SuperAdminManualPage = lazy(() => import("@/pages/super-admin-manual"));
const TimeEstimatorPage = lazy(() => import("@/pages/time-estimator"));
const SurveyPage = lazy(() => import("@/pages/survey"));
const AssetManagerPage = lazy(() => import("@/pages/asset-manager/index"));
const FeedbackInboxPage = lazy(() => import("@/pages/feedback-inbox"));
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  KeyRound,
  Mail,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

function ProtectedRoute({
  children,
  skipOnboardingCheck,
  allowedRoles,
}: {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
  allowedRoles?: string[];
}) {
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const paymentRequired =
    !isLoading &&
    !!user &&
    user.role === "admin" &&
    user.paymentRequired &&
    !user.paymentCompleted;
  const onSubscriptionPage = location === "/subscription-plans";

  const { data: gateStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/subscription-gate"],
    enabled: !isLoading && !!user && user.role === "admin",
  });

  const { data: mySubscription } = useQuery<{ status: string } | null>({
    queryKey: ["/api/subscription/my-subscription"],
    enabled: !isLoading && !!user && user.role === "admin",
  });

  const hasActiveSubscription =
    mySubscription?.status === "active" || mySubscription?.status === "blocked";

  const subscriptionGateBlocked =
    !isLoading &&
    !!user &&
    user.role === "admin" &&
    gateStatus?.enabled === true &&
    !hasActiveSubscription;

  useEffect(() => {
    if (!isLoading && !user) {
      setLocation("/");
    } else if (
      !isLoading &&
      user &&
      !skipOnboardingCheck &&
      !user.onboardingCompleted &&
      user.role === "admin"
    ) {
      setLocation("/onboarding");
    }
  }, [isLoading, user, setLocation, skipOnboardingCheck]);

  useEffect(() => {
    if (paymentRequired && !onSubscriptionPage) {
      const timer = setTimeout(() => {
        if (location !== "/subscription-plans") {
          toast({
            title: "Payment required",
            description: "Please complete your payment to access all features.",
            variant: "destructive",
          });
          setLocation("/subscription-plans");
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [paymentRequired, onSubscriptionPage, location, setLocation]);

  useEffect(() => {
    if (subscriptionGateBlocked && !onSubscriptionPage) {
      const timer = setTimeout(() => {
        if (location !== "/subscription-plans") {
          toast({
            title: "Subscription required",
            description:
              "Please select a plan and complete payment to access all features.",
            variant: "destructive",
          });
          setLocation("/subscription-plans");
        }
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [subscriptionGateBlocked, onSubscriptionPage, location, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return null;
  }

  if (
    !skipOnboardingCheck &&
    !user.onboardingCompleted &&
    user.role === "admin"
  ) {
    return null;
  }

  if (paymentRequired) {
    if (onSubscriptionPage) {
      return <>{children}</>;
    }
    return (
      <>
        {children}
        <PaymentModal />
      </>
    );
  }

  if (subscriptionGateBlocked) {
    if (onSubscriptionPage) {
      return <>{children}</>;
    }
    return (
      <>
        {children}
        <PaymentModal />
      </>
    );
  }

  return <>{children}</>;
}

function AuthLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">{children}</div>;
}

const PAGE_LOG_CATEGORY: Array<{ match: (path: string) => boolean; category: string; label: string }> = [
  { match: (p) => p === "/" || p.startsWith("/dashboard"), category: "Projects", label: "Project logs" },
  { match: (p) => p.startsWith("/google-calendar"), category: "Bookings", label: "Booking logs" },
  { match: (p) => p.startsWith("/surveys"), category: "Surveys", label: "Survey logs" },
  { match: (p) => p.startsWith("/projects/new"), category: "Storage", label: "Photo upload logs" },
  { match: (p) => p.startsWith("/projects/"), category: "Projects", label: "Project logs" },
  { match: (p) => p.startsWith("/admin"), category: "User Management", label: "User management logs" },
  { match: (p) => p.startsWith("/email-templates"), category: "Email", label: "Email logs" },
  { match: (p) => p.startsWith("/settings"), category: "Settings", label: "Settings logs" },
  { match: (p) => p.startsWith("/install-time-estimator"), category: "AI", label: "AI logs" },
  { match: (p) => p.startsWith("/reschedule-requests"), category: "Bookings", label: "Booking logs" },
  { match: (p) => p.startsWith("/questionnaire"), category: "Settings", label: "Questionnaire logs" },
];

function AppHeader() {
  const { headerInfo } = usePageHeader();
  const [currentPath] = useLocation();
  const pageLog = PAGE_LOG_CATEGORY.find((entry) => entry.match(currentPath));
  const onActivityLogPage = currentPath.startsWith("/activity-logs");
  const logsHref = onActivityLogPage
    ? "/activity-logs"
    : pageLog
      ? `/activity-logs?category=${encodeURIComponent(pageLog.category)}`
      : "/activity-logs";
  const logsLabel = onActivityLogPage
    ? "All logs"
    : pageLog
      ? pageLog.label
      : "Logs";

  return (
    <header className="flex items-center justify-between gap-2 sm:gap-4 p-3 sm:p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <SidebarTrigger
          data-testid="button-sidebar-toggle"
          className="flex-shrink-0"
        />
        {headerInfo && (
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            {headerInfo.icon && (
              <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                {headerInfo.icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h1
                className="text-base sm:text-lg font-semibold truncate hidden sm:block"
                data-testid="text-page-title"
              >
                {headerInfo.title}
              </h1>
              {headerInfo.description && (
                <p className="text-xs sm:text-sm text-muted-foreground truncate hidden sm:block">
                  {headerInfo.description}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {headerInfo?.actions}
        <Link href={logsHref}>
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2 sm:px-3"
            data-testid="button-header-logs"
            title={`View ${logsLabel.toLowerCase()}`}
          >
            <ScrollText className="h-4 w-4" />
            <span className="hidden sm:inline text-sm" data-testid="text-header-logs-label">
              {logsLabel}
            </span>
          </Button>
        </Link>
        <div
          id="signsuiteiq-app-switcher-host"
          className="flex items-center"
          data-testid="signsuiteiq-app-switcher-host"
        />
        <ThemeToggle />
      </div>
    </header>
  );
}

//
// test data
function TempPasswordDialog() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (user && user.tempPassword) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [user]);

  if (!user || !user.tempPassword) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md" data-testid="dialog-temp-password">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg">Change Your Password</DialogTitle>
          </div>
          <DialogDescription className="text-sm">
            You are currently using a temporary password. For your security,
            please create a new password.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            data-testid="button-dismiss-temp-password"
          >
            Remind Me Later
          </Button>
          <Button
            onClick={() => {
              setOpen(false);
              setLocation("/account");
            }}
            data-testid="button-change-password-redirect"
          >
            Change Password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SenderSetupDialog() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    nickname: "",
    fromEmail: "",
    replyTo: "",
    companyAddress: "",
    city: "",
    country: "",
  });

  const [justVerified, setJustVerified] = useState(false);
  const [skipped, setSkipped] = useState(false);

  const isAdmin = user?.role === "admin";
  const needsVerification =
    isAdmin && !!user?.senderFromEmail && !user?.senderVerified;
  const isOpen = false;

  useEffect(() => {
    if (isAdmin && user) {
      setForm({
        firstName: user.senderFirstName || "",
        nickname: user.senderNickname || "",
        fromEmail: user.senderFromEmail || "",
        replyTo: user.senderReplyTo || "",
        companyAddress: user.senderCompanyAddress || "",
        city: user.senderCity || "",
        country: user.senderCountry || "",
      });
    }
  }, [isAdmin, user?.id, user?.senderFromEmail]);

  useEffect(() => {
    if (needsVerification) {
      setCheckingStatus(true);
      fetch("/api/sender/status", { credentials: "include" })
        .then((res) => res.json())
        .then((data) => {
          if (data.verified) {
            setJustVerified(true);
            refreshUser();
            setTimeout(() => setJustVerified(false), 3000);
          }
        })
        .catch(() => {})
        .finally(() => setCheckingStatus(false));
    }
  }, [needsVerification]);

  const handleSubmit = async () => {
    if (
      !form.firstName.trim() ||
      !form.fromEmail.trim() ||
      !form.replyTo.trim() ||
      !form.companyAddress.trim() ||
      !form.city.trim() ||
      !form.country.trim() ||
      !form.nickname.trim()
    ) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/sender/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        await refreshUser();
        qc.invalidateQueries({ queryKey: ["/api/auth/me"] });
        if (data.verified) {
          setJustVerified(true);
          setTimeout(() => setJustVerified(false), 3000);
        } else {
          toast({
            title: "Verification Email Sent",
            description:
              "Please check your inbox and click the verification link.",
          });
        }
      } else {
        toast({
          title: "Setup Failed",
          description: data.error || "Failed to set up sender.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to set up sender verification.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sender/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: "Verification Email Resent",
          description: "Please check your inbox.",
        });
      } else {
        toast({
          title: "Failed",
          description: data.error || "Could not resend.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Failed to resend verification email.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCheckStatus = async () => {
    setCheckingStatus(true);
    try {
      const res = await fetch("/api/sender/status", { credentials: "include" });
      const data = await res.json();
      if (data.verified) {
        setJustVerified(true);
        await refreshUser();
        setTimeout(() => setJustVerified(false), 3000);
      } else {
        toast({
          title: "Still Pending",
          description: "Your sender email has not been verified yet.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error",
        description: "Could not check verification status.",
        variant: "destructive",
      });
    } finally {
      setCheckingStatus(false);
    }
  };

  if (!isOpen) return null;

  if (justVerified) {
    return (
      <Dialog open={true} onOpenChange={() => {}}>
        <DialogContent
          hideCloseButton
          className="max-w-md"
          data-testid="dialog-sender-verified-success"
        >
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <h2
              className="text-xl font-semibold text-center"
              data-testid="text-verification-done"
            >
              Verification Done
            </h2>
            <p className="text-sm text-muted-foreground text-center">
              Your sender email{" "}
              <span className="font-medium text-foreground">
                {user?.senderFromEmail}
              </span>{" "}
              has been verified successfully. Your dashboard is now unlocked.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent
        hideCloseButton
        className="max-w-lg max-h-[90vh] flex flex-col"
        data-testid="dialog-sender-setup-mandatory"
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg">
              {needsVerification
                ? "Sender Verification Pending"
                : "Set Up Sender Email"}
            </DialogTitle>
          </div>
          <DialogDescription>
            {needsVerification
              ? "Your sender email is pending verification. Please verify it to access all features, or update your email below. You can also skip this and complete it later from Account Settings."
              : "Configure your sender email for notifications. You can skip this and set it up later from Account Settings."}
          </DialogDescription>
        </DialogHeader>

        {needsVerification && (
          <div className="flex items-center justify-between gap-2 p-3 rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Verification Pending
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  {user?.senderFromEmail}
                </p>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckStatus}
                disabled={checkingStatus}
                data-testid="button-check-verification"
              >
                {checkingStatus ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                <span className="ml-1">Check</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleResend}
                disabled={loading}
                data-testid="button-resend-verification"
              >
                Resend
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4 py-2 overflow-y-auto flex-1 px-1 -mx-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                First Name <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.firstName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, firstName: e.target.value }))
                }
                placeholder="Your name"
                data-testid="input-sender-firstname"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Nickname <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.nickname}
                onChange={(e) =>
                  setForm((f) => ({ ...f, nickname: e.target.value }))
                }
                placeholder="Sender nickname"
                data-testid="input-sender-nickname"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                From Email <span className="text-red-500">*</span>
              </Label>
              <Input
                type="email"
                value={form.fromEmail}
                onChange={(e) =>
                  setForm((f) => ({ ...f, fromEmail: e.target.value }))
                }
                placeholder="sender@example.com"
                data-testid="input-sender-from-email"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Reply-To Email <span className="text-red-500">*</span>
              </Label>
              <Input
                type="email"
                value={form.replyTo}
                onChange={(e) =>
                  setForm((f) => ({ ...f, replyTo: e.target.value }))
                }
                placeholder="reply@example.com"
                data-testid="input-sender-reply-to"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>
              Company Address <span className="text-red-500">*</span>
            </Label>
            <Input
              value={form.companyAddress}
              onChange={(e) =>
                setForm((f) => ({ ...f, companyAddress: e.target.value }))
              }
              placeholder="123 Main St"
              data-testid="input-sender-address"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>
                City <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.city}
                onChange={(e) =>
                  setForm((f) => ({ ...f, city: e.target.value }))
                }
                placeholder="City"
                data-testid="input-sender-city"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Country <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.country}
                onChange={(e) =>
                  setForm((f) => ({ ...f, country: e.target.value }))
                }
                placeholder="Country"
                data-testid="input-sender-country"
              />
            </div>
          </div>
          {needsVerification && (
            <p className="text-xs text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Changing the email address will require re-verification.
            </p>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 flex gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setSkipped(true)}
            data-testid="button-sender-skip"
          >
            Skip for Now
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loading}
            data-testid="button-sender-setup-submit"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {needsVerification ? "Update & Verify" : "Submit & Verify"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <SidebarInset className="flex flex-col flex-1 overflow-hidden">
          <AppHeader />
          <div className="flex-1 flex flex-col overflow-y-auto">{children}</div>
        </SidebarInset>
      </div>
      <TempPasswordDialog />
      <SenderSetupDialog />
      <FeedbackWidget />
      <SignSuiteIqAppSwitcher />
    </SidebarProvider>
  );
}

const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="h-8 w-8 animate-spin text-primary" />
  </div>
);

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/" component={LoginPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/forgot-password" component={ForgotPasswordPage} />
      <Route path="/reset-password" component={ResetPasswordPage} />
      <Route path="/confirm-booking/:token" component={ConfirmBookingPage} />
      <Route
        path="/reschedule-booking/:token"
        component={RescheduleBookingPage}
      />
      <Route path="/onboarding">
        <ProtectedRoute skipOnboardingCheck>
          <OnboardingPage />
        </ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute>
          <AppLayout>
            <AdminPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/feedback">
        <ProtectedRoute allowedRoles={["super_admin"]}>
          <AppLayout>
            <FeedbackInboxPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/questionnaire/:ownerId">
        <ProtectedRoute>
          <AppLayout>
            <QuestionnaireManagementPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/admin/questionnaire">
        <ProtectedRoute>
          <AppLayout>
            <QuestionnaireManagementPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute>
          <AppLayout>
            <DashboardPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/projects/new">
        <ProtectedRoute>
          <AppLayout>
            <ProjectNewPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/projects/:id">
        <ProtectedRoute>
          <AppLayout>
            <ProjectDetailPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/calendar">
        <ProtectedRoute>
          <AppLayout>
            <GoogleCalendarPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/google-calendar">
        <ProtectedRoute>
          <AppLayout>
            <GoogleCalendarPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/time-estimator">
        <ProtectedRoute>
          <AppLayout>
            <TimeEstimatorPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/surveys">
        <ProtectedRoute>
          <AppLayout>
            <SurveyPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/surveys/new">
        <ProtectedRoute>
          <AppLayout>
            <SurveyPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/surveys/:id">
        <ProtectedRoute>
          <AppLayout>
            <SurveyPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/surveys/:id/edit">
        <ProtectedRoute>
          <AppLayout>
            <SurveyPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/assets">
        <ProtectedRoute>
          <AppLayout>
            <AssetManagerPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/my-jobs">
        <ProtectedRoute>
          <AppLayout>
            <JobNotificationsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/notifications">
        <ProtectedRoute>
          <AppLayout>
            <NotificationsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/archive">
        <ProtectedRoute>
          <AppLayout>
            <ArchivePage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/assistant-settings">
        <ProtectedRoute>
          <AppLayout>
            <AssistantSettingsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/assistant-settings/:adminId">
        {(params) => (
          <ProtectedRoute>
            <AppLayout>
              <AssistantSettingsPage adminId={params.adminId} />
            </AppLayout>
          </ProtectedRoute>
        )}
      </Route>
      <Route path="/email-templates">
        <ProtectedRoute>
          <EmailTemplatesPage />
        </ProtectedRoute>
      </Route>
      <Route path="/account">
        <ProtectedRoute>
          <AppLayout>
            <AccountSettingsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/activity-logs">
        <ProtectedRoute>
          <AppLayout>
            <ActivityLogsPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/subscription-plans">
        <ProtectedRoute>
          <AppLayout>
            <SubscriptionPlansPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/docs/developer-guide">
        <ProtectedRoute allowedRoles={["super_admin"]}>
          <AppLayout>
            <DeveloperGuidePage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/docs/user-manual">
        <ProtectedRoute>
          <AppLayout>
            <UserManualPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/docs/owner-admin-manual">
        <ProtectedRoute allowedRoles={["admin", "super_admin"]}>
          <AppLayout>
            <OwnerAdminManualPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route path="/docs/super-admin-manual">
        <ProtectedRoute allowedRoles={["super_admin"]}>
          <AppLayout>
            <SuperAdminManualPage />
          </AppLayout>
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <AuthProvider>
            <PageHeaderProvider>
              <Toaster />
              <Router />
            </PageHeaderProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

// test ss
