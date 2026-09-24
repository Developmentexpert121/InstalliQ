import { useLocation, Link } from "wouter";
const installiqLogo = "/installiq-logo.png";
import { useQuery } from "@tanstack/react-query";
import { useNotificationSound } from "@/hooks/use-notification-sound";
import { useState } from "react";
import { 
  Camera, 
  LayoutDashboard, 
  Plus, 
  Calendar, 
  Bell,
  Briefcase,
  Settings,
  LogOut,
  User,
  Users,
  ChevronDown,
  ChevronRight,
  ScrollText,
  CreditCard,
  Code2,
  BookOpen,
  Shield,
  ShieldCheck,
  FileText,
  ClipboardList,
  ClipboardCheck,
  Timer,
  Mail,
  HelpCircle,
  FolderOpen,
  MessageSquarePlus,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";

const menuItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Install Calendar",
    url: "/google-calendar",
    icon: Calendar,
  },
  {
    title: "Completed Photos",
    url: "/projects/new",
    icon: Camera,
  },
  {
    title: "Site Surveys",
    url: "/surveys",
    icon: ClipboardCheck,
  },
  {
    title: "Install Time Estimator",
    url: "/time-estimator",
    icon: Timer,
  },
  {
    title: "Asset Manager",
    url: "/assets",
    icon: FolderOpen,
  },
  {
    title: "My Jobs",
    url: "/my-jobs",
    icon: Briefcase,
  },
  {
    title: "Activity Log",
    url: "/activity-logs",
    icon: ScrollText,
  },
];

const userDocsItems = [
  {
    title: "User Manual",
    url: "/docs/user-manual",
    icon: BookOpen,
  },
];

const adminDocsItems = [
  {
    title: "User Manual",
    url: "/docs/user-manual",
    icon: BookOpen,
  },
  {
    title: "Owner Admin Manual",
    url: "/docs/owner-admin-manual",
    icon: Shield,
  },
];

const superAdminDocsItems = [
  {
    title: "Developer Guide",
    url: "/docs/developer-guide",
    icon: Code2,
  },
  {
    title: "User Manual",
    url: "/docs/user-manual",
    icon: BookOpen,
  },
  {
    title: "Owner Admin Manual",
    url: "/docs/owner-admin-manual",
    icon: Shield,
  },
  {
    title: "Super Admin Manual",
    url: "/docs/super-admin-manual",
    icon: ShieldCheck,
  },
];

const adminMenuItems = [
  {
    title: "User Management",
    url: "/admin",
    icon: Users,
    superAdminOnly: false,
    // Hidden from the sidebar for all users (route + page still work directly).
    // User/admin management is now centralized in SignSuiteIQ.
    hidden: true,
  },
  {
    title: "Questionnaire Setup",
    url: "/admin/questionnaire",
    icon: ClipboardList,
    superAdminOnly: false,
  },
  {
    title: "Email Templates",
    url: "/email-templates",
    icon: Mail,
    superAdminOnly: false,
  },
  {
    title: "Reschedule Requests",
    url: "/notifications",
    icon: Bell,
    superAdminOnly: false,
  },
  {
    title: "Subscription Plans",
    url: "/subscription-plans",
    icon: CreditCard,
    superAdminOnly: false,
    // Hidden from the sidebar for all users (route + page still work directly).
    // Subscriptions/plans are now centralized in SignSuiteIQ.
    hidden: true,
  },
  {
    title: "Feedback Inbox",
    url: "/admin/feedback",
    icon: MessageSquarePlus,
    superAdminOnly: true,
  },
];

interface RescheduleRequest {
  id: number;
  status: string;
}

interface InstallerNotificationItem {
  id: number;
  status: string;
  readAt: string | null;
}

