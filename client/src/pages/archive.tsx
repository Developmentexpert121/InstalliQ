import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Archive, Shield, User, Mail, Loader2, RotateCcw, ArrowLeft, Search, ArrowUpDown, Trash2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { usePageHeader } from "@/lib/page-header";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { User as UserType } from "@shared/schema";

type SafeUser = Omit<UserType, "password">;

export default function ArchivePage() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const { setHeaderInfo } = usePageHeader();
  const [, setLocation] = useLocation();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const [userToRestore, setUserToRestore] = useState<SafeUser | null>(null);
  const [userToPermanentDelete, setUserToPermanentDelete] = useState<SafeUser | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setHeaderInfo({
      title: "Archived Users",
      description: "Users that have been removed. You can restore them or permanently delete them from here.",
      icon: <Archive className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
      actions: (
        <Button
          variant="outline"
          data-testid="button-back-to-users"
          onClick={() => setLocation("/admin")}
        >
          <ArrowLeft className="h-4 w-4 sm:mr-2" />
          <span className="hidden sm:inline">Back to Users</span>
        </Button>
      ),
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo, setLocation]);

  const { data: deletedUsers = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users/deleted"],
  });

  const isSuperAdmin = currentUser?.role === "super_admin";

  const { data: selfDeleteSetting } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/app-settings/self-delete-enabled"],
    enabled: isSuperAdmin,
  });

  const selfDeleteToggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest("PUT", "/api/admin/app-settings/self-delete-enabled", { enabled });
      return res.json() as Promise<{ enabled: boolean }>;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/app-settings/self-delete-enabled"], { enabled: data.enabled });
      toast({
        title: data.enabled ? "Self-delete enabled" : "Self-delete disabled",
        description: data.enabled
          ? "Users will now see a 'Delete my account' option in their account settings."
          : "Users will no longer see the 'Delete my account' option.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to update setting",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const filteredAndSorted = useMemo(() => {
    let result = [...deletedUsers];

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (user) =>
          user.name.toLowerCase().includes(query) ||
          user.username.toLowerCase().includes(query) ||
          (user.email && user.email.toLowerCase().includes(query)) ||
          (user.phone && user.phone.includes(query))
      );
    }

    result.sort((a, b) => {
      const dateA = a.deletedAt ? new Date(a.deletedAt).getTime() : 0;
      const dateB = b.deletedAt ? new Date(b.deletedAt).getTime() : 0;
      return sortOrder === "newest" ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [deletedUsers, searchQuery, sortOrder]);

  const visibleIds = useMemo(() => filteredAndSorted.map(u => u.id), [filteredAndSorted]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  const toggleSelected = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.add(id));
        return next;
      });
    }
  };

  const restoreUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("POST", `/api/admin/users/${userId}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/deleted"] });
      toast({
        title: "User restored",
        description: "The user has been restored successfully and can log in again.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to restore user",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const permanentDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      return apiRequest("POST", "/api/admin/users/permanent-delete", { ids });
    },
    onSuccess: (_data, ids) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users/deleted"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setSelectedIds(prev => {
        const next = new Set(prev);
        ids.forEach(id => next.delete(id));
        return next;
      });
      toast({
        title: ids.length === 1 ? "User permanently deleted" : `${ids.length} users permanently deleted`,
        description: "This action cannot be undone.",
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to permanently delete",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  if (currentUser?.role !== "admin" && currentUser?.role !== "super_admin") {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Shield className="h-8 w-8 text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium">Access Denied</h3>
            <p className="text-muted-foreground text-sm text-center mt-1">
              You don't have permission to access this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 overflow-y-auto p-6">
        {isSuperAdmin && (
          <Card className="mb-4 border-dashed">
            <CardContent className="p-4">
              <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-orange-100 dark:bg-orange-900/40 border border-orange-200 dark:border-orange-800/60 flex items-center justify-center shrink-0">
                    <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      Allow users to delete their own account
                    </p>
                    <p className="text-xs text-muted-foreground">
                      When enabled, regular users will see a "Delete my account" option in their Account Settings. Admins and Super Admins are never affected.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <span
                    className={`text-xs font-medium ${
                      selfDeleteSetting?.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    }`}
                    data-testid="text-self-delete-status"
                  >
                    {selfDeleteSetting?.enabled ? "Enabled" : "Disabled"}
                  </span>
                  <Switch
                    checked={!!selfDeleteSetting?.enabled}
                    onCheckedChange={(checked) => selfDeleteToggleMutation.mutate(checked)}
                    disabled={selfDeleteToggleMutation.isPending}
                    aria-label="Allow users to delete their own account"
                    data-testid="switch-self-delete-enabled"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, username, email, or phone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              data-testid="input-search-archived"
            />
          </div>
          <Select value={sortOrder} onValueChange={(value: "newest" | "oldest") => setSortOrder(value)}>
            <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-sort-archived">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="newest" data-testid="option-newest-archived">Newest First</SelectItem>
              <SelectItem value="oldest" data-testid="option-oldest-archived">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between gap-3 px-3 py-2 mb-3 rounded-md border bg-muted/40" data-testid="bulk-actions-archive">
            <span className="text-sm font-medium" data-testid="text-selected-count">
              {selectedIds.size} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setShowBulkDeleteConfirm(true)}
                disabled={permanentDeleteMutation.isPending}
                data-testid="button-bulk-permanent-delete"
              >
                {permanentDeleteMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin sm:mr-1" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                )}
                <span className="hidden sm:inline">Delete Permanently</span>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedIds(new Set())}
                data-testid="button-clear-selection"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : deletedUsers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Archive className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No archived users</h3>
              <p className="text-muted-foreground text-sm text-center mt-1">
                When users are deleted, they will appear here and can be restored.
              </p>
            </CardContent>
          </Card>
        ) : filteredAndSorted.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No results found</h3>
              <p className="text-muted-foreground text-sm text-center mt-1">
                Try adjusting your search criteria.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
              <span>
                Showing {filteredAndSorted.length} of {deletedUsers.length} archived {deletedUsers.length === 1 ? "user" : "users"}
              </span>
              <button
                type="button"
                onClick={toggleSelectAllVisible}
                className="text-xs underline-offset-2 hover:underline"
                data-testid="button-select-all-archived"
              >
                {allVisibleSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            {filteredAndSorted.map((user) => (
              <Card key={user.id} data-testid={`deleted-user-card-${user.id}`} className="w-full border-dashed">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Checkbox
                        checked={selectedIds.has(user.id)}
                        onCheckedChange={() => toggleSelected(user.id)}
                        aria-label={`Select ${user.name}`}
                        data-testid={`checkbox-archived-user-${user.id}`}
                      />
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                        {user.role === "admin" ? (
                          <Shield className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <User className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{user.name}</div>
                        <div className="text-sm text-muted-foreground truncate">@{user.username}</div>
                        {user.email && (
                          <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3 shrink-0" />
                            <span className="truncate">{user.email}</span>
                          </div>
                        )}
                        {user.deletedAt && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Archived {new Date(user.deletedAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">
                        {user.role === "admin" ? "Owner" : "User"}
                      </Badge>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            onClick={() => setUserToRestore(user)}
                            disabled={restoreUserMutation.isPending}
                            data-testid={`button-restore-user-${user.id}`}
                          >
                            {restoreUserMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin sm:mr-2" />
                            ) : (
                              <RotateCcw className="h-4 w-4 sm:mr-2" />
                            )}
                            <span className="hidden sm:inline">Restore</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Restore user</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="destructive"
                            onClick={() => setUserToPermanentDelete(user)}
                            disabled={permanentDeleteMutation.isPending}
                            data-testid={`button-permanent-delete-user-${user.id}`}
                          >
                            <Trash2 className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Delete</span>
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete permanently</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!userToRestore}
        onOpenChange={(open) => !open && setUserToRestore(null)}
        onConfirm={() => {
          if (userToRestore) {
            restoreUserMutation.mutate(userToRestore.id);
            setUserToRestore(null);
          }
        }}
        title="Restore User?"
        description={`Are you sure you want to restore "${userToRestore?.username}"? They will be able to log in and access the app again.`}
        confirmLabel="Restore"
      />

      <ConfirmDialog
        open={!!userToPermanentDelete}
        onOpenChange={(open) => !open && setUserToPermanentDelete(null)}
        onConfirm={() => {
          if (userToPermanentDelete) {
            permanentDeleteMutation.mutate([userToPermanentDelete.id]);
            setUserToPermanentDelete(null);
          }
        }}
        title="Delete user permanently?"
        description={`"${userToPermanentDelete?.username}" will be removed from the database forever. This cannot be undone.`}
        confirmLabel="Delete Permanently"
        variant="destructive"
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        onOpenChange={setShowBulkDeleteConfirm}
        onConfirm={() => {
          permanentDeleteMutation.mutate(Array.from(selectedIds));
          setShowBulkDeleteConfirm(false);
        }}
        title={`Delete ${selectedIds.size} ${selectedIds.size === 1 ? "user" : "users"} permanently?`}
        description="The selected archived users will be removed from the database forever. This cannot be undone."
        confirmLabel="Delete Permanently"
        variant="destructive"
      />
    </div>
  );
}
