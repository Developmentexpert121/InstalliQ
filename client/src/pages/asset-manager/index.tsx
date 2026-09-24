import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { usePageHeader } from "@/lib/page-header";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { FolderOpen, Loader2, Sparkles, CheckCircle2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import TabSearchAssets, { useTagProgress } from "./tab-search-assets";
import TabAccessHub from "./tab-access-hub";
import TabAssetSetup, { useSyncProgress } from "./tab-asset-setup";
import TabTagLibrary from "./tab-tag-library";

interface MyAccess {
  hasAccess: boolean;
  adminId: number | null;
}

export default function AssetManagerPage() {
  const { user } = useAuth();
  const { setHeaderInfo } = usePageHeader();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("search");

  // AI tagging banner
  const tagProgress = useTagProgress();
  const isTagging = tagProgress !== null && !tagProgress.complete && !tagProgress.error;
  const showTagBanner = activeTab !== "search" && tagProgress !== null && (isTagging || tagProgress.complete);
  const tagPct = tagProgress && tagProgress.total > 0
    ? Math.round((tagProgress.done / tagProgress.total) * 100)
    : (isTagging ? 0 : 100);

  // CompanyCam sync banner
  const syncProgress = useSyncProgress();
  const isSyncing = syncProgress !== null && !syncProgress.complete && !syncProgress.error;
  const showSyncBanner = syncProgress !== null && (isSyncing || syncProgress.complete);

  useEffect(() => {
    setHeaderInfo({
      title: "Asset Manager",
      description: "Upload, search and manage your installation assets",
      icon: <FolderOpen className="h-5 w-5 text-primary" />,
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo]);

  const { data: access, isLoading } = useQuery<MyAccess>({
    queryKey: ["/api/asset-manager/my-access"],
  });

  const role = user?.role ?? "";
  const isAdmin = role === "admin" || role === "super_admin";
  const isSuperAdmin = role === "super_admin";

  // If the active tab requires super_admin and the user isn't one, fall back to search
  useEffect(() => {
    const superAdminOnlyTabs = ["setup", "access", "tags"];
    if (!isSuperAdmin && superAdminOnlyTabs.includes(activeTab)) {
      setActiveTab("search");
    }
  }, [isSuperAdmin, activeTab]);

  useEffect(() => {
    if (!isLoading && !isAdmin && access && !access.hasAccess) {
      toast({
        title: "Access Denied",
        description: "Asset Manager has not been enabled for your account. Contact your administrator.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [isLoading, isAdmin, access, toast, setLocation]);

  if (isLoading || (!isAdmin && access && !access.hasAccess)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="flex flex-wrap h-auto gap-1 w-full" data-testid="tabs-asset-manager">
          <TabsTrigger value="search" data-testid="tab-search-assets">
            Search Assets
          </TabsTrigger>
          {isSuperAdmin && (
            <TabsTrigger value="setup" data-testid="tab-asset-setup">
              Asset Setup
            </TabsTrigger>
          )}
          {isSuperAdmin && (
            <TabsTrigger value="access" data-testid="tab-access-hub">
              Access Hub
            </TabsTrigger>
          )}
          {isSuperAdmin && (
            <TabsTrigger value="tags" data-testid="tab-tag-library">
              Tag Library
            </TabsTrigger>
          )}
        </TabsList>

        {/* Persistent CompanyCam sync banner — visible on all tabs */}
        {showSyncBanner && (
          <div
            className="mt-3 rounded-md border bg-muted/30 overflow-hidden"
            data-testid="banner-companycam-sync"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              {isSyncing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500 shrink-0" />
                  <span className="text-xs text-orange-600 dark:text-orange-400 flex-1" data-testid="text-sync-banner-status">
                    <span className="font-medium">CompanyCam Sync in progress</span>
                    {syncProgress && (
                      <> · <span className="font-semibold">{syncProgress.synced}</span> imported</>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-orange-700 hover:bg-orange-100 dark:text-orange-400"
                    onClick={() => setActiveTab("setup")}
                    data-testid="button-sync-banner-view"
                  >
                    View
                  </Button>
                </>
              ) : syncProgress?.complete ? (
                <>
                  {syncProgress.error ? (
                    <RefreshCw className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                  )}
                  <span className={`text-xs flex-1 ${
                    syncProgress.error ? "text-destructive" :
                    syncProgress.stopped ? "text-orange-600 dark:text-orange-400" :
                    "text-green-700 dark:text-green-400"
                  }`} data-testid="text-sync-banner-status">
                    {syncProgress.error
                      ? `CompanyCam Sync failed · ${syncProgress.error}`
                      : syncProgress.stopped
                      ? `CompanyCam Sync stopped · ${syncProgress.synced} imported`
                      : `CompanyCam Sync complete · ${syncProgress.synced} photo(s) synced`}
                  </span>
                </>
              ) : null}
            </div>
            <Progress
              value={isSyncing ? undefined : 100}
              className={`h-0.5 rounded-none ${
                syncProgress?.error
                  ? "[&>div]:bg-destructive"
                  : syncProgress?.stopped
                  ? "[&>div]:bg-orange-400"
                  : syncProgress?.complete
                  ? "[&>div]:bg-green-500"
                  : "[&>div]:bg-orange-500"
              }`}
              data-testid="progress-sync-banner"
            />
          </div>
        )}

        {/* Persistent AI tagging banner — visible on any tab except Search (which shows inline progress in Access Hub) */}
        {showTagBanner && (
          <div
            className="mt-3 rounded-md border bg-muted/30 overflow-hidden"
            data-testid="banner-ai-tag-progress"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              {isTagging ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500 shrink-0" />
                  <span className="text-xs text-orange-600 dark:text-orange-400 flex-1" data-testid="text-tag-banner-status">
                    <span className="font-medium">AI Tagging in progress</span>
                    {tagProgress && tagProgress.total > 0 && (
                      <> · {tagProgress.done} / {tagProgress.total}</>
                    )}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs text-orange-700 hover:bg-orange-100 dark:text-orange-400"
                    onClick={() => setActiveTab("search")}
                    data-testid="button-tag-banner-view"
                  >
                    View
                  </Button>
                </>
              ) : tagProgress?.complete ? (
                <>
                  {tagProgress.error ? (
                    <Sparkles className="h-3.5 w-3.5 text-destructive shrink-0" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400 shrink-0" />
                  )}
                  <span className={`text-xs flex-1 ${
                    tagProgress.error ? "text-destructive" :
                    tagProgress.stopped ? "text-orange-600 dark:text-orange-400" :
                    "text-green-700 dark:text-green-400"
                  }`} data-testid="text-tag-banner-status">
                    {tagProgress.error
                      ? "AI Tagging failed"
                      : tagProgress.stopped
                      ? `AI Tagging stopped · ${tagProgress.tagged ?? tagProgress.done - (tagProgress.failed ?? 0)} tagged`
                      : `AI Tagging complete · ${tagProgress.tagged ?? tagProgress.done - (tagProgress.failed ?? 0)} tagged`}
                  </span>
                </>
              ) : null}
            </div>
            {(isTagging || tagProgress?.complete) && (
              <Progress
                value={tagPct}
                className={`h-0.5 rounded-none ${
                  tagProgress?.error
                    ? "[&>div]:bg-destructive"
                    : tagProgress?.stopped
                    ? "[&>div]:bg-orange-400"
                    : tagProgress?.complete
                    ? "[&>div]:bg-green-500"
                    : "[&>div]:bg-orange-500"
                }`}
                data-testid="progress-tag-banner"
              />
            )}
          </div>
        )}

        <TabsContent value="search" className="mt-6">
          <TabSearchAssets />
        </TabsContent>

        {isSuperAdmin && (
          <TabsContent value="setup" className="mt-6">
            <TabAssetSetup onGoToSearch={() => setActiveTab("search")} />
          </TabsContent>
        )}

        {isSuperAdmin && (
          <TabsContent value="access" className="mt-6">
            <TabAccessHub />
          </TabsContent>
        )}

        {isSuperAdmin && (
          <TabsContent value="tags" className="mt-6">
            <TabTagLibrary />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