export function AppSidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { setOpenMobile } = useSidebar();
  const [docsExpanded, setDocsExpanded] = useState(false);

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isInstallManager = user?.role === "user" && user?.jobTitle === "Install Manager";
  const { data: rescheduleRequests = [] } = useQuery<RescheduleRequest[]>({
    queryKey: ["/api/reschedule-requests"],
    enabled: isAdmin || isInstallManager,
    refetchInterval: 30000,
  });
  const pendingCount = rescheduleRequests.filter(r => r.status === "pending").length;

  const isUser = user?.role === "user";
  const { data: installerNotifications = [] } = useQuery<InstallerNotificationItem[]>({
    queryKey: ["/api/installer-notifications"],
    enabled: isUser,
    refetchInterval: 30000,
  });
  const jobNotifCount = installerNotifications.filter(n => n.status === "pending" && !n.readAt).length;

  useNotificationSound(isAdmin ? pendingCount : jobNotifCount);

  const { data: assetAccess } = useQuery<{ hasAccess: boolean; adminId: number | null }>({
    queryKey: ["/api/asset-manager/my-access"],
    enabled: !!user,
  });

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-4">
        <Link href="/dashboard" onClick={() => setOpenMobile(false)} className="flex items-center">
          <img src={installiqLogo} alt="InstalliQ.ai" className="h-14 object-contain rounded" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.filter((item) => {
                if (item.title === "My Jobs" && !isUser) return false;
                if (item.title === "Install Time Estimator" && user?.role === "super_admin") return false;
                if (item.title === "Asset Manager" && !assetAccess?.hasAccess) return false;
                return true;
              }).map((item) => {
                const isActive = location === item.url || 
                  (item.url === "/dashboard" && location.startsWith("/projects/") && location !== "/projects/new");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.url} onClick={() => setOpenMobile(false)} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="h-4 w-4" />
                        <span className="flex-1">{item.title}</span>
                        {item.title === "My Jobs" && jobNotifCount > 0 && (
                          <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0" data-testid="badge-job-notification-count">
                            {jobNotifCount}
                          </Badge>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {isAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.filter((item) => !(item as { hidden?: boolean }).hidden && (!item.superAdminOnly || user?.role === "super_admin")).map((item) => {
                  const isActive = location === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.url} onClick={() => setOpenMobile(false)} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                          <item.icon className="h-4 w-4" />
                          <span className="flex-1">{item.title}</span>
                          {item.title === "Reschedule Requests" && pendingCount > 0 && (
                            <Badge variant="destructive" className="ml-auto text-xs px-1.5 py-0" data-testid="badge-notification-count">
                              {pendingCount}
                            </Badge>
                          )}
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setDocsExpanded(!docsExpanded)}
                  data-testid="nav-documentation-toggle"
                  className="cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  <span className="flex-1">User Guide</span>
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${docsExpanded ? "rotate-90" : ""}`} />
                </SidebarMenuButton>
              </SidebarMenuItem>
              {docsExpanded && (user?.role === "super_admin" ? superAdminDocsItems : user?.role === "admin" ? adminDocsItems : userDocsItems).map((item) => {
                const isActive = location === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive} className="pl-8">
                      <Link href={item.url} onClick={() => setOpenMobile(false)} data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, "-")}`}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="flex items-center gap-2">
          <Link
            href={user?.role === "super_admin" ? "/docs/super-admin-manual" : user?.role === "admin" ? "/docs/owner-admin-manual" : "/docs/user-manual"}
            onClick={() => setOpenMobile(false)}
            className="flex items-center justify-center h-9 w-9 rounded-lg border bg-muted/30 hover:bg-muted transition-colors flex-shrink-0"
            data-testid="button-help-docs"
            title="Help & Documentation"
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 flex-1 p-2 rounded-lg hover-elevate text-left min-w-0" data-testid="button-user-menu">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">
                    {user?.name ? getInitials(user.name) : "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{user?.name || "User"}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {user?.role === "super_admin" ? "Admin" : user?.role === "admin" ? "Owner" : (user as any)?.jobTitle || user?.role || "creator"}
                    </Badge>
                  </div>
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem className="flex-col items-start">
              <p className="font-medium">{user?.name}</p>
              <p className="text-xs text-muted-foreground">@{user?.username}</p>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <Link href="/account" onClick={() => setOpenMobile(false)}>
              <DropdownMenuItem data-testid="button-account-settings">
                <Settings className="h-4 w-4 mr-2" />
                Account Settings
              </DropdownMenuItem>
            </Link>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} data-testid="button-logout">
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
