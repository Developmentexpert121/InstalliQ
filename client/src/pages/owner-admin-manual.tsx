import { useEffect, useState } from "react";
import { usePageHeader } from "@/lib/page-header";
import { Shield, Users, Calendar, Tag, Bell, Bot, CreditCard, FileText, ChevronRight, CheckCircle2, Info, ClipboardCheck, ClipboardList, Settings, Upload, Download, Mail, UserCheck } from "lucide-react";
import { Separator } from "@/components/ui/separator";

const sections = [
  { id: "overview", label: "Owner Overview" },
  { id: "users", label: "User Management" },
  { id: "calendar", label: "Calendar Management" },
  { id: "ai-scheduling", label: "AI Scheduling" },
  { id: "surveys", label: "Site Surveys" },
  { id: "questionnaires", label: "Survey Questionnaires" },
  { id: "pdf-branding", label: "PDF Branding & Templates" },
  { id: "tags", label: "Tags Management" },
  { id: "reschedule", label: "Reschedule Requests" },
  { id: "assistant", label: "AI Assistant" },
  { id: "email-sender", label: "Email Sender Identity" },
  { id: "billing", label: "Subscription & Billing" },
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

export default function OwnerAdminManualPage() {
  const { setHeaderInfo } = usePageHeader();
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    setHeaderInfo({
      title: "Owner Admin Manual",
      description: "Guide for owner-level administrators",
      icon: <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
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
          <div className="space-y-2" id="overview">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-overview">Owner Overview</h2>
                <p className="text-sm text-muted-foreground">Your role and responsibilities</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>As an <strong className="text-foreground">Owner</strong>, you have full control over your organization's InstalliQ.ai account. You manage users, schedule installations, process work orders, conduct site surveys, and oversee all project activity.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: Users, text: "Create and manage installer accounts" },
                  { icon: Calendar, text: "Schedule and assign installations" },
                  { icon: FileText, text: "Upload and process work order PDFs" },
                  { icon: ClipboardCheck, text: "Manage site surveys and questionnaires" },
                  { icon: Tag, text: "Manage tags for organizing work types" },
                  { icon: Bell, text: "Handle customer reschedule requests" },
                  { icon: Bot, text: "Configure your AI assistant" },
                  { icon: CreditCard, text: "Manage your subscription plan" },
                  { icon: Upload, text: "Custom PDF branded templates" },
                  { icon: Mail, text: "Configure email sender identity" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 border rounded-lg p-3 hover:border-primary/30 transition-colors">
                    <item.icon className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-xs">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2" id="users">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-users">User Management</h2>
                <p className="text-sm text-muted-foreground">Creating and managing installer accounts</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">Creating a New Installer</h3>
                <div className="space-y-3">
                  <Step num={1}>Go to <strong className="text-foreground">"User Management"</strong> in the sidebar</Step>
                  <Step num={2}>Click the <strong className="text-foreground">"Add User"</strong> button</Step>
                  <Step num={3}>Enter the installer's name, email, phone number, and username</Step>
                  <Step num={4}>A temporary password will be auto-generated</Step>
                  <Step num={5}>The installer will receive a welcome email with their login credentials</Step>
                  <Step num={6}>On first login, they'll be prompted to change their password</Step>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-3">User Roles</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>You can assign different roles to your team members:</p>
                  <ul className="space-y-2">
                    <li className="flex gap-2 items-start"><UserCheck className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Installer</strong> — View assigned jobs, upload completion photos, send "On My Way" notifications, and conduct site surveys</span></li>
                    <li className="flex gap-2 items-start"><UserCheck className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Install Manager</strong> — Everything an installer can do, plus create/edit calendar events, assign team members, send assignment emails, add files to events, and delete their own events</span></li>
                  </ul>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-2">Managing Existing Users</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Reset Password</strong> — Generate a new temporary password and email it to the user</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Delete User</strong> — Permanently remove the user's account (this cannot be undone)</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Export Users</strong> — Download a CSV file of all your users' information</span></li>
                </ul>
              </div>
              <Tip>Users you create are visible only to your organization. Different owners cannot see each other's team members, even if they share the same email domain.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="calendar">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Calendar className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-calendar">Calendar Management</h2>
                <p className="text-sm text-muted-foreground">Scheduling and managing installations</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">Creating a Booking Manually</h3>
                <div className="space-y-3">
                  <Step num={1}>Click <strong className="text-foreground">"Create Booking"</strong> on the calendar page</Step>
                  <Step num={2}>Fill in event details: title, description, start/end date and time</Step>
                  <Step num={3}>Select a <strong className="text-foreground">duration</strong> from 30-minute increments (30 min to 8 hours)</Step>
                  <Step num={4}>Assign one or more installers to the booking</Step>
                  <Step num={5}>Add customer information, installation address, and point-of-contact details</Step>
                  <Step num={6}>Optionally add a secondary point of contact</Step>
                  <Step num={7}>Click <strong className="text-foreground">"Create"</strong> to save the booking</Step>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-2">Managing Events</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Click on any event to view or edit its details</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Change event status: <strong className="text-foreground">Scheduled → Confirmed → In Progress → Completed</strong></span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Send confirmation emails to customers with one click</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Upload work order files and attachments to events</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Archive completed events to keep the calendar clean</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Filter by installer to view individual schedules</span></li>
                </ul>
              </div>
              <Tip>When the same invoice/work order number is used for multiple calendar events (multi-visit jobs), the system automatically appends letter suffixes (A, B, C...) to keep them unique. The first entry keeps the original number.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="ai-scheduling">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-ai-scheduling">AI-Powered Scheduling</h2>
                <p className="text-sm text-muted-foreground">Automatically schedule from work order PDFs</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">How It Works</h3>
                <div className="space-y-3">
                  <Step num={1}>Click <strong className="text-foreground">"Schedule"</strong> on the calendar</Step>
                  <Step num={2}>Upload a <strong className="text-foreground">work order PDF</strong></Step>
                  <Step num={3}>AI extracts key information: work order number, customer details, product due date, and installation requirements</Step>
                  <Step num={4}>Optionally type your preferred date and time in the prompt (e.g., <em>"Schedule for next Tuesday at 2pm"</em>)</Step>
                  <Step num={5}>AI suggests the best installation date, estimated duration (in 30-minute increments), and auto-calculates end time</Step>
                  <Step num={6}>The calendar date always defaults to <strong className="text-foreground">today</strong> regardless of dates in uploaded files</Step>
                  <Step num={7}>Review the extracted data, make adjustments if needed, and confirm the booking</Step>
                </div>
              </div>
              <Tip>The AI prioritizes dates you specify in the prompt. If you don't specify a date, it uses the "Product Due" date from the work order. The work order number (e.g., "401-51480") is automatically used as the job number.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="surveys">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <ClipboardCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-surveys">Site Surveys</h2>
                <p className="text-sm text-muted-foreground">Managing site surveys and documentation</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>Site surveys allow your team to document installation sites with photos, annotations, and structured questionnaires:</p>
              <ul className="space-y-2">
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Installers can create surveys linked to projects</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Photos can be annotated with drawings, arrows, and text labels</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Survey PDF reports are generated automatically with all photos and annotations</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Reports can be emailed to customers and team members</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Survey reports use your branded PDF template if one is configured</span></li>
              </ul>
            </div>
          </div>

          <div className="space-y-2" id="questionnaires">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <ClipboardList className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-questionnaires">Survey Questionnaires</h2>
                <p className="text-sm text-muted-foreground">Creating custom survey question templates</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">Setting Up Questionnaires</h3>
                <div className="space-y-3">
                  <Step num={1}>Navigate to <strong className="text-foreground">"Questionnaire Setup"</strong> in the Administration section</Step>
                  <Step num={2}>Create question groups to organize related questions</Step>
                  <Step num={3}>Add questions with different answer types (text, yes/no, multiple choice, etc.)</Step>
                  <Step num={4}>Reorder questions and groups as needed</Step>
                  <Step num={5}>Your installers will see these questions when conducting site surveys</Step>
                </div>
              </div>
              <Tip>Questionnaire responses are included in the survey PDF report. Design your questions to capture all the site information your team needs for a successful installation.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="pdf-branding">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-pdf-branding">PDF Branding & Templates</h2>
                <p className="text-sm text-muted-foreground">Customizing your generated PDF reports</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">Company Branding</h3>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>Go to <strong className="text-foreground">Account Settings → PDF Branding</strong> to customize your reports:</p>
                  <ul className="space-y-2">
                    <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Upload your <strong className="text-foreground">company logo</strong> (PNG or JPG, max 5MB)</span></li>
                    <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Set your company name, address, phone, and email</span></li>
                    <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>These details appear in the header of all Project and Survey PDF reports</span></li>
                  </ul>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-3">Branded PDF Templates</h3>
                <div className="space-y-3">
                  <Step num={1}>Click <strong className="text-foreground">"Download Blank Template"</strong> to get a guide PDF showing the exact page layout</Step>
                  <Step num={2}>Open the blank template in any design tool (Canva, Illustrator, Photoshop, etc.)</Step>
                  <Step num={3}>Add your company branding — logo, colors, header/footer artwork</Step>
                  <Step num={4}>Keep the content area mostly clear for report data</Step>
                  <Step num={5}>Export your design as a single-page <strong className="text-foreground">PDF or PNG</strong> image</Step>
                  <Step num={6}>Upload it using the <strong className="text-foreground">"Upload Template"</strong> button</Step>
                </div>
              </div>
              <Tip>When a custom template is uploaded, it replaces the default header/footer on all generated reports. Your design becomes the full-page background with report content overlaid on top. You can remove the template at any time to revert to the default layout.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="tags">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Tag className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-tags">Tags Management</h2>
                <p className="text-sm text-muted-foreground">Organizing work with custom tags</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-4 pt-2 text-sm text-muted-foreground">
              <p>Tags help categorize different types of installation work. The system comes with <strong className="text-foreground">16 predefined tags</strong> (ADA, Channel Letters, Vehicle Graphics, etc.), and you can add your own custom tags.</p>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-3">Adding Custom Tags</h3>
                <div className="space-y-3">
                  <Step num={1}>Click the <strong className="text-foreground">"Tags"</strong> button on the Install Calendar page</Step>
                  <Step num={2}>Type the new tag name in the input field at the bottom</Step>
                  <Step num={3}>Click <strong className="text-foreground">"Add"</strong> or press Enter to create the tag</Step>
                  <Step num={4}>Your custom tags appear alongside system tags throughout the app (calendar, completed photos, etc.)</Step>
                  <Step num={5}>To remove a custom tag, click the <strong className="text-foreground">×</strong> on the tag badge</Step>
                </div>
              </div>
              <Tip>System tags cannot be deleted — they are available to all users. Only custom tags you create can be removed.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="reschedule">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Bell className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-reschedule">Reschedule Requests</h2>
                <p className="text-sm text-muted-foreground">Handling customer reschedule requests</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>When customers receive their booking confirmation email, they can request a reschedule. These requests appear in your <strong className="text-foreground">"Reschedule Requests"</strong> section.</p>
              <ul className="space-y-2">
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Pending requests show a <strong className="text-foreground">notification badge</strong> in the sidebar</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Review the customer's requested new date and time</span></li>
                <li className="flex gap-2 items-start"><CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Approve</strong> to automatically update the calendar event</span></li>
                <li className="flex gap-2 items-start"><Info className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Reject</strong> with a reason if the new time doesn't work</span></li>
              </ul>
            </div>
          </div>

          <div className="space-y-2" id="assistant">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-assistant">AI Assistant Configuration</h2>
                <p className="text-sm text-muted-foreground">Customizing your AI assistant</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>Each Owner gets their own AI assistant that can be customized:</p>
              <ul className="space-y-2">
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Access <strong className="text-foreground">"Assistant Settings"</strong> from your account menu</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Customize the assistant's instructions and behavior</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Upload knowledge files (product catalogs, installation guides, pricing sheets)</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>The assistant uses these files to provide better scheduling suggestions and time estimates</span></li>
              </ul>
            </div>
          </div>

          <div className="space-y-2" id="email-sender">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-email-sender">Email Sender Identity</h2>
                <p className="text-sm text-muted-foreground">Configuring how your emails appear to customers</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>Customize the sender identity used for all outgoing emails from your organization:</p>
              <ul className="space-y-2">
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Set your <strong className="text-foreground">From Name</strong> and <strong className="text-foreground">Reply-To email</strong> address</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Configure the company address shown in email footers</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>All booking confirmations, assignment emails, and reports use this sender identity</span></li>
              </ul>
              <Tip>Go to Account Settings → Email Sender Identity to configure these settings. This ensures your customers see your company name when they receive emails from InstalliQ.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="billing">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-billing">Subscription & Billing</h2>
                <p className="text-sm text-muted-foreground">Managing your subscription plan</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>InstalliQ.ai offers tiered subscription plans based on your usage needs:</p>
              <div className="grid sm:grid-cols-3 gap-3">
                {[
                  { name: "Basic", desc: "Small operations with limited monthly events" },
                  { name: "Standard", desc: "Growing businesses with moderate event volume" },
                  { name: "Premium", desc: "Unlimited events for high-volume operations" },
                ].map((plan) => (
                  <div key={plan.name} className="border rounded-lg p-4 text-center hover:border-primary/30 transition-colors">
                    <h4 className="font-semibold text-foreground">{plan.name}</h4>
                    <p className="text-xs mt-1">{plan.desc}</p>
                  </div>
                ))}
              </div>
              <p>Navigate to <strong className="text-foreground">"Subscription Plans"</strong> in the sidebar to view your current plan, usage, and upgrade options. Payments are processed securely through Razorpay.</p>
            </div>
          </div>

          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}
