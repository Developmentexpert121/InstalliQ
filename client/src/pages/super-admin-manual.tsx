import { useEffect, useState } from "react";
import { usePageHeader } from "@/lib/page-header";
import { ShieldCheck, Users, ScrollText, CreditCard, Mail, ChevronRight, CheckCircle2, Info, Shield, UserCheck, Lock, ToggleRight, ClipboardCheck, FileText, Bot, Calendar, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const sections = [
  { id: "overview", label: "Super Admin Overview" },
  { id: "roles", label: "Role Hierarchy" },
  { id: "activity-log", label: "Activity Log" },
  { id: "user-mgmt", label: "User Management" },
  { id: "subscriptions", label: "Subscription Management" },
  { id: "google-calendar", label: "Google Calendar" },
  { id: "emails", label: "System Emails" },
  { id: "platform-features", label: "Platform Features" },
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

export default function SuperAdminManualPage() {
  const { setHeaderInfo } = usePageHeader();
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    setHeaderInfo({
      title: "Super Admin Manual",
      description: "Guide for system-level administrators",
      icon: <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
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
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-overview">Super Admin Overview</h2>
                <p className="text-sm text-muted-foreground">Your role as the system administrator</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>As a <strong className="text-foreground">Super Admin</strong> (displayed as "Admin" in the UI), you have the highest level of access in InstalliQ.ai. You oversee all Owner accounts, manage system-wide settings, and monitor all platform activity.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: ScrollText, text: "Activity Log — monitor all system-wide actions" },
                  { icon: Users, text: "Manage all Owner accounts and their users" },
                  { icon: ToggleRight, text: "Control the subscription gate" },
                  { icon: CreditCard, text: "Create and manage subscription plans" },
                  { icon: Lock, text: "Block or unblock Owner accounts" },
                  { icon: Shield, text: "View and manage all AI assistants" },
                  { icon: Globe, text: "Google Calendar integration management" },
                  { icon: FileText, text: "Access all documentation guides" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-2.5 border rounded-lg p-3 hover:border-primary/30 transition-colors">
                    <item.icon className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-xs">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2" id="roles">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <UserCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-roles">Role Hierarchy</h2>
                <p className="text-sm text-muted-foreground">Understanding the user roles</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-3 pt-2">
              <div className="border-l-4 border-l-primary rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge>Admin</Badge>
                  <span className="text-xs text-muted-foreground font-mono">(super_admin)</span>
                </div>
                <p className="text-sm text-muted-foreground">Full system control. Manages all owners, subscription plans, activity logs, and system settings. Has access to all documentation pages including the Developer Guide.</p>
              </div>
              <div className="border-l-4 border-l-blue-500 rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="secondary">Owner</Badge>
                  <span className="text-xs text-muted-foreground font-mono">(admin)</span>
                </div>
                <p className="text-sm text-muted-foreground">Manages their own organization. Creates installer accounts, schedules installations, processes work orders, manages site surveys and questionnaires, configures AI assistant and PDF branding, and handles billing. Has access to User Manual and Owner Admin Manual.</p>
              </div>
              <div className="border-l-4 border-l-indigo-400 rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="border-indigo-400 text-indigo-600">Install Manager</Badge>
                  <span className="text-xs text-muted-foreground font-mono">(user + install_manager)</span>
                </div>
                <p className="text-sm text-muted-foreground">Extended installer permissions. Can create and edit calendar events, assign team members, send assignment emails, upload files to events, and delete their own events. Has access to User Manual.</p>
              </div>
              <div className="border-l-4 border-l-slate-400 rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline">Installer</Badge>
                  <span className="text-xs text-muted-foreground font-mono">(user)</span>
                </div>
                <p className="text-sm text-muted-foreground">Field staff who view assigned jobs, upload completion photos, conduct site surveys with photo annotations, notify customers of arrival, and mark installations as done. Has access to User Manual.</p>
              </div>
            </div>
          </div>

          <div className="space-y-2" id="activity-log">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <ScrollText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-activity-log">Activity Log</h2>
                <p className="text-sm text-muted-foreground">Monitoring system-wide activity</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-4">
              <p>The Activity Log provides a comprehensive audit trail of all actions across the platform:</p>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2.5 border-b">
                  <h3 className="font-semibold text-sm text-foreground">Tracked Actions</h3>
                </div>
                <div className="divide-y">
                  {[
                    { category: "User Actions", examples: "Login attempts, password changes, account creation/deletion, 2FA setup" },
                    { category: "Calendar Actions", examples: "Event creation, updates, status changes, deletions, archiving, duplicate WO# handling" },
                    { category: "Project Actions", examples: "Project creation, photo uploads, report generation, survey creation" },
                    { category: "Admin Actions", examples: "User management, settings changes, role modifications, questionnaire setup" },
                    { category: "Payment Actions", examples: "Subscription purchases, plan changes, payment verifications" },
                    { category: "Email Actions", examples: "Booking confirmations, assignment emails, issue reports, survey reports" },
                  ].map((item) => (
                    <div key={item.category} className="flex items-start gap-3 px-4 py-2.5">
                      <span className="font-medium text-foreground text-xs min-w-[120px]">{item.category}</span>
                      <span className="text-xs">{item.examples}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2">Filtering & Searching</h3>
                <ul className="space-y-2">
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Filter by action type (login, create, update, delete)</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Filter by user who performed the action</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Filter by date range to investigate specific incidents</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Search for specific events, resources, or user actions</span></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-2" id="user-mgmt">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-user-mgmt">User Management</h2>
                <p className="text-sm text-muted-foreground">Managing Owner accounts and system users</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2">
              <div>
                <h3 className="font-semibold text-sm mb-3">Creating an Owner Account</h3>
                <div className="space-y-3">
                  <Step num={1}>Navigate to <strong className="text-foreground">"User Management"</strong></Step>
                  <Step num={2}>Click <strong className="text-foreground">"Add User"</strong></Step>
                  <Step num={3}>Set the role to <strong className="text-foreground">"Owner"</strong> (Admin)</Step>
                  <Step num={4}>Fill in the Owner's details (name, email, phone, username)</Step>
                  <Step num={5}>A temporary password will be generated and emailed to the new Owner</Step>
                  <Step num={6}>The Owner can then set up their account, configure branding, and start creating installers</Step>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm mb-2">Available Actions</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">View all users</strong> — See every user in the system across all organizations</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Reset passwords</strong> — Generate new temporary passwords for any user</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Delete accounts</strong> — Remove users permanently (action is logged in Activity Log)</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Export data</strong> — Download user data as CSV for reporting</span></li>
                </ul>
              </div>
              <Tip>Each Owner group is independent. Users are linked by the createdBy field, not by email domain. Different owners can have team members with the same email domain without conflict.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="subscriptions">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-subscriptions">Subscription Management</h2>
                <p className="text-sm text-muted-foreground">Managing plans and the subscription gate</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-6 pt-2 text-sm text-muted-foreground">
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2">Subscription Plans</h3>
                <p className="mb-2">Navigate to "Subscription Plans" to manage available plans:</p>
                <ul className="space-y-2">
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Create new plans with name, description, price, and event limits</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Edit existing plan details and pricing</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Delete plans that are no longer offered</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>View which Owners are subscribed to each plan</span></li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2">Subscription Gate</h3>
                <div className="border rounded-lg overflow-hidden">
                  <div className="divide-y">
                    <div className="flex items-start gap-3 px-4 py-3">
                      <Badge className="mt-0.5 bg-green-600">Enabled</Badge>
                      <span className="text-xs">Owners must subscribe and pay to access features beyond the Subscription Plans page. Owners without active subscriptions are automatically redirected.</span>
                    </div>
                    <div className="flex items-start gap-3 px-4 py-3">
                      <Badge variant="secondary" className="mt-0.5">Disabled</Badge>
                      <span className="text-xs">All Owners can access all features freely without requiring a subscription or payment.</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground mb-2">Managing Owner Subscriptions</h3>
                <ul className="space-y-2">
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>View all active subscriptions and their statuses</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Block</strong> an Owner's subscription to restrict their access</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span><strong className="text-foreground">Unblock</strong> a previously blocked subscription to restore access</span></li>
                  <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Monitor usage against plan limits</span></li>
                </ul>
              </div>
              <Tip>Plan changes can only be made through the Razorpay payment flow. Owners select a plan, complete payment via Razorpay, and the subscription activates automatically upon verification.</Tip>
            </div>
          </div>

          <div className="space-y-2" id="google-calendar">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Globe className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-google-calendar">Google Calendar Integration</h2>
                <p className="text-sm text-muted-foreground">Syncing with Google Calendar</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <p>InstalliQ.ai supports Google Calendar integration for syncing installation events:</p>
              <ul className="space-y-2">
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Connect your Google account via the <strong className="text-foreground">Google Calendar</strong> page</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Calendar events created in InstalliQ can be synced to Google Calendar</span></li>
                <li className="flex gap-2 items-start"><ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" /><span>Manage which calendars are synced and configure sync preferences</span></li>
              </ul>
            </div>
          </div>

          <div className="space-y-2" id="emails">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-emails">System Emails</h2>
                <p className="text-sm text-muted-foreground">Automated email notifications</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <div className="flex gap-2 items-start bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <Mail className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">All system emails automatically include <strong>info@installiq.ai</strong> in the BCC field.</p>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-4 py-2.5 border-b">
                  <h3 className="font-semibold text-sm text-foreground">Email Types</h3>
                </div>
                <div className="divide-y">
                  {[
                    { type: "Welcome Email", trigger: "New user account created", recipient: "New user" },
                    { type: "Password Reset Request", trigger: "User requests password reset", recipient: "Requesting user" },
                    { type: "Password Updated", trigger: "Successful password change", recipient: "User" },
                    { type: "Admin Password Reset", trigger: "Admin resets user's password", recipient: "Affected user" },
                    { type: "Booking Confirmation", trigger: "Schedule confirmation sent", recipient: "Customer" },
                    { type: "Booking Assignment", trigger: "Installer assigned to event", recipient: "Assigned installer" },
                    { type: "Installer On The Way", trigger: "Installer clicks 'On My Way'", recipient: "Customer" },
                    { type: "Issue Report", trigger: "Issue reported on project/event", recipient: "Management" },
                    { type: "Project Report", trigger: "PDF report requested", recipient: "Requesting user" },
                    { type: "Survey Report", trigger: "Survey PDF generated and sent", recipient: "Specified recipients" },
                  ].map((email) => (
                    <div key={email.type} className="grid grid-cols-3 gap-2 px-4 py-2.5 text-xs">
                      <span className="font-medium text-foreground">{email.type}</span>
                      <span>{email.trigger}</span>
                      <span className="text-right">{email.recipient}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2" id="platform-features">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <ClipboardCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-platform-features">Platform Features Summary</h2>
                <p className="text-sm text-muted-foreground">Complete feature overview</p>
              </div>
            </div>
            <Separator />
            <div className="pt-2 text-sm text-muted-foreground space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { title: "AI Scheduling", desc: "Upload work order PDFs and let AI extract details, suggest dates, estimate duration in 30-min increments, and auto-calculate end times" },
                  { title: "Site Surveys", desc: "Photo documentation with annotation tools (drawing, text, colors). Survey questionnaires configurable per owner. PDF reports with branded templates" },
                  { title: "PDF Branding", desc: "Custom templates for Project and Survey reports. Download blank template guide, design in any tool, upload as PDF or PNG. Full-page branded background" },
                  { title: "Install Manager Role", desc: "Extended user role for team leads. Can create/edit events, assign team members, send emails, upload files, and delete own events" },
                  { title: "Duplicate WO# Handling", desc: "Multi-visit jobs automatically get letter suffixes (A, B, C...) when the same work order number is reused" },
                  { title: "Google Calendar Sync", desc: "Optional integration to sync installation events with Google Calendar for team-wide visibility" },
                  { title: "Multi-Tenant Isolation", desc: "Each owner's team is independent. Users linked by createdBy field, not email domain. Complete data isolation between organizations" },
                  { title: "Email Sender Identity", desc: "Owners can customize their email sender name, reply-to address, and company information shown in outgoing emails" },
                ].map((feature) => (
                  <div key={feature.title} className="border rounded-lg p-4 hover:border-primary/30 transition-colors">
                    <h4 className="font-semibold text-foreground text-sm mb-1">{feature.title}</h4>
                    <p className="text-xs">{feature.desc}</p>
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
