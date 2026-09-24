import { useEffect, useState } from "react";
import { usePageHeader } from "@/lib/page-header";
import { BookOpen, LogIn, LayoutDashboard, Briefcase, Camera, Calendar, Settings, ChevronRight, CheckCircle2, AlertCircle, Info, ClipboardCheck, Bell, MapPin, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const sections = [
  { id: "getting-started", label: "Getting Started" },
  { id: "dashboard", label: "Dashboard" },
  { id: "my-jobs", label: "My Jobs" },
  { id: "completed-photos", label: "Completed Photos" },
  { id: "surveys", label: "Site Surveys" },
  { id: "calendar", label: "Install Calendar" },
  { id: "reschedule", label: "Reschedule Requests" },
  { id: "account", label: "Account Settings" },
];

function Step({ num, children }: { num: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold flex-shrink-0 mt-0.5">{num}</div>
      <div className="text-sm text-muted-foreground flex-1">{children}</div>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 items-start bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3 mt-3">
      <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
      <p className="text-xs text-blue-700 dark:text-blue-300">{children}</p>
    </div>
  );
}

export default function UserManualPage() {
  const { setHeaderInfo } = usePageHeader();
  const [activeSection, setActiveSection] = useState("getting-started");

  useEffect(() => {
    setHeaderInfo({
      title: "User Manual",
      description: "Guide for installers and field staff",
      icon: <BookOpen className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo]);

  useEffect(() => {
    const handleScroll = (e: Event) => {
      const container = e.target as HTMLElement;
      const scrollTop = container.scrollTop;
      for (let i = sections.length - 1; i >= 0; i--) {
        const el = document.getElementById(sections[i].id);
        if (el && el.offsetTop - 120 <= scrollTop) {
          setActiveSection(sections[i].id);
          break;
        }
      }
    };
    const scrollContainer = document.querySelector(".flex-1.flex.flex-col.overflow-y-auto");
    scrollContainer?.addEventListener("scroll", handleScroll);
    return () => scrollContainer?.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto flex gap-8">
        <nav className="hidden lg:block w-56 flex-shrink-0 sticky top-4 self-start">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">On this page</p>
          <div className="space-y-1">
            {sections.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`block w-full text-left text-sm px-3 py-1.5 rounded-md transition-colors ${activeSection === s.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}
                data-testid={`button-doc-section-${s.id}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="flex-1 min-w-0 space-y-10">
          <div className="space-y-2" id="getting-started">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <LogIn className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-getting-started">Getting Started</h2>
                <p className="text-sm text-muted-foreground">How to log in and navigate the platform</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">Logging In</h3>
                <div className="space-y-3">
                  <Step num={1}>Open the InstalliQ.ai application in your browser</Step>
                  <Step num={2}>Enter your <strong className="text-foreground">email address</strong> or <strong className="text-foreground">phone number</strong></Step>
                  <Step num={3}>Enter your password (provided by your admin)</Step>
                  <Step num={4}>If Two-Factor Authentication (2FA) is enabled, enter the code from your authenticator app</Step>
                  <Step num={5}>Click <strong className="text-foreground">"Sign In"</strong> to access your dashboard</Step>
                </div>
              </div>
              <Tip>On your first login with a temporary password, you'll be prompted to create a new secure password. Use at least 8 characters with uppercase, lowercase, numbers, and special characters.</Tip>
              <div>
                <h3 className="font-semibold text-sm mb-3">Navigation</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Use the <strong className="text-foreground">sidebar</strong> on the left to navigate between sections. On mobile, tap the menu icon at the top to open the sidebar.</p>
                  <p>The <strong className="text-foreground">Help & Docs</strong> section in the sidebar provides access to this manual at any time.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2" id="dashboard">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <LayoutDashboard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-dashboard">Dashboard</h2>
                <p className="text-sm text-muted-foreground">Your main overview screen</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-2">
              <p>Your dashboard provides a quick overview of your activity and upcoming work:</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: Calendar, text: "View upcoming installations and your schedule" },
                  { icon: Camera, text: "See recently completed projects and photos" },
                  { icon: CheckCircle2, text: "Access quick actions for common tasks" },
                  { icon: ChevronRight, text: "Navigate to other sections via the sidebar" },
                  { icon: ClipboardCheck, text: "View completed site surveys" },
                  { icon: MapPin, text: "See project locations and customer info" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2 border rounded-lg p-3">
                    <item.icon className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-xs">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2" id="my-jobs">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-my-jobs">My Jobs</h2>
                <p className="text-sm text-muted-foreground">Viewing and managing your assigned work</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>The <strong className="text-foreground">"My Jobs"</strong> section shows all installations assigned to you:</p>
              <ul className="space-y-2">
                <li className="flex gap-2 items-start"><AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" /><span>Pending jobs appear with a <strong className="text-foreground">notification badge</strong> in the sidebar</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Click on any job to view details including customer info, address, and work order</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Use the <strong className="text-foreground">"On My Way"</strong> button to notify the customer you're heading to the site</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>View the <strong className="text-foreground">installation address</strong> and tap to open directions in your maps app</span></li>
                <li className="flex gap-2 items-start"><CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span>After completing work, go to <strong className="text-foreground">"Completed Photos"</strong> to upload photos and finalize</span></li>
              </ul>
              <Tip>You'll receive a notification sound when new jobs are assigned to you. Make sure your browser notifications are enabled.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="completed-photos">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Camera className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-completed-photos">Completed Photos</h2>
                <p className="text-sm text-muted-foreground">Uploading photos and completing jobs</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">Uploading Photos</h3>
                <div className="space-y-3">
                  <Step num={1}>Navigate to <strong className="text-foreground">"Completed Photos"</strong> from the sidebar</Step>
                  <Step num={2}>Click <strong className="text-foreground">"Camera"</strong> to take photos directly or <strong className="text-foreground">"Gallery"</strong> to upload from your device</Step>
                  <Step num={3}>You can upload up to <strong className="text-foreground">10 photos</strong> per project</Step>
                  <Step num={4}>Photos are automatically analyzed by AI to suggest relevant tags</Step>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-3">Completing a Project</h3>
                <div className="space-y-3">
                  <Step num={1}>Enter the <strong className="text-foreground">Job Label/Number</strong></Step>
                  <Step num={2}>Add a description (optional — AI can auto-fill from the work order)</Step>
                  <Step num={3}>Fill in customer name, phone, email, and address</Step>
                  <Step num={4}>Select applicable <strong className="text-foreground">tags</strong> (e.g., ADA, Vehicle Graphics, Window Graphics)</Step>
                  <Step num={5}>If there's an issue, check <strong className="text-foreground">"Report an Issue"</strong> and describe the problem</Step>
                  <Step num={6}>Click <strong className="text-foreground">"Save Project"</strong> to complete</Step>
                </div>
              </div>
              <Tip>When you report an issue, an email notification is automatically sent to management with the details so they can follow up quickly.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="surveys">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <ClipboardCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-surveys">Site Surveys</h2>
                <p className="text-sm text-muted-foreground">Conducting and documenting site surveys</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">Creating a Site Survey</h3>
                <div className="space-y-3">
                  <Step num={1}>Navigate to a project from the dashboard, then click <strong className="text-foreground">"Site Survey"</strong></Step>
                  <Step num={2}>Take photos of the installation site from different angles</Step>
                  <Step num={3}>Use the <strong className="text-foreground">annotation tools</strong> to mark up photos — draw arrows, circles, and add text notes directly on the images</Step>
                  <Step num={4}>Fill in survey details including site conditions and measurements</Step>
                  <Step num={5}>Answer the survey questionnaire if one has been configured by your admin</Step>
                  <Step num={6}>Submit the survey to generate a PDF report</Step>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-3">Photo Annotations</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>The annotation tool lets you mark up survey photos to highlight important details:</p>
                  <ul className="space-y-2">
                    <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Draw <strong className="text-foreground">freehand lines</strong> to circle or underline areas of interest</span></li>
                    <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Add <strong className="text-foreground">text labels</strong> to describe specific features or issues</span></li>
                    <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Choose from multiple <strong className="text-foreground">colors</strong> to organize your annotations</span></li>
                    <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Annotated photos are included in the survey PDF report</span></li>
                  </ul>
                </div>
              </div>
              <Tip>Survey PDF reports can be emailed directly to customers and team members from the survey page. The report includes all photos, annotations, and questionnaire responses.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="calendar">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-calendar">Install Calendar</h2>
                <p className="text-sm text-muted-foreground">Viewing your schedule</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>The Install Calendar displays all scheduled installations:</p>
              <ul className="space-y-2">
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Switch between <strong className="text-foreground">Day</strong>, <strong className="text-foreground">Week</strong>, and <strong className="text-foreground">Month</strong> views</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Events are color-coded by status (Scheduled, Confirmed, Completed, etc.)</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Click on any event to view details including customer info and work order</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Weather information is displayed to help plan outdoor installations</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Use filters to show specific installers' schedules</span></li>
              </ul>
              <Tip>If you have the <strong>Install Manager</strong> role, you can also create and edit calendar events, assign team members, and manage bookings — similar to an admin but within your team.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="reschedule">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-reschedule">Reschedule Requests</h2>
                <p className="text-sm text-muted-foreground">Customer-initiated reschedule requests</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>When customers request to reschedule an installation, you'll see the request in your notifications:</p>
              <ul className="space-y-2">
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Pending requests show a <strong className="text-foreground">notification badge</strong> in the sidebar</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Review the customer's requested new date and time</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Your admin will approve or reject the request and update the calendar accordingly</span></li>
              </ul>
            </div>
          </div>

          <div className="space-y-2" id="account">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Settings className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-account">Account Settings</h2>
                <p className="text-sm text-muted-foreground">Managing your profile and security</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>Access Account Settings from the user menu at the bottom of the sidebar:</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  "Update your name, email, and phone number",
                  "Change your password",
                  "Enable or disable Two-Factor Authentication (2FA)",
                  "Set up face recognition for quick login",
                  "Choose your notification sound preference",
                  "View your role and team information",
                ].map((text, i) => (
                  <div key={i} className="flex items-center gap-2 border rounded-lg p-3">
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="text-xs">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}
