import { useEffect, useState } from "react";
import { usePageHeader } from "@/lib/page-header";
import { Code2, Server, Database, Globe, Key, Layers, ChevronRight, ExternalLink, Terminal, Cpu } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const sections = [
  { id: "architecture", label: "System Architecture" },
  { id: "tech-stack", label: "Technology Stack" },
  { id: "api", label: "API Reference" },
  { id: "database", label: "Database Schema" },
  { id: "env", label: "Environment Variables" },
  { id: "services", label: "External Services" },
];

export default function DeveloperGuidePage() {
  const { setHeaderInfo } = usePageHeader();
  const [activeSection, setActiveSection] = useState("architecture");

  useEffect(() => {
    setHeaderInfo({
      title: "Developer Guide",
      description: "Technical documentation for developers",
      icon: <Code2 className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
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
          <div className="space-y-2" id="architecture">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Layers className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-architecture">System Architecture</h2>
                <p className="text-sm text-muted-foreground">High-level overview of InstalliQ.ai</p>
              </div>
            </div>
            <Separator />
            <div className="grid sm:grid-cols-3 gap-4 pt-2">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="h-4 w-4 text-blue-500" />
                    <h3 className="font-semibold text-sm">Frontend</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">React 18 SPA with TypeScript, served via Vite. Uses Shadcn/ui components, Tailwind CSS, and TanStack Query for server state.</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="h-4 w-4 text-green-500" />
                    <h3 className="font-semibold text-sm">Backend</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">Express.js server with TypeScript. RESTful JSON APIs, session-based auth, Multer for file uploads. Serves both API and frontend.</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="h-4 w-4 text-purple-500" />
                    <h3 className="font-semibold text-sm">Database</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">PostgreSQL with Drizzle ORM for type-safe queries. DigitalOcean managed database in production with SSL connections.</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="space-y-2" id="tech-stack">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Cpu className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-tech-stack">Technology Stack</h2>
                <p className="text-sm text-muted-foreground">Libraries and frameworks used</p>
              </div>
            </div>
            <Separator />
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              {[
                { category: "Frontend Core", items: ["React 18", "TypeScript", "Vite", "Wouter", "TanStack Query v5"] },
                { category: "UI & Styling", items: ["Shadcn/ui (Radix UI)", "Tailwind CSS", "Lucide Icons", "react-icons", "Fabric.js (annotations)"] },
                { category: "Backend Core", items: ["Express.js", "TypeScript", "express-session", "Multer", "cors"] },
                { category: "Database & ORM", items: ["PostgreSQL", "Drizzle ORM", "drizzle-zod", "Drizzle Kit", "Auto-migration"] },
                { category: "Authentication", items: ["bcrypt", "express-session", "otpauth (TOTP 2FA)", "face-api.js", "Google OAuth"] },
                { category: "AI & Processing", items: ["OpenAI GPT-4o", "OpenAI Assistants API", "Vision API", "PDFKit", "pdftoppm"] },
                { category: "Cloud & Storage", items: ["DigitalOcean Spaces (S3)", "Replit Object Storage", "AWS SDK v3"] },
                { category: "Utilities", items: ["Nodemailer", "date-fns-tz", "Razorpay SDK", "OpenWeather API", "Google Calendar API"] },
              ].map((group) => (
                <div key={group.category} className="border rounded-lg p-4">
                  <h3 className="font-semibold text-sm mb-2">{group.category}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {group.items.map((item) => (
                      <Badge key={item} variant="secondary" className="text-xs font-normal">{item}</Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2" id="api">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Terminal className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-api">API Reference</h2>
                <p className="text-sm text-muted-foreground">REST API endpoints organized by resource</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-4 pt-2">
              {[
                {
                  group: "Authentication",
                  endpoints: [
                    { method: "POST", path: "/api/auth/login", desc: "Authenticate user with email/phone and password" },
                    { method: "POST", path: "/api/auth/logout", desc: "End current session" },
                    { method: "GET", path: "/api/auth/me", desc: "Get authenticated user profile" },
                    { method: "POST", path: "/api/auth/forgot-password", desc: "Request password reset email" },
                    { method: "POST", path: "/api/auth/reset-password", desc: "Reset password with token" },
                  ],
                },
                {
                  group: "Calendar & Scheduling",
                  endpoints: [
                    { method: "GET", path: "/api/calendar-events", desc: "List all calendar events for the owner" },
                    { method: "POST", path: "/api/calendar-events", desc: "Create a new calendar event/booking" },
                    { method: "PATCH", path: "/api/calendar-events/:id", desc: "Update an existing event" },
                    { method: "DELETE", path: "/api/calendar-events/:id", desc: "Delete a calendar event" },
                    { method: "POST", path: "/api/calendar-events/extract-file-data", desc: "AI extraction from uploaded PDF" },
                    { method: "POST", path: "/api/calendar-events/ai-schedule", desc: "AI-powered scheduling suggestion" },
                  ],
                },
                {
                  group: "Projects & Photos",
                  endpoints: [
                    { method: "GET", path: "/api/projects", desc: "List all projects" },
                    { method: "POST", path: "/api/projects", desc: "Create project with photos (multipart)" },
                    { method: "GET", path: "/api/projects/:id", desc: "Get project details with attachments" },
                    { method: "GET", path: "/api/projects/:id/report", desc: "Generate and download PDF report" },
                    { method: "POST", path: "/api/projects/:id/email-report", desc: "Email PDF report" },
                  ],
                },
                {
                  group: "Site Surveys",
                  endpoints: [
                    { method: "GET", path: "/api/surveys", desc: "List all surveys for the owner" },
                    { method: "POST", path: "/api/surveys", desc: "Create a new site survey" },
                    { method: "GET", path: "/api/surveys/:id", desc: "Get survey details with photos" },
                    { method: "PATCH", path: "/api/surveys/:id", desc: "Update survey details" },
                    { method: "GET", path: "/api/surveys/:id/report", desc: "Generate survey PDF report" },
                    { method: "POST", path: "/api/surveys/:id/email-report", desc: "Email survey PDF report" },
                  ],
                },
                {
                  group: "PDF Branding",
                  endpoints: [
                    { method: "GET", path: "/api/auth/pdf-branding", desc: "Get current PDF branding settings" },
                    { method: "PATCH", path: "/api/auth/pdf-branding", desc: "Update company info for PDFs" },
                    { method: "POST", path: "/api/auth/pdf-branding/logo", desc: "Upload company logo" },
                    { method: "POST", path: "/api/auth/pdf-branding/template", desc: "Upload branded PDF template" },
                    { method: "DELETE", path: "/api/auth/pdf-branding/template", desc: "Remove branded PDF template" },
                    { method: "GET", path: "/api/auth/pdf-branding/template/blank", desc: "Download blank template guide" },
                  ],
                },
                {
                  group: "Administration",
                  endpoints: [
                    { method: "GET", path: "/api/admin/users", desc: "List all users (admin only)" },
                    { method: "POST", path: "/api/admin/users", desc: "Create new user account" },
                    { method: "DELETE", path: "/api/admin/users/:id", desc: "Delete user account" },
                    { method: "POST", path: "/api/admin/users/:id/reset-password", desc: "Admin-initiated password reset" },
                    { method: "GET", path: "/api/activity-logs", desc: "View audit trail (super admin)" },
                  ],
                },
                {
                  group: "Subscriptions & Payments",
                  endpoints: [
                    { method: "GET", path: "/api/subscription-plans", desc: "List available plans" },
                    { method: "POST", path: "/api/payment/create-plan-order", desc: "Create Razorpay order for plan" },
                    { method: "POST", path: "/api/payment/verify-plan", desc: "Verify Razorpay payment" },
                    { method: "GET", path: "/api/subscription/my-subscription", desc: "Get current subscription status" },
                  ],
                },
              ].map((section) => (
                <div key={section.group} className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 px-4 py-2.5 border-b">
                    <h3 className="font-semibold text-sm">{section.group}</h3>
                  </div>
                  <div className="divide-y">
                    {section.endpoints.map((ep, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                        <Badge
                          variant="outline"
                          className={`text-xs font-mono flex-shrink-0 min-w-[52px] justify-center ${ep.method === "GET" ? "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400" : ep.method === "POST" ? "border-green-300 text-green-600 dark:border-green-700 dark:text-green-400" : ep.method === "PATCH" ? "border-yellow-300 text-yellow-600 dark:border-yellow-700 dark:text-yellow-400" : "border-red-300 text-red-600 dark:border-red-700 dark:text-red-400"}`}
                        >
                          {ep.method}
                        </Badge>
                        <code className="text-xs font-mono flex-shrink-0 text-foreground">{ep.path}</code>
                        <span className="text-xs text-muted-foreground ml-auto text-right">{ep.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2" id="database">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Database className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-database">Database Schema</h2>
                <p className="text-sm text-muted-foreground">Key data models and relationships</p>
              </div>
            </div>
            <Separator />
            <div className="grid sm:grid-cols-2 gap-3 pt-2">
              {[
                { name: "users", desc: "User accounts with role-based access (super_admin, admin, user)", fields: "id, username, email, phone, password, role, name, ownerId, onboardingCompleted, tempPassword, twoFactorSecret, pdfLogoUrl, pdfTemplateUrl, pdfCompanyName, installManager" },
                { name: "calendar_events", desc: "Installation bookings and scheduling", fields: "id, title, description, startTime, endTime, duration, status, ownerId, assignedUserIds, workJobNumber, customerName, customerEmail, secondaryPocName" },
                { name: "projects", desc: "Completed project records with photos", fields: "id, userId, jobLabel, description, tags, status, hasIssue, customerName, address, createdAt, hasFinishedPhotos" },
                { name: "surveys", desc: "Site survey records linked to projects", fields: "id, projectId, userId, ownerId, notes, status, questionnaireResponses, createdAt" },
                { name: "survey_photos", desc: "Photos attached to site surveys with annotations", fields: "id, surveyId, originalImageUrl, annotatedImageUrl, caption, sortOrder" },
                { name: "jobs", desc: "Work orders linked to calendar events", fields: "id, calendarEventId, workOrderNumber, customerName, formattedAddress, status" },
                { name: "attachments", desc: "File uploads for projects", fields: "id, projectId, url, type, filename, size" },
                { name: "questionnaire_groups", desc: "Survey question groups per owner", fields: "id, ownerId, name, sortOrder" },
                { name: "questionnaire_questions", desc: "Individual survey questions", fields: "id, groupId, ownerId, text, type, options, sortOrder" },
                { name: "notification_logs", desc: "Email and notification audit trail", fields: "id, type, toEmail, ccEmails, subject, jobId, sentAt" },
                { name: "activity_logs", desc: "System-wide action audit trail", fields: "id, userId, action, description, resourceType, resourceId, metadata, createdAt" },
                { name: "subscription_plans", desc: "Billing plans configuration", fields: "id, name, description, price, eventLimit, features, isActive" },
                { name: "admin_subscriptions", desc: "Owner subscription records", fields: "id, adminId, planId, status, razorpayOrderId, startDate, endDate" },
                { name: "owner_tags", desc: "Custom per-owner tags", fields: "id, ownerId, name, color, createdAt" },
                { name: "reschedule_requests", desc: "Customer reschedule requests", fields: "id, calendarEventId, requestedDate, reason, status, token" },
                { name: "onboarding_forms", desc: "Owner onboarding data", fields: "id, userId, businessName, businessType, companySize, completedAt" },
              ].map((table) => (
                <div key={table.name} className="border rounded-lg p-4 hover:border-primary/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-sm font-semibold font-mono text-primary">{table.name}</code>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{table.desc}</p>
                  <p className="text-[11px] text-muted-foreground/70 font-mono leading-relaxed">{table.fields}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2" id="env">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <Key className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-env">Environment Variables</h2>
                <p className="text-sm text-muted-foreground">Required configuration for deployment</p>
              </div>
            </div>
            <Separator />
            <div className="border rounded-lg overflow-hidden pt-2">
              <div className="divide-y">
                {[
                  { name: "DATABASE_URL", desc: "PostgreSQL connection string", required: true },
                  { name: "DIGITALOCEAN_DATABASE_URL", desc: "DigitalOcean managed database connection", required: true },
                  { name: "SESSION_SECRET", desc: "Express session encryption key", required: true },
                  { name: "OPENAI_API_KEY", desc: "OpenAI API key for AI features (GPT-4o, Vision, Assistants)", required: true },
                  { name: "OPENAI_ASSISTANT_ID", desc: "Default OpenAI Assistant ID", required: false },
                  { name: "SMTP_USER", desc: "SMTP email username for Nodemailer", required: true },
                  { name: "SMTP_PASS", desc: "SMTP email password for Nodemailer", required: true },
                  { name: "DO_SPACES_KEY", desc: "DigitalOcean Spaces access key", required: true },
                  { name: "DO_SPACES_SECRET", desc: "DigitalOcean Spaces secret key", required: true },
                  { name: "OPENWEATHER_API_KEY", desc: "OpenWeather API key for weather and geocoding", required: false },
                  { name: "GOOGLE_CLIENT_ID", desc: "Google OAuth client ID for Calendar integration", required: false },
                  { name: "GOOGLE_CLIENT_SECRET", desc: "Google OAuth client secret", required: false },
                ].map((env) => (
                  <div key={env.name} className="flex items-center gap-3 px-4 py-2.5">
                    <code className="text-xs font-mono font-semibold text-foreground min-w-[220px]">{env.name}</code>
                    <span className="text-xs text-muted-foreground flex-1">{env.desc}</span>
                    <Badge variant={env.required ? "default" : "secondary"} className="text-[10px] flex-shrink-0">
                      {env.required ? "Required" : "Optional"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2" id="services">
            <div className="flex items-center gap-3 mb-1">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                <ExternalLink className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold tracking-tight" data-testid="text-section-services">External Services</h2>
                <p className="text-sm text-muted-foreground">Third-party integrations and their usage</p>
              </div>
            </div>
            <Separator />
            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              {[
                { name: "OpenAI API", purpose: "AI-powered features", details: "Image analysis & auto-tagging, PDF work order data extraction (Vision API), AI scheduling suggestions with duration estimation, per-admin custom assistants with knowledge files" },
                { name: "DigitalOcean Spaces", purpose: "Cloud file storage", details: "S3-compatible object storage for all file uploads including project photos, survey photos, annotated images, work order PDFs, branded templates, and generated reports" },
                { name: "Razorpay", purpose: "Payment processing", details: "Subscription payment gateway for Owner plan purchases. Handles order creation, payment verification, and webhook callbacks" },
                { name: "OpenWeather API", purpose: "Weather & geocoding", details: "5-day weather forecasts displayed on the calendar, and geocoding for converting addresses to coordinates for map navigation" },
                { name: "Nodemailer (SMTP)", purpose: "Email delivery", details: "Automated email notifications for welcome emails, password resets, booking confirmations, assignment emails, issue reports, project reports, and survey reports" },
                { name: "Google Calendar", purpose: "Calendar sync", details: "Google Calendar integration for syncing installation events. OAuth-based authentication with optional calendar sync for team-wide visibility" },
              ].map((service) => (
                <Card key={service.name} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-semibold text-sm">{service.name}</h3>
                      <Badge variant="outline" className="text-[10px]">{service.purpose}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{service.details}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="h-16" />
        </div>
      </div>
    </div>
  );
}
