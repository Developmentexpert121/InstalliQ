import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { format } from "date-fns";
import { 
  Search, 
  Plus, 
  Calendar, 
  Grid3X3, 
  List, 
  Download, 
  Mail, 
  Tag,
  Loader2,
  Camera,
  AlertTriangle,
  Filter,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  X,
  Edit2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { getImageUrl } from "@/lib/image-url";
import { LazyImage } from "@/components/ui/lazy-image";
import { usePageHeader } from "@/lib/page-header";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

export default function DashboardPage() {
  const { setHeaderInfo } = usePageHeader();
  const { toast } = useToast();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const isInstallManager = user?.role === "user" && user?.jobTitle === "Install Manager";

  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagType, setEditingTagType] = useState<"global" | "owner" | null>(null);

  const { data: globalTags = [] } = useQuery<{ id: number; name: string; color: string | null; createdAt: string }[]>({
    queryKey: ["/api/global-tags"],
    enabled: isAdmin || isInstallManager,
  });

  const { data: ownerTags = [] } = useQuery<{ id: number; name: string; color: string | null; ownerId: number; createdAt: string }[]>({
    queryKey: ["/api/owner-tags"],
    enabled: (isAdmin && !isSuperAdmin) || isInstallManager,
  });

  const createGlobalTagMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await apiRequest("POST", "/api/global-tags", data);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create global tag"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] }); setNewTagName(""); toast({ title: "Global Tag Created" }); },
    onError: (error: Error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const updateGlobalTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name?: string } }) => {
      const res = await apiRequest("PATCH", `/api/global-tags/${id}`, data);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] }); setEditingTagId(null); setEditingTagType(null); toast({ title: "Global Tag Updated" }); },
    onError: (error: Error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const deleteGlobalTagMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/global-tags/${id}`);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to delete"); }
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] }); toast({ title: "Global Tag Deleted" }); },
    onError: (error: Error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      const res = await apiRequest("POST", "/api/owner-tags", data);
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to create tag"); }
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] }); setNewTagName(""); toast({ title: "Tag Created" }); },
    onError: (error: Error) => { toast({ title: "Error", description: error.message, variant: "destructive" }); },
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name?: string } }) => {
      const res = await apiRequest("PATCH", `/api/owner-tags/${id}`, data);
      return res.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] }); setEditingTagId(null); setEditingTagType(null); toast({ title: "Tag Updated" }); },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: number) => { await apiRequest("DELETE", `/api/owner-tags/${id}`); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] }); toast({ title: "Tag Deleted" }); },
  });

  useEffect(() => {
    setHeaderInfo({
      title: "Dashboard",
      description: "View and manage completed photo documentation",
      icon: <LayoutDashboard className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
      actions: (
        <div className="flex items-center gap-2">
          {(isAdmin || isInstallManager) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={() => setIsTagsOpen(true)}
                  variant="outline"
                  size="sm"
                  data-testid="button-tags"
                >
                  <Tag className="h-4 w-4" />
                  <span className="hidden sm:inline ml-1">Tags</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent><p>Manage Photo Tags</p></TooltipContent>
            </Tooltip>
          )}
          <Link href="/projects/new">
            <Button data-testid="button-completed-photos">
              <Camera className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Completed Photos</span>
            </Button>
          </Link>
        </div>
      ),
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo, isAdmin, isInstallManager]);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [issueFilter, setIssueFilter] = useState<"all" | "issues" | "no-issues">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExporting, setIsExporting] = useState(false);
  const [showExportPicker, setShowExportPicker] = useState(false);
  const [exportImageFilters, setExportImageFilters] = useState<Record<number, Set<string>>>({});
  const [pendingExportAll, setPendingExportAll] = useState(false);
  const PROJECTS_PER_PAGE = 12;

  const isAdminOrSuper = user?.role === "admin" || user?.role === "super_admin" || isInstallManager;

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
    staleTime: 60000,
  });

  const filteredProjects = projects?.filter((project) => {
    if (!project.hasFinishedPhotos) {
      return false;
    }
    
    const query = searchQuery.toLowerCase();
    const matchesManualTags = project.tags?.some((tag) => 
      tag.toLowerCase().includes(query)
    );
    const matchesAiTags = project.aiSuggestedTags?.some((tag) => 
      tag.toLowerCase().includes(query)
    );
    const matchesDescription = project.description?.toLowerCase().includes(query);
    const matchesJobLabel = project.jobLabel?.toLowerCase().includes(query);
    const matchesIssueDescription = project.issueDescription?.toLowerCase().includes(query);
    const matchesSearch = matchesManualTags || matchesAiTags || matchesDescription || matchesJobLabel || matchesIssueDescription || !searchQuery;
    
    const matchesIssue = issueFilter === "all" || 
      (issueFilter === "issues" && project.hasIssue) || 
      (issueFilter === "no-issues" && !project.hasIssue);
    
    return matchesSearch && matchesIssue;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, issueFilter]);

  const totalPages = filteredProjects ? Math.ceil(filteredProjects.length / PROJECTS_PER_PAGE) : 0;
  const paginatedProjects = filteredProjects?.slice(
    (currentPage - 1) * PROJECTS_PER_PAGE,
    currentPage * PROJECTS_PER_PAGE
  );

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (filteredProjects) {
      setSelectedIds(new Set(filteredProjects.map(p => p.id)));
    }
  }, [filteredProjects]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleExport = useCallback(async (exportAll: boolean, imageFiltersOverride?: Record<number, Set<string>>) => {
    if (!exportAll && selectedIds.size === 0) return;
    setIsExporting(true);
    setShowExportPicker(false);
    try {
      const body: any = {};
      if (!exportAll) {
        body.projectIds = Array.from(selectedIds);
      }
      // Convert Set<string> → string[] for JSON serialisation
      const filtersToSend = imageFiltersOverride ?? exportImageFilters;
      const filtersJson: Record<number, string[]> = {};
      for (const [id, urlSet] of Object.entries(filtersToSend)) {
        filtersJson[Number(id)] = Array.from(urlSet as Set<string>);
      }
      if (Object.keys(filtersJson).length > 0) {
        body.imageFilters = filtersJson;
      }

      const response = await fetch("/api/projects/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Export failed" }));
        throw new Error(err.error || "Export failed");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const contentType = response.headers.get("Content-Type") || "";
      let filename = `projects_export_${format(new Date(), "yyyy-MM-dd")}.zip`;
      const filenameMatch = contentDisposition.match(/filename="?([^";\n]+)"?/);
      if (filenameMatch) {
        filename = filenameMatch[1];
      } else if (contentType.includes("pdf")) {
        filename = `project_export_${format(new Date(), "yyyy-MM-dd")}.pdf`;
      }
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({ title: "Export Complete", description: "Your project files have been downloaded." });
      exitSelectionMode();
    } catch (error: any) {
      toast({ title: "Export Failed", description: error.message || "Failed to export projects", variant: "destructive" });
    } finally {
      setIsExporting(false);
    }
  }, [selectedIds, toast, exitSelectionMode, exportImageFilters]);

  const openExportPicker = useCallback((exportAll: boolean) => {
    const projectsToExport = exportAll
      ? (filteredProjects || [])
      : (filteredProjects || []).filter(p => selectedIds.has(p.id));
    const multiImageProjects = projectsToExport.filter(p => (p.imageUrls?.length || 0) > 1);
    if (multiImageProjects.length === 0) {
      handleExport(exportAll, {});
      return;
    }
    const initial: Record<number, Set<string>> = {};
    for (const p of projectsToExport) {
      initial[p.id] = new Set(p.imageUrls || []);
    }
    setPendingExportAll(exportAll);
    setExportImageFilters(initial);
    setShowExportPicker(true);
  }, [filteredProjects, selectedIds, handleExport]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-col gap-3 p-3 sm:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search by tags, description, or job label..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-search"
            />
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap">
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
              <Filter className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Filter:</span>
            </div>
            <div className="flex items-center border rounded-md">
              <Button
                variant={issueFilter === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setIssueFilter("all")}
                data-testid="button-filter-all"
              >
                All
              </Button>
              <Button
                variant={issueFilter === "issues" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setIssueFilter("issues")}
                className={issueFilter === "issues" ? "text-red-600 dark:text-red-400" : ""}
                data-testid="button-filter-issues"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                <span className="hidden xs:inline">With </span>Issues
              </Button>
              <Button
                variant={issueFilter === "no-issues" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setIssueFilter("no-issues")}
                data-testid="button-filter-no-issues"
              >
                No Issues
              </Button>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {isAdminOrSuper && !selectionMode && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectionMode(true)}
                  data-testid="button-export-mode"
                  className="px-2 sm:px-3"
                >
                  <Download className="h-4 w-4 sm:mr-1" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              )}
              <div className="flex items-center border rounded-md">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("grid")}
                  data-testid="button-view-grid"
                >
                  <Grid3X3 className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setViewMode("list")}
                  data-testid="button-view-list"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {selectionMode && (
            <div className="flex items-center gap-3 flex-wrap rounded-lg border border-primary/20 bg-primary/5 px-3 py-2">
              <div className="flex items-center gap-3 shrink-0">
                <Badge variant="secondary" className="text-xs font-medium">
                  {selectedIds.size} of {filteredProjects?.length || 0}
                </Badge>
                <div className="h-4 w-px bg-border" />
                <button
                  onClick={selectedIds.size === filteredProjects?.length ? deselectAll : selectAll}
                  className="text-xs font-medium text-primary hover:underline"
                  data-testid="button-select-all"
                >
                  {selectedIds.size === filteredProjects?.length ? "Deselect All" : "Select All"}
                </button>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => openExportPicker(false)}
                  disabled={selectedIds.size === 0 || isExporting}
                  data-testid="button-export-selected"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                  Export Selected ({selectedIds.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openExportPicker(true)}
                  disabled={isExporting}
                  data-testid="button-export-all"
                >
                  {isExporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                  Export All
                </Button>
                <Button variant="ghost" size="icon" onClick={exitSelectionMode} data-testid="button-cancel-selection">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {filteredProjects && (
            <div className="text-xs text-muted-foreground">
              {filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""} found
            </div>
          )}
        </div>
      </div>

      <main className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
        {isLoading ? (
          viewMode === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-0">
                    <Skeleton className="aspect-video w-full rounded-t-md" />
                    <div className="p-4 space-y-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                      <div className="flex gap-2">
                        <Skeleton className="h-6 w-16" />
                        <Skeleton className="h-6 w-16" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex gap-4">
                      <Skeleton className="w-24 h-24 rounded-md flex-shrink-0" />
                      <div className="flex-1 space-y-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-4 w-1/2" />
                        <div className="flex gap-2">
                          <Skeleton className="h-6 w-16" />
                          <Skeleton className="h-6 w-16" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        ) : paginatedProjects && paginatedProjects.length > 0 ? (
          <div className="space-y-4">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(project.id)}
                    onToggle={toggleSelection}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {paginatedProjects.map((project) => (
                  <ProjectListItem
                    key={project.id}
                    project={project}
                    selectionMode={selectionMode}
                    isSelected={selectedIds.has(project.id)}
                    onToggle={toggleSelection}
                  />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
                <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                  Showing {((currentPage - 1) * PROJECTS_PER_PAGE) + 1}-{Math.min(currentPage * PROJECTS_PER_PAGE, filteredProjects!.length)} of {filteredProjects!.length} projects
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    data-testid="button-prev-page"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <Button
                        key={page}
                        variant={currentPage === page ? "default" : "outline"}
                        size="sm"
                        className="w-9"
                        onClick={() => setCurrentPage(page)}
                        data-testid={`button-page-${page}`}
                      >
                        {page}
                      </Button>
                    ))}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    data-testid="button-next-page"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState searchQuery={searchQuery} />
        )}
      </main>

      <Dialog open={isTagsOpen} onOpenChange={(open) => { setIsTagsOpen(open); if (!open) { setEditingTagId(null); setEditingTagType(null); setNewTagName(""); } }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-primary" />
              Photo Tags
            </DialogTitle>
            <DialogDescription>
              {isSuperAdmin
                ? "Manage global tags visible to all owners and users for photo documentation"
                : "Global tags are available to everyone. You can also add your own custom tags below."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 overflow-y-auto flex-1 pr-1">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Global Tags</h4>
                {isSuperAdmin && (
                  <span className="text-xs text-muted-foreground">{globalTags.length} tags</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2" data-testid="dashboard-global-tags-list">
                {globalTags.map((tag) => (
                  <Badge
                    key={`global-${tag.id}`}
                    variant="outline"
                    className="px-3 py-1.5 text-sm font-medium border-slate-300 dark:border-slate-600 text-slate-800 dark:text-slate-200 flex items-center gap-1"
                    data-testid={`dashboard-tag-badge-global-${tag.id}`}
                  >
                    {editingTagId === tag.id && editingTagType === "global" ? (
                      <input
                        className="bg-transparent border-none outline-none text-sm w-24"
                        defaultValue={tag.name}
                        autoFocus
                        onBlur={(e) => {
                          const newName = e.target.value.trim();
                          if (newName && newName !== tag.name) {
                            updateGlobalTagMutation.mutate({ id: tag.id, data: { name: newName } });
                          } else { setEditingTagId(null); setEditingTagType(null); }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const newName = (e.target as HTMLInputElement).value.trim();
                            if (newName && newName !== tag.name) { updateGlobalTagMutation.mutate({ id: tag.id, data: { name: newName } }); }
                            else { setEditingTagId(null); setEditingTagType(null); }
                          } else if (e.key === "Escape") { setEditingTagId(null); setEditingTagType(null); }
                        }}
                        data-testid={`dashboard-input-edit-global-tag-${tag.id}`}
                      />
                    ) : (
                      <>
                        {tag.name}
                        {isSuperAdmin && (
                          <>
                            <button className="ml-0.5 text-muted-foreground hover:text-foreground" onClick={() => { setEditingTagId(tag.id); setEditingTagType("global"); }} data-testid={`dashboard-button-edit-global-tag-${tag.id}`}>
                              <Edit2 className="h-3 w-3" />
                            </button>
                            <button className="text-muted-foreground hover:text-destructive" onClick={() => deleteGlobalTagMutation.mutate(tag.id)} data-testid={`dashboard-button-delete-global-tag-${tag.id}`}>
                              <X className="h-3 w-3" />
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </Badge>
                ))}
              </div>
              {isSuperAdmin && (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Add global tag..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 h-9 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter" && newTagName.trim()) { createGlobalTagMutation.mutate({ name: newTagName.trim() }); } }}
                    data-testid="dashboard-input-new-global-tag"
                  />
                  <Button size="sm" className="h-9" onClick={() => { if (newTagName.trim()) { createGlobalTagMutation.mutate({ name: newTagName.trim() }); } }} disabled={!newTagName.trim() || createGlobalTagMutation.isPending} data-testid="dashboard-button-add-global-tag">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              )}
            </div>

            {!isSuperAdmin && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">My Custom Tags</h4>
                  <span className="text-xs text-muted-foreground">{ownerTags.length} tags</span>
                </div>
                <div className="flex flex-wrap gap-2" data-testid="dashboard-owner-tags-list">
                  {ownerTags.length === 0 && (
                    <p className="text-sm text-muted-foreground">No custom tags yet. Add your own tags below.</p>
                  )}
                  {ownerTags.map((tag) => (
                    <Badge
                      key={`custom-${tag.id}`}
                      variant="outline"
                      className="px-3 py-1.5 text-sm font-medium border-primary/30 text-primary dark:text-primary flex items-center gap-1"
                      data-testid={`dashboard-tag-badge-owner-${tag.id}`}
                    >
                      {editingTagId === tag.id && editingTagType === "owner" ? (
                        <input
                          className="bg-transparent border-none outline-none text-sm w-24"
                          defaultValue={tag.name}
                          autoFocus
                          onBlur={(e) => {
                            const newName = e.target.value.trim();
                            if (newName && newName !== tag.name) { updateTagMutation.mutate({ id: tag.id, data: { name: newName } }); }
                            else { setEditingTagId(null); setEditingTagType(null); }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newName = (e.target as HTMLInputElement).value.trim();
                              if (newName && newName !== tag.name) { updateTagMutation.mutate({ id: tag.id, data: { name: newName } }); }
                              else { setEditingTagId(null); setEditingTagType(null); }
                            } else if (e.key === "Escape") { setEditingTagId(null); setEditingTagType(null); }
                          }}
                          data-testid={`dashboard-input-edit-owner-tag-${tag.id}`}
                        />
                      ) : (
                        <>
                          {tag.name}
                          <button className="ml-0.5 text-muted-foreground hover:text-foreground" onClick={() => { setEditingTagId(tag.id); setEditingTagType("owner"); }} data-testid={`dashboard-button-edit-owner-tag-${tag.id}`}>
                            <Edit2 className="h-3 w-3" />
                          </button>
                          <button className="text-muted-foreground hover:text-destructive" onClick={() => deleteTagMutation.mutate(tag.id)} data-testid={`dashboard-button-delete-owner-tag-${tag.id}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </>
                      )}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Add custom tag..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="flex-1 h-9 text-sm"
                    onKeyDown={(e) => { if (e.key === "Enter" && newTagName.trim()) { createTagMutation.mutate({ name: newTagName.trim() }); } }}
                    data-testid="dashboard-input-new-owner-tag"
                  />
                  <Button size="sm" className="h-9" onClick={() => { if (newTagName.trim()) { createTagMutation.mutate({ name: newTagName.trim() }); } }} disabled={!newTagName.trim() || createTagMutation.isPending} data-testid="dashboard-button-add-owner-tag">
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Export image picker dialog */}
      <Dialog open={showExportPicker} onOpenChange={setShowExportPicker}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Images to Export</DialogTitle>
            <DialogDescription>
              Choose which photos to include in the exported PDF for each project.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 space-y-6 py-2">
            {Object.entries(exportImageFilters).map(([projectIdStr, selectedUrls]) => {
              const projectId = Number(projectIdStr);
              const project = (filteredProjects || []).find(p => p.id === projectId);
              if (!project || !project.imageUrls || project.imageUrls.length === 0) return null;
              const allSelected = project.imageUrls.every(url => (selectedUrls as Set<string>).has(url));
              return (
                <div key={projectId} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-sm">{project.jobLabel || project.description || `Project ${projectId}`}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedUrls as Set<string>).size} of {project.imageUrls.length} images selected
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="text-xs text-primary hover:underline"
                        data-testid={`button-select-all-project-${projectId}`}
                        onClick={() => setExportImageFilters(prev => ({
                          ...prev,
                          [projectId]: new Set(project.imageUrls || [])
                        }))}
                      >
                        {allSelected ? "All selected" : "Select all"}
                      </button>
                      <span className="text-xs text-muted-foreground">·</span>
                      <button
                        className="text-xs text-muted-foreground hover:underline"
                        data-testid={`button-deselect-all-project-${projectId}`}
                        onClick={() => setExportImageFilters(prev => ({
                          ...prev,
                          [projectId]: new Set()
                        }))}
                      >
                        None
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {project.imageUrls.map((url, index) => {
                      const isSelected = (selectedUrls as Set<string>).has(url);
                      return (
                        <div
                          key={url}
                          data-testid={`export-image-${projectId}-${index}`}
                          className={`relative cursor-pointer rounded overflow-hidden border-2 transition-all ${
                            isSelected ? "border-orange-500 ring-1 ring-orange-500/30" : "border-transparent opacity-50"
                          }`}
                          onClick={() => {
                            setExportImageFilters(prev => {
                              const next = new Set(prev[projectId]);
                              if (next.has(url)) next.delete(url);
                              else next.add(url);
                              return { ...prev, [projectId]: next };
                            });
                          }}
                        >
                          <div className="aspect-square bg-muted">
                            <LazyImage
                              src={getImageUrl(url)}
                              alt={`Photo ${index + 1}`}
                              className="w-full h-full object-cover"
                              iconSize="sm"
                            />
                          </div>
                          <div className={`absolute top-1 left-1 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? "bg-orange-500 border-orange-500" : "bg-white/80 border-gray-400"
                          }`}>
                            {isSelected && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <DialogFooter className="pt-2 border-t gap-2">
            <Button variant="outline" onClick={() => setShowExportPicker(false)} data-testid="button-cancel-export-picker">
              Cancel
            </Button>
            <Button
              onClick={() => handleExport(pendingExportAll, exportImageFilters)}
              disabled={isExporting}
              data-testid="button-confirm-export"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Export PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ProjectCardProps {
  project: Project;
  selectionMode: boolean;
  isSelected: boolean;
  onToggle: (id: number) => void;
}

function ProjectCard({ project, selectionMode, isSelected, onToggle }: ProjectCardProps) {
  const cardContent = (
    <Card
      className={`overflow-visible cursor-pointer transition-all hover:shadow-md h-full flex flex-col ${project.hasIssue ? 'ring-2 ring-red-500' : ''} ${isSelected ? 'ring-2 ring-primary shadow-md' : ''} ${selectionMode && !isSelected ? 'opacity-80 hover:opacity-100' : ''}`}
      data-testid={`card-project-${project.id}`}
    >
      <CardContent className="p-0 flex flex-col flex-1">
        <div className="relative aspect-video bg-muted rounded-t-md overflow-hidden">
          <LazyImage
            src={project.imageUrls && project.imageUrls.length > 0 ? getImageUrl(project.imageUrls[0]) : null}
            alt={project.description || "Project image"}
            className="w-full h-full"
            iconSize="md"
          />
          {selectionMode && (
            <div className="absolute top-2 left-2 z-10">
              <div className={`h-5 w-5 rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-black/40 border border-white/60'}`}>
                {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
              </div>
            </div>
          )}
          {project.imageUrls && project.imageUrls.length > 1 && (
            <div className="absolute bottom-2 left-2">
              <Badge variant="secondary" className="text-xs">
                +{project.imageUrls.length - 1} more
              </Badge>
            </div>
          )}
          {project.hasIssue && (
            <div className="absolute top-2 right-2">
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                ISSUE
              </Badge>
            </div>
          )}
        </div>
        <div className="p-4 flex flex-col flex-1 gap-2">
          {project.jobLabel && (
            <p className="font-semibold text-sm truncate" data-testid={`text-joblabel-${project.id}`}>
              {project.jobLabel}
            </p>
          )}
          {project.description && (
            <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-description-${project.id}`}>
              {project.description}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5 mt-auto">
            {project.tags?.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {project.tags && project.tags.length > 2 && (
              <Badge variant="outline" className="text-xs">
                +{project.tags.length - 2}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(project.createdAt), "MMM d, yyyy h:mm a")}
          </p>
        </div>
      </CardContent>
    </Card>
  );

  if (selectionMode) {
    return (
      <div onClick={() => onToggle(project.id)} data-testid={`select-project-${project.id}`}>
        {cardContent}
      </div>
    );
  }

  return <Link href={`/projects/${project.id}`}>{cardContent}</Link>;
}

interface ProjectListItemProps {
  project: Project;
  selectionMode: boolean;
  isSelected: boolean;
  onToggle: (id: number) => void;
}

function ProjectListItem({ project, selectionMode, isSelected, onToggle }: ProjectListItemProps) {
  const displayLabel = project.jobLabel || project.description || "Untitled Project";

  const cardContent = (
    <Card
      className={`overflow-visible cursor-pointer transition-all hover:shadow-md ${project.hasIssue ? 'ring-2 ring-red-500' : ''} ${isSelected ? 'ring-2 ring-primary shadow-md' : ''} ${selectionMode && !isSelected ? 'opacity-80 hover:opacity-100' : ''}`}
      data-testid={`card-project-${project.id}`}
    >
      <CardContent className="p-3 sm:p-4">
        <div className="flex gap-3 sm:gap-4">
          {selectionMode && (
            <div className="flex items-center shrink-0">
              <div className={`h-5 w-5 rounded flex items-center justify-center transition-colors ${isSelected ? 'bg-primary text-primary-foreground' : 'border-2 border-muted-foreground/40'}`}>
                {isSelected && <CheckSquare className="h-3.5 w-3.5" />}
              </div>
            </div>
          )}
          <div className="relative w-20 h-20 sm:w-24 sm:h-24 flex-shrink-0 rounded-md overflow-hidden bg-muted">
            <LazyImage
              src={project.imageUrls && project.imageUrls.length > 0 ? getImageUrl(project.imageUrls[0]) : null}
              alt={project.description || "Project image"}
              className="w-full h-full"
              iconSize="sm"
            />
            {project.imageUrls && project.imageUrls.length > 1 && (
              <div className="absolute bottom-1 left-1">
                <Badge variant="secondary" className="text-[10px]">
                  +{project.imageUrls.length - 1}
                </Badge>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate">{displayLabel}</p>
                {project.hasIssue && (
                  <Badge variant="destructive" className="gap-1 shrink-0 text-xs">
                    <AlertTriangle className="h-3 w-3" />
                    ISSUE
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground whitespace-nowrap shrink-0 pt-0.5">
                {format(new Date(project.createdAt), "MMM d, yyyy h:mm a")}
              </p>
            </div>
            {project.jobLabel && project.description && (
              <p className="text-sm text-muted-foreground line-clamp-1">
                {project.description}
              </p>
            )}
            {project.tags && project.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {project.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs">
                    {tag}
                  </Badge>
                ))}
                {project.tags.length > 4 && (
                  <Badge variant="outline" className="text-xs">
                    +{project.tags.length - 4}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (selectionMode) {
    return (
      <div onClick={() => onToggle(project.id)} data-testid={`select-project-${project.id}`}>
        {cardContent}
      </div>
    );
  }

  return <Link href={`/projects/${project.id}`}>{cardContent}</Link>;
}

function EmptyState({ searchQuery }: { searchQuery: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] text-center px-4">
      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted flex items-center justify-center mb-4 sm:mb-6">
        {searchQuery ? (
          <Search className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
        ) : (
          <Camera className="w-8 h-8 sm:w-10 sm:h-10 text-muted-foreground" />
        )}
      </div>
      <h3 className="text-lg sm:text-xl font-semibold mb-2">
        {searchQuery ? "No projects found" : "No projects yet"}
      </h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        {searchQuery 
          ? `No projects match "${searchQuery}". Try a different search term.`
          : "Get started by creating your first project. Upload a photo and let AI suggest tags for you."
        }
      </p>
      {!searchQuery && (
        <Link href="/projects/new">
          <Button data-testid="button-create-first-project">
            <Plus className="h-4 w-4 mr-2" />
            Create your first project
          </Button>
        </Link>
      )}
    </div>
  );
}
