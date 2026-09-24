import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ChevronRight, ChevronLeft, Check, Building2, Users, Wrench, Package, Clock, LogOut, User, Mail, Phone, MapPin, Briefcase, HelpCircle, ClipboardList, Upload, FileText, X, Info, ChevronDown, SkipForward, AlertTriangle, FastForward } from "lucide-react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
const installiqLogo = "/installiq-logo.png";

interface OnboardingQuestion {
  id: number;
  stepName: string;
  stepTitle: string;
  stepIcon: string;
  stepDescription: string | null;
  questionLabel: string;
  questionKey: string;
  questionType: string;
  options: string | null;
  placeholder: string | null;
  required: boolean | null;
  sortOrder: number;
  stepOrder: number;
  isActive: boolean | null;
}

interface DynamicStep {
  stepName: string;
  title: string;
  fullTitle: string;
  icon: any;
  description: string;
  stepOrder: number;
  questions: OnboardingQuestion[];
}

const ICON_MAP: Record<string, any> = {
  Building2, Users, Wrench, Package, Clock, HelpCircle, Briefcase, ClipboardList
};

interface BusinessDetailsData {
  businessName: string;
  businessAddress: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  contactNumber: string;
  businessEmail: string;
  website: string;
  taxId: string;
  businessType: string;
  yearEstablished: string;
  numberOfEmployees: string;
  additionalNotes: string;
  senderFirstName: string;
  senderFromEmail: string;
  senderReplyTo: string;
  senderCompanyAddress: string;
  senderCity: string;
  senderCountry: string;
  senderNickname: string;
}

const defaultBusinessDetails: BusinessDetailsData = {
  businessName: "",
  businessAddress: "",
  businessCity: "",
  businessState: "",
  businessZip: "",
  contactNumber: "",
  businessEmail: "",
  website: "",
  taxId: "",
  businessType: "",
  yearEstablished: "",
  numberOfEmployees: "",
  additionalNotes: "",
  senderFirstName: "",
  senderFromEmail: "",
  senderReplyTo: "",
  senderCompanyAddress: "",
  senderCity: "",
  senderCountry: "",
  senderNickname: "",
};

function QuestionCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border bg-muted/30 p-4 space-y-3 ${className || ""}`}>
      {children}
    </div>
  );
}

export default function OnboardingPage() {
  const { user, setUser, logout } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const isAdminUser = user?.role === "admin" || user?.role === "super_admin";
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState<Record<string, string | string[]>>({});
  const [fileUploads, setFileUploads] = useState<Record<string, UploadedFile[]>>({});
  const [businessDetails, setBusinessDetails] = useState<BusinessDetailsData>(defaultBusinessDetails);
  const [submitting, setSubmitting] = useState(false);

  const { data: dbQuestions = [], isLoading: questionsLoading } = useQuery<OnboardingQuestion[]>({
    queryKey: ["/api/onboarding-questions"],
  });

  const dynamicSteps = useMemo(() => {
    const groups: Record<string, DynamicStep> = {};
    dbQuestions.forEach(q => {
      if (!groups[q.stepName]) {
        const IconComp = ICON_MAP[q.stepIcon] || HelpCircle;
        groups[q.stepName] = {
          stepName: q.stepName,
          title: q.stepTitle.length > 12 ? q.stepTitle.split(" ").slice(0, 2).join(" ") : q.stepTitle,
          fullTitle: q.stepTitle,
          icon: IconComp,
          description: q.stepDescription || "",
          stepOrder: q.stepOrder,
          questions: [],
        };
      }
      groups[q.stepName].questions.push(q);
    });
    return Object.values(groups).sort((a, b) => a.stepOrder - b.stepOrder);
  }, [dbQuestions]);

  const BUSINESS_DETAILS_STEP = { title: "Business Details", fullTitle: "Business Details", icon: Briefcase, description: "Enter your company information and contact details" };
  const EMAIL_TEMPLATES_STEP = { title: "Email Setup", fullTitle: "Email Templates & Signature", icon: Mail, description: "Customize the emails sent to your customers and team" };

  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [emailSignature, setEmailSignature] = useState({ companyName: "", address: "", phone: "", email: "", website: "" });
  const [emailTemplates, setEmailTemplates] = useState<Record<string, { subject: string; bodyHtml: string }>>({});
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);

  const EMAIL_TEMPLATE_DEFAULTS: Record<string, { label: string; description: string; subject: string; bodyHtml: string }> = {
    schedule_confirmation: {
      label: "Schedule Confirmation",
      description: "Sent to customers when installation is scheduled",
      subject: "Installation Scheduled",
      bodyHtml: `<p>Dear {{customerName}},</p><p>Your signage installation has been scheduled.</p><ul><li><strong>Date:</strong> {{date}}</li><li><strong>Time:</strong> {{time}}</li><li><strong>Location:</strong> {{address}}</li></ul><p>Our professional installation team will arrive at the scheduled time. Please ensure access to the installation area is available.</p>`,
    },
    reschedule_notification: {
      label: "Reschedule Notification",
      description: "Sent to customers when installation is rescheduled",
      subject: "Installation Rescheduled",
      bodyHtml: `<p>Dear {{customerName}},</p><p>Your signage installation has been rescheduled.</p><ul><li><strong>New Date:</strong> {{newDate}}</li><li><strong>New Time:</strong> {{newTime}}</li><li><strong>Location:</strong> {{address}}</li></ul><p>We apologize for any inconvenience.</p>`,
    },
    on_my_way: {
      label: "On My Way",
      description: "Sent to customers when the installer is en route",
      subject: "Installer On The Way!",
      bodyHtml: `<p>Hello {{customerName}},</p><p>Great news! Your installer <strong>{{installerName}}</strong> is now on their way for your scheduled installation.</p><p>Please ensure the installation area is accessible.</p>`,
    },
    booking_assignment: {
      label: "Booking Assignment",
      description: "Sent to team members when assigned to a job",
      subject: "Booking Assignment",
      bodyHtml: `<p>Hello {{userName}},</p><p>You have been assigned to a new installation booking.</p><ul><li><strong>Job:</strong> {{jobTitle}}</li><li><strong>Date:</strong> {{date}}</li><li><strong>Time:</strong> {{time}}</li><li><strong>Location:</strong> {{address}}</li></ul>`,
    },
    issue_reported: {
      label: "Issue Reported",
      description: "Sent when an issue is flagged on an installation",
      subject: "Installation Issue Reported",
      bodyHtml: `<p>An issue has been reported for the following installation:</p><ul><li><strong>Event:</strong> {{eventTitle}}</li><li><strong>Date:</strong> {{date}}</li><li><strong>Customer:</strong> {{customerName}}</li><li><strong>Address:</strong> {{address}}</li></ul>`,
    },
    welcome_email: {
      label: "Welcome Email",
      description: "Sent to new users when their account is created",
      subject: "Welcome to InstalliQ.ai",
      bodyHtml: `<p>Hello {{name}},</p><p>Your account has been created for the InstalliQ.ai project management system. Please log in and change your password.</p>`,
    },
    password_reset: {
      label: "Password Reset",
      description: "Sent when an admin resets a user's password",
      subject: "Password Reset",
      bodyHtml: `<p>Hello {{name}},</p><p>Your password has been reset by an administrator. Please use the new credentials to log in and change your password immediately.</p>`,
    },
  };

  const quillModulesOnboarding = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ["bold", "italic", "underline"],
      [{ list: "ordered" }, { list: "bullet" }],
      ["link"],
      ["clean"],
    ],
  };

  const allSteps = useMemo(() => {
    const bdStep = isAdminUser ? [BUSINESS_DETAILS_STEP] : [];
    const dynSteps = dynamicSteps.map(s => ({
      title: s.title,
      fullTitle: s.fullTitle,
      icon: s.icon,
      description: s.description,
    }));
    const emailStep = isAdminUser ? [EMAIL_TEMPLATES_STEP] : [];
    return [...bdStep, ...dynSteps, ...emailStep];
  }, [isAdminUser, dynamicSteps]);

  const bdOffset = isAdminUser ? 1 : 0;

  const capabilitiesStepIndex = useMemo(() => {
    const eqIndex = dynamicSteps.findIndex(s => s.stepName === "equipment");
    if (eqIndex >= 0) return eqIndex + bdOffset;
    const tsIndex = dynamicSteps.findIndex(s => s.stepName === "time_standards");
    if (tsIndex >= 0) return tsIndex + bdOffset;
    return -1;
  }, [dynamicSteps, bdOffset]);

  useEffect(() => {
    if (user?.onboardingCompleted) {
      setLocation("/calendar");
    }
  }, [user?.onboardingCompleted, setLocation]);

  if (user?.onboardingCompleted) {
    return null;
  }

  const isBeforeCapabilities = capabilitiesStepIndex >= 0 && step < capabilitiesStepIndex;

  const skipToCapabilities = () => {
    setShowSkipWarning(false);
    if (capabilitiesStepIndex >= 0) {
      setStep(capabilitiesStepIndex);
    }
  };

  const updateField = (key: string, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const updateBusinessField = (field: keyof BusinessDetailsData, value: string) => {
    setBusinessDetails(prev => ({ ...prev, [field]: value }));
  };

  const toggleCheckboxOption = (key: string, option: string) => {
    setFormData(prev => {
      const current = (prev[key] as string[]) || [];
      const updated = current.includes(option)
        ? current.filter(o => o !== option)
        : [...current, option];
      return { ...prev, [key]: updated };
    });
  };

  const handleFileUpload = (key: string, file: UploadedFile) => {
    setFileUploads(prev => ({
      ...prev,
      [key]: [...(prev[key] || []), file],
    }));
  };

  const handleFileRemove = (key: string, index: number) => {
    setFileUploads(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter((_, i) => i !== index),
    }));
  };

  const validateStep = (): boolean => {
    if (isAdminUser && step === 0) {
      if (!businessDetails.businessName.trim()) {
        toast({ title: "Required", description: "Please enter your business name.", variant: "destructive" });
        return false;
      }
    }
    if (step >= bdOffset && dynamicSteps[step - bdOffset]) {
      const currentStepQuestions = dynamicSteps[step - bdOffset].questions;
      for (const q of currentStepQuestions) {
        if (q.required) {
          if (q.questionType === "file") {
            const files = fileUploads[q.questionKey] || [];
            if (files.length === 0) {
              toast({ title: "Required", description: `Please upload a file for: ${q.questionLabel}`, variant: "destructive" });
              return false;
            }
          } else {
            const val = formData[q.questionKey];
            if (!val || (typeof val === "string" && !val.trim()) || (Array.isArray(val) && val.length === 0)) {
              toast({ title: "Required", description: `Please answer: ${q.questionLabel}`, variant: "destructive" });
              return false;
            }
          }
        }
      }
    }
    return true;
  };

  const nextStep = () => {
    if (validateStep()) {
      setStep(s => Math.min(s + 1, allSteps.length - 1));
    }
  };

  const skipStep = () => {
    setStep(s => Math.min(s + 1, allSteps.length - 1));
  };

  const prevStep = () => {
    setStep(s => Math.max(s - 1, 0));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const submitData: Record<string, any> = { ...formData };
      submitData.businessDetailsData = businessDetails;
      if (Object.keys(fileUploads).length > 0) {
        submitData.fileUploads = fileUploads;
      }

      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submitData),
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error("Failed to submit form");
      }

      const data = await res.json();
      if (data.user) {
        setUser(data.user);
      }

      if (isAdminUser && businessDetails.senderFromEmail.trim()) {
        try {
          const senderRes = await fetch("/api/sender/setup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName: businessDetails.senderFirstName || user?.name || "",
              fromEmail: businessDetails.senderFromEmail,
              replyTo: businessDetails.senderReplyTo || businessDetails.senderFromEmail,
              companyAddress: businessDetails.senderCompanyAddress || businessDetails.businessAddress || "N/A",
              city: businessDetails.senderCity || businessDetails.businessCity || "N/A",
              country: businessDetails.senderCountry || "US",
              nickname: businessDetails.senderNickname || businessDetails.businessName || "Default",
            }),
            credentials: "include",
          });
          const senderData = await senderRes.json();
          if (senderRes.ok) {
            if (senderData.user) setUser(senderData.user);
            if (senderData.verified) {
              toast({ title: "Sender Email Verified", description: "Your email is verified and ready to send notifications." });
            } else {
              toast({ title: "Verification Email Sent", description: "Please check your inbox and verify your sender email to start sending notifications." });
            }
          }
        } catch (senderError) {
          console.error("Sender setup error:", senderError);
          toast({ title: "Note", description: "Onboarding completed. Sender email verification can be set up later from settings.", variant: "destructive" });
        }
      }

      if (isAdminUser) {
        try {
          const hasSigData = emailSignature.companyName || emailSignature.address || emailSignature.phone || emailSignature.email;
          if (hasSigData) {
            await fetch("/api/email-signature", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(emailSignature),
              credentials: "include",
            });
          }
          for (const [type, template] of Object.entries(emailTemplates)) {
            await fetch(`/api/email-templates/${type}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subject: template.subject, bodyHtml: template.bodyHtml, enabled: true }),
              credentials: "include",
            });
          }
        } catch (emailErr) {
          console.error("Email templates save error:", emailErr);
        }
      }

      toast({ title: "Success", description: "Onboarding completed successfully!" });
      setLocation("/calendar");
    } catch (error) {
      toast({ title: "Error", description: "Failed to submit the form. Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (questionsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const progressPercent = allSteps.length > 0 ? ((step + 1) / allSteps.length) * 100 : 0;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-3xl mx-auto flex items-center justify-between px-4 py-3">
          <div className="flex items-center">
            <img src={installiqLogo} alt="InstalliQ.ai" className="h-14 object-contain rounded" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            data-testid="button-goto-login"
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="text-onboarding-title">
              Installer Capabilities & Time Standards
            </h1>
            <p className="text-muted-foreground mt-2 text-sm sm:text-base max-w-xl mx-auto">
              Help us understand your installation capabilities to improve scheduling accuracy.
            </p>
          </div>

          <Card className="mb-8" data-testid="card-user-info">
            <div className="bg-primary/5 border-b px-5 py-3 sm:px-6">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                Your Account Information
              </h3>
            </div>
            <CardContent className="p-5 sm:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3" data-testid="text-user-name">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Name</p>
                    <p className="text-sm font-medium">{user?.name || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3" data-testid="text-user-email">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <p className="text-sm font-medium">{user?.email || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3" data-testid="text-user-phone">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <p className="text-sm font-medium">{user?.phone || "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3" data-testid="text-user-location">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="text-sm font-medium">{user?.location || "—"}</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                This information will be saved with your onboarding form. Contact your Admin if any details are incorrect.
              </p>
            </CardContent>
          </Card>

          {isAdminUser && isBeforeCapabilities && (
            <Card className="mb-6 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20" data-testid="card-skip-to-capabilities">
              <CardContent className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <FastForward className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Want to skip ahead?</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Jump directly to Installer Capabilities & Time Standards. You can always fill in the other details later from Settings.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40 shrink-0"
                  onClick={() => setShowSkipWarning(true)}
                  data-testid="button-skip-to-capabilities"
                >
                  <FastForward className="h-3.5 w-3.5 mr-1.5" />
                  Skip to Capabilities
                </Button>
              </CardContent>
            </Card>
          )}

          <Dialog open={showSkipWarning} onOpenChange={setShowSkipWarning}>
            <DialogContent className="sm:max-w-md" data-testid="dialog-skip-warning">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Skip to Capabilities?
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="text-left pt-2 space-y-3 text-sm text-muted-foreground">
                    <span className="block">
                      You're about to skip the Business Details, Business Info, and Team setup steps.
                    </span>
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                      <span className="text-xs text-amber-800 dark:text-amber-300">
                        <strong>Important:</strong> If you skip these steps, your AI scheduling engine will not have the business and team data it needs for accurate time blocking. You can fill this in later from Settings.
                      </span>
                    </div>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="flex-col sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setShowSkipWarning(false)} data-testid="button-cancel-skip">
                  Go Back
                </Button>
                <Button onClick={skipToCapabilities} className="bg-amber-600 hover:bg-amber-700 text-white" data-testid="button-confirm-skip">
                  <FastForward className="h-4 w-4 mr-1.5" />
                  Skip to Capabilities
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {allSteps.length > 0 && (
            <>
              <div className="mb-8" data-testid="stepper-progress">
                <div className="flex items-center justify-between mb-3">
                  {allSteps.map((s, i) => {
                    const Icon = s.icon;
                    const isActive = i === step;
                    const isCompleted = i < step;
                    return (
                      <div key={i} className="flex flex-col items-center relative flex-1">
                        <button
                          onClick={() => i < step && setStep(i)}
                          disabled={i > step}
                          className={`relative z-10 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 transition-all duration-200 ${
                            isActive
                              ? "border-primary bg-primary text-primary-foreground scale-110"
                              : isCompleted
                              ? "border-primary bg-primary/10 text-primary cursor-pointer"
                              : "border-muted-foreground/30 bg-background text-muted-foreground/50"
                          }`}
                          data-testid={`button-step-${i}`}
                        >
                          {isCompleted ? (
                            <Check className="h-4 w-4 sm:h-5 sm:w-5" />
                          ) : (
                            <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                          )}
                        </button>
                        <span className={`mt-1.5 text-[10px] sm:text-xs font-medium text-center leading-tight ${
                          isActive ? "text-primary" : isCompleted ? "text-primary/70" : "text-muted-foreground/50"
                        }`}>
                          {s.title}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              <Card className="overflow-hidden" data-testid="card-onboarding-step">
                <div className="bg-primary/5 border-b px-5 py-4 sm:px-6">
                  <div className="flex items-center gap-3">
                    {(() => { const Icon = allSteps[step].icon; return (
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                    ); })()}
                    <div>
                      <h2 className="text-lg font-semibold">{allSteps[step].fullTitle}</h2>
                      <p className="text-sm text-muted-foreground">{allSteps[step].description}</p>
                    </div>
                  </div>
                </div>
                <CardContent className="p-5 sm:p-6 space-y-4">
                  {isAdminUser && step === 0 && (
                    <StepBusinessDetails businessDetails={businessDetails} updateBusinessField={updateBusinessField} />
                  )}
                  {step >= bdOffset && step < bdOffset + dynamicSteps.length && dynamicSteps[step - bdOffset] && (
                    <DynamicStepRenderer
                      questions={dynamicSteps[step - bdOffset].questions}
                      formData={formData}
                      updateField={updateField}
                      toggleCheckboxOption={toggleCheckboxOption}
                      fileUploads={fileUploads}
                      onFileUpload={handleFileUpload}
                      onFileRemove={handleFileRemove}
                    />
                  )}
                  {isAdminUser && step === allSteps.length - 1 && (
                    <div className="space-y-5" data-testid="section-email-templates-onboarding">
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                        <Info className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          Customize the emails your business sends to customers and team members. These are pre-filled with defaults — feel free to skip this step and customize later from Settings &gt; Email Templates.
                        </p>
                      </div>

                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-orange-600" />
                          Business Signature
                        </h3>
                        <p className="text-xs text-muted-foreground">This appears at the bottom of all emails sent from your account.</p>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Company Name</Label>
                            <Input
                              value={emailSignature.companyName}
                              onChange={(e) => setEmailSignature(s => ({ ...s, companyName: e.target.value }))}
                              placeholder="Your Business Name"
                              data-testid="input-onb-sig-company"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Phone</Label>
                            <Input
                              value={emailSignature.phone}
                              onChange={(e) => setEmailSignature(s => ({ ...s, phone: e.target.value }))}
                              placeholder="(555) 123-4567"
                              data-testid="input-onb-sig-phone"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Email</Label>
                            <Input
                              value={emailSignature.email}
                              onChange={(e) => setEmailSignature(s => ({ ...s, email: e.target.value }))}
                              placeholder="contact@yourbusiness.com"
                              data-testid="input-onb-sig-email"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Website</Label>
                            <Input
                              value={emailSignature.website}
                              onChange={(e) => setEmailSignature(s => ({ ...s, website: e.target.value }))}
                              placeholder="https://yourbusiness.com"
                              data-testid="input-onb-sig-website"
                            />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Address</Label>
                          <Input
                            value={emailSignature.address}
                            onChange={(e) => setEmailSignature(s => ({ ...s, address: e.target.value }))}
                            placeholder="123 Main Street, City, ST 12345"
                            data-testid="input-onb-sig-address"
                          />
                        </div>
                      </div>

                      <div className="space-y-3 pt-2">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <Mail className="h-4 w-4 text-orange-600" />
                          Email Messages
                        </h3>
                        <p className="text-xs text-muted-foreground">Click on any email type to customize its subject and message. Leave as-is to use the defaults.</p>
                        {Object.entries(EMAIL_TEMPLATE_DEFAULTS).map(([type, defaults]) => {
                          const isExpanded = expandedTemplate === type;
                          const custom = emailTemplates[type];
                          const currentSubject = custom?.subject || defaults.subject;
                          const currentBody = custom?.bodyHtml || defaults.bodyHtml;
                          const isCustomized = !!custom;

                          return (
                            <div key={type} className="border rounded-lg overflow-hidden" data-testid={`onb-template-${type}`}>
                              <div
                                className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors"
                                onClick={() => setExpandedTemplate(isExpanded ? null : type)}
                              >
                                <div className="flex items-center gap-2">
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                  <span className="text-sm font-medium">{defaults.label}</span>
                                  {isCustomized && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Customized</Badge>}
                                </div>
                                <span className="text-[11px] text-muted-foreground hidden sm:block">{defaults.description}</span>
                              </div>
                              {isExpanded && (
                                <div className="border-t px-3 py-3 space-y-3 bg-muted/10">
                                  <div className="space-y-1">
                                    <Label className="text-xs font-medium">Subject</Label>
                                    <Input
                                      value={currentSubject}
                                      onChange={(e) => setEmailTemplates(prev => ({
                                        ...prev,
                                        [type]: { subject: e.target.value, bodyHtml: currentBody },
                                      }))}
                                      data-testid={`input-onb-subject-${type}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs font-medium">Message Body</Label>
                                    <div className="border rounded-md overflow-hidden [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:bg-muted/30 [&_.ql-container]:border-0 [&_.ql-editor]:min-h-[120px] [&_.ql-editor]:text-sm">
                                      <ReactQuill
                                        value={currentBody}
                                        onChange={(val) => setEmailTemplates(prev => ({
                                          ...prev,
                                          [type]: { subject: currentSubject, bodyHtml: val },
                                        }))}
                                        modules={quillModulesOnboarding}
                                        theme="snow"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}

          <div className="flex items-center justify-between gap-3 mt-6 mb-8">
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={step === 0}
              data-testid="button-prev-step"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <span className="text-xs text-muted-foreground">
              Step {step + 1} of {allSteps.length}
            </span>
            {step < allSteps.length - 1 ? (
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={skipStep} data-testid="button-skip-step">
                  <SkipForward className="h-4 w-4 mr-1" />
                  Skip
                </Button>
                <Button onClick={nextStep} data-testid="button-next-step">
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            ) : (
              <Button onClick={handleSubmit} disabled={submitting} data-testid="button-submit-onboarding">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-1" />
                    Complete Setup
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface UploadedFile {
  url: string;
  originalName: string;
  size: number;
  mimeType: string;
}

function FileUploadField({
  questionKey,
  placeholder,
  value,
  onUpload,
  onRemove,
}: {
  questionKey: string;
  placeholder: string;
  value: UploadedFile[];
  onUpload: (file: UploadedFile) => void;
  onRemove: (index: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const maxSize = 25 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({ title: "File Too Large", description: `${file.name} exceeds the 25MB limit.`, variant: "destructive" });
        continue;
      }

      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/onboarding/upload", {
          method: "POST",
          body: formData,
          credentials: "include",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Upload failed");
        }
        const result = await res.json();
        onUpload(result);
        toast({ title: "File Uploaded", description: `${file.name} uploaded successfully.`, variant: "success" });
      } catch (err: any) {
        toast({ title: "Upload Failed", description: err.message || "Failed to upload file.", variant: "destructive" });
      } finally {
        setUploading(false);
      }
    }
    e.target.value = "";
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    return <FileText className="h-4 w-4 text-primary shrink-0" />;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <label
          htmlFor={`file-${questionKey}`}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-md border border-dashed cursor-pointer transition-colors hover:border-primary hover:bg-primary/5 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
          data-testid={`button-upload-${questionKey}`}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          <span className="text-sm">{uploading ? "Uploading..." : "Choose Files"}</span>
        </label>
        <input
          id={`file-${questionKey}`}
          type="file"
          className="hidden"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
          multiple
          onChange={handleFileChange}
          disabled={uploading}
          data-testid={`input-file-${questionKey}`}
        />
        <span className="text-xs text-muted-foreground">{placeholder || "PDF, DOC, DOCX, XLS, XLSX, CSV, TXT (max 25MB)"}</span>
      </div>

      {value.length > 0 && (
        <div className="space-y-2">
          {value.map((file, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-2.5 rounded-md border bg-muted/30"
              data-testid={`file-item-${questionKey}-${idx}`}
            >
              {getFileIcon(file.mimeType)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.originalName}</p>
                <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => onRemove(idx)}
                data-testid={`button-remove-file-${questionKey}-${idx}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DynamicStepRenderer({
  questions,
  formData,
  updateField,
  toggleCheckboxOption,
  fileUploads,
  onFileUpload,
  onFileRemove,
}: {
  questions: OnboardingQuestion[];
  formData: Record<string, string | string[]>;
  updateField: (key: string, value: string | string[]) => void;
  toggleCheckboxOption: (key: string, option: string) => void;
  fileUploads: Record<string, UploadedFile[]>;
  onFileUpload: (key: string, file: UploadedFile) => void;
  onFileRemove: (key: string, index: number) => void;
}) {
  return (
    <>
      {questions.sort((a, b) => a.sortOrder - b.sortOrder).map((q) => {
        const value = formData[q.questionKey];
        const stringValue = typeof value === "string" ? value : "";
        const arrayValue = Array.isArray(value) ? value : [];
        const optionsList = q.options ? q.options.split(",").map(o => o.trim()).filter(Boolean) : [];

        return (
          <QuestionCard key={q.id}>
            <Label htmlFor={`q-${q.id}`} className="text-sm font-medium">
              {q.questionLabel}
              {q.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {q.questionType === "text" && (
              <Input
                id={`q-${q.id}`}
                value={stringValue}
                onChange={e => updateField(q.questionKey, e.target.value)}
                placeholder={q.placeholder || ""}
                data-testid={`input-${q.questionKey}`}
              />
            )}

            {q.questionType === "number" && (
              <Input
                id={`q-${q.id}`}
                type="number"
                value={stringValue}
                onChange={e => updateField(q.questionKey, e.target.value)}
                placeholder={q.placeholder || ""}
                data-testid={`input-${q.questionKey}`}
              />
            )}

            {q.questionType === "textarea" && (
              <Textarea
                id={`q-${q.id}`}
                value={stringValue}
                onChange={e => updateField(q.questionKey, e.target.value)}
                placeholder={q.placeholder || ""}
                rows={3}
                data-testid={`textarea-${q.questionKey}`}
              />
            )}

            {q.questionType === "radio" && optionsList.length > 0 && (
              <RadioGroup
                value={stringValue}
                onValueChange={v => updateField(q.questionKey, v)}
                className="flex flex-wrap gap-2"
                data-testid={`radio-${q.questionKey}`}
              >
                {optionsList.map(opt => (
                  <Label
                    key={opt}
                    htmlFor={`q-${q.id}-${opt}`}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                      stringValue === opt ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <RadioGroupItem value={opt} id={`q-${q.id}-${opt}`} data-testid={`radio-${q.questionKey}-${opt.toLowerCase().replace(/[\s/+]+/g, "-")}`} />
                    <span className="text-sm font-normal">{opt}</span>
                  </Label>
                ))}
              </RadioGroup>
            )}

            {q.questionType === "checkbox" && optionsList.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {optionsList.map(opt => (
                  <Label
                    key={opt}
                    htmlFor={`q-${q.id}-${opt}`}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer transition-colors ${
                      arrayValue.includes(opt) ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <Checkbox
                      id={`q-${q.id}-${opt}`}
                      checked={arrayValue.includes(opt)}
                      onCheckedChange={() => toggleCheckboxOption(q.questionKey, opt)}
                      data-testid={`checkbox-${q.questionKey}-${opt.toLowerCase().replace(/[\s/(),]+/g, "-")}`}
                    />
                    <span className="text-sm font-normal leading-snug">{opt}</span>
                  </Label>
                ))}
              </div>
            )}

            {q.questionType === "select" && optionsList.length > 0 && (
              <select
                id={`q-${q.id}`}
                value={stringValue}
                onChange={e => updateField(q.questionKey, e.target.value)}
                className="w-full px-3 py-2 rounded-md border bg-background text-sm"
                data-testid={`select-${q.questionKey}`}
              >
                <option value="">{q.placeholder || "Select an option"}</option>
                {optionsList.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}

            {q.questionType === "file" && (
              <FileUploadField
                questionKey={q.questionKey}
                placeholder={q.placeholder || ""}
                value={fileUploads[q.questionKey] || []}
                onUpload={(file) => onFileUpload(q.questionKey, file)}
                onRemove={(index) => onFileRemove(q.questionKey, index)}
              />
            )}
          </QuestionCard>
        );
      })}
    </>
  );
}

function StepBusinessDetails({ businessDetails, updateBusinessField }: { businessDetails: BusinessDetailsData; updateBusinessField: (field: keyof BusinessDetailsData, value: string) => void }) {
  return (
    <>
      <QuestionCard>
        <Label htmlFor="bd-businessName" className="text-sm font-medium">
          Business Name <span className="text-destructive">*</span>
        </Label>
        <Input
          id="bd-businessName"
          value={businessDetails.businessName}
          onChange={e => updateBusinessField("businessName", e.target.value)}
          placeholder="Enter your business name"
          data-testid="input-bd-business-name"
        />
      </QuestionCard>

      <QuestionCard>
        <Label htmlFor="bd-businessAddress" className="text-sm font-medium">Business Address</Label>
        <Input
          id="bd-businessAddress"
          value={businessDetails.businessAddress}
          onChange={e => updateBusinessField("businessAddress", e.target.value)}
          placeholder="Street address"
          data-testid="input-bd-business-address"
        />
        <div className="grid grid-cols-3 gap-3 mt-2">
          <div>
            <Label htmlFor="bd-businessCity" className="text-xs text-muted-foreground">City</Label>
            <Input
              id="bd-businessCity"
              value={businessDetails.businessCity}
              onChange={e => updateBusinessField("businessCity", e.target.value)}
              placeholder="City"
              data-testid="input-bd-business-city"
            />
          </div>
          <div>
            <Label htmlFor="bd-businessState" className="text-xs text-muted-foreground">State</Label>
            <Input
              id="bd-businessState"
              value={businessDetails.businessState}
              onChange={e => updateBusinessField("businessState", e.target.value)}
              placeholder="State"
              data-testid="input-bd-business-state"
            />
          </div>
          <div>
            <Label htmlFor="bd-businessZip" className="text-xs text-muted-foreground">ZIP Code</Label>
            <Input
              id="bd-businessZip"
              value={businessDetails.businessZip}
              onChange={e => updateBusinessField("businessZip", e.target.value)}
              placeholder="ZIP"
              data-testid="input-bd-business-zip"
            />
          </div>
        </div>
      </QuestionCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuestionCard>
          <Label htmlFor="bd-contactNumber" className="text-sm font-medium">Contact Number</Label>
          <Input
            id="bd-contactNumber"
            value={businessDetails.contactNumber}
            onChange={e => updateBusinessField("contactNumber", e.target.value)}
            placeholder="(555) 123-4567"
            data-testid="input-bd-contact-number"
          />
        </QuestionCard>

        <QuestionCard>
          <Label htmlFor="bd-businessEmail" className="text-sm font-medium">Business Email</Label>
          <Input
            id="bd-businessEmail"
            type="email"
            value={businessDetails.businessEmail}
            onChange={e => updateBusinessField("businessEmail", e.target.value)}
            placeholder="info@yourbusiness.com"
            data-testid="input-bd-business-email"
          />
        </QuestionCard>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <QuestionCard>
          <Label htmlFor="bd-website" className="text-sm font-medium">Website</Label>
          <Input
            id="bd-website"
            value={businessDetails.website}
            onChange={e => updateBusinessField("website", e.target.value)}
            placeholder="https://www.yourbusiness.com"
            data-testid="input-bd-website"
          />
        </QuestionCard>

        <QuestionCard>
          <Label htmlFor="bd-businessType" className="text-sm font-medium">Business Type</Label>
          <Input
            id="bd-businessType"
            value={businessDetails.businessType}
            onChange={e => updateBusinessField("businessType", e.target.value)}
            placeholder="e.g., Signage, Graphics, Printing"
            data-testid="input-bd-business-type"
          />
        </QuestionCard>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <QuestionCard>
          <Label htmlFor="bd-taxId" className="text-sm font-medium">Tax ID / EIN</Label>
          <Input
            id="bd-taxId"
            value={businessDetails.taxId}
            onChange={e => updateBusinessField("taxId", e.target.value)}
            placeholder="XX-XXXXXXX"
            data-testid="input-bd-tax-id"
          />
        </QuestionCard>

        <QuestionCard>
          <Label htmlFor="bd-yearEstablished" className="text-sm font-medium">Year Established</Label>
          <Input
            id="bd-yearEstablished"
            value={businessDetails.yearEstablished}
            onChange={e => updateBusinessField("yearEstablished", e.target.value)}
            placeholder="e.g., 2010"
            data-testid="input-bd-year-established"
          />
        </QuestionCard>

        <QuestionCard>
          <Label htmlFor="bd-numberOfEmployees" className="text-sm font-medium">Number of Employees</Label>
          <Input
            id="bd-numberOfEmployees"
            value={businessDetails.numberOfEmployees}
            onChange={e => updateBusinessField("numberOfEmployees", e.target.value)}
            placeholder="e.g., 15"
            data-testid="input-bd-number-employees"
          />
        </QuestionCard>
      </div>

      <QuestionCard>
        <Label htmlFor="bd-additionalNotes" className="text-sm font-medium">Additional Business Notes</Label>
        <Textarea
          id="bd-additionalNotes"
          value={businessDetails.additionalNotes}
          onChange={e => updateBusinessField("additionalNotes", e.target.value)}
          placeholder="Any other relevant business information..."
          rows={3}
          data-testid="textarea-bd-additional-notes"
        />
      </QuestionCard>

      <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-4 mt-4">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Email Sender Setup
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Set up your sender email for notifications sent to users and clients from your dashboard.
            A verification email will be sent to confirm your sender address via SendGrid.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <QuestionCard>
            <Label htmlFor="bd-senderFirstName" className="text-sm font-medium">
              First Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bd-senderFirstName"
              value={businessDetails.senderFirstName}
              onChange={e => updateBusinessField("senderFirstName", e.target.value)}
              placeholder="Your first name"
              data-testid="input-bd-sender-first-name"
            />
          </QuestionCard>

          <QuestionCard>
            <Label htmlFor="bd-senderNickname" className="text-sm font-medium">
              Nickname <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bd-senderNickname"
              value={businessDetails.senderNickname}
              onChange={e => updateBusinessField("senderNickname", e.target.value)}
              placeholder="e.g., My Business Notifications"
              data-testid="input-bd-sender-nickname"
            />
          </QuestionCard>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <QuestionCard>
            <Label htmlFor="bd-senderFromEmail" className="text-sm font-medium">
              From Email Address <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bd-senderFromEmail"
              type="email"
              value={businessDetails.senderFromEmail}
              onChange={e => updateBusinessField("senderFromEmail", e.target.value)}
              placeholder="notifications@yourdomain.com"
              data-testid="input-bd-sender-from-email"
            />
          </QuestionCard>

          <QuestionCard>
            <Label htmlFor="bd-senderReplyTo" className="text-sm font-medium">
              Reply-To Email <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bd-senderReplyTo"
              type="email"
              value={businessDetails.senderReplyTo}
              onChange={e => updateBusinessField("senderReplyTo", e.target.value)}
              placeholder="support@yourdomain.com"
              data-testid="input-bd-sender-reply-to"
            />
          </QuestionCard>
        </div>

        <QuestionCard>
          <Label htmlFor="bd-senderCompanyAddress" className="text-sm font-medium">
            Company Address <span className="text-destructive">*</span>
          </Label>
          <Input
            id="bd-senderCompanyAddress"
            value={businessDetails.senderCompanyAddress}
            onChange={e => updateBusinessField("senderCompanyAddress", e.target.value)}
            placeholder="123 Main Street"
            data-testid="input-bd-sender-company-address"
          />
        </QuestionCard>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <QuestionCard>
            <Label htmlFor="bd-senderCity" className="text-sm font-medium">
              City <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bd-senderCity"
              value={businessDetails.senderCity}
              onChange={e => updateBusinessField("senderCity", e.target.value)}
              placeholder="City name"
              data-testid="input-bd-sender-city"
            />
          </QuestionCard>

          <QuestionCard>
            <Label htmlFor="bd-senderCountry" className="text-sm font-medium">
              Country <span className="text-destructive">*</span>
            </Label>
            <Input
              id="bd-senderCountry"
              value={businessDetails.senderCountry}
              onChange={e => updateBusinessField("senderCountry", e.target.value)}
              placeholder="e.g., US, IN, UK"
              data-testid="input-bd-sender-country"
            />
          </QuestionCard>
        </div>
      </div>
    </>
  );
}
