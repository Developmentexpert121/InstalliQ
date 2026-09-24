import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tags, Plus, Loader2, Globe } from "lucide-react";

interface GlobalTagRow {
  id: number;
  name: string;
  color: string;
  createdAt: string;
}

export default function TabTagLibrary() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newTag, setNewTag] = useState("");

  const isAdmin = user?.role === "admin" || user?.role === "super_admin";

  const { data: tagsData, isLoading } = useQuery<{ tags: GlobalTagRow[] }>({
    queryKey: ["/api/asset-manager/tags"],
  });
  const tags = tagsData?.tags ?? [];

  const addMutation = useMutation({
    mutationFn: (tagName: string) =>
      apiRequest("POST", "/api/asset-manager/tags", { tagName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/tags"] });
      setNewTag("");
      toast({ title: "Tag added to global library" });
    },
    onError: () => toast({ title: "Failed to add tag", variant: "destructive" }),
  });

  const handleAdd = () => {
    const t = newTag.trim();
    if (!t) return;
    addMutation.mutate(t);
  };

  return (
    <div className="space-y-5" data-testid="section-tag-library">
      <div>
        <h2 className="text-lg font-semibold">Tag Library</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Global tags shared across the entire app — Photo Tags, job uploads, and AI tagging all use
          this same vocabulary. Tags are permanent system defaults and cannot be deleted.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 px-4 py-2.5 text-sm text-blue-800 dark:text-blue-300">
        <Globe className="h-4 w-4 shrink-0" />
        <span>
          These tags are shared app-wide. Any tag you add here immediately appears in the Photo
          Tags modal, job uploads, and OpenAI Vision AI tagging for all tenants.
        </span>
      </div>

      {isAdmin && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-tag">Add Tag to Global Library</Label>
              <div className="flex gap-2">
                <Input
                  id="new-tag"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                  placeholder="e.g. Monument Signs, Pylon Signs…"
                  data-testid="input-new-tag"
                />
                <Button
                  onClick={handleAdd}
                  disabled={addMutation.isPending || !newTag.trim()}
                  data-testid="button-add-tag"
                >
                  {addMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      <Separator />

      {isLoading ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-28 rounded-full" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center min-h-[200px] gap-3 text-center text-muted-foreground"
          data-testid="empty-tags"
        >
          <Tags className="h-10 w-10" />
          <div>
            <p className="font-medium">No global tags yet</p>
            <p className="text-sm">Tags added here become available across the entire app</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {tags.length} global tag{tags.length !== 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap gap-2" data-testid="list-tags">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center gap-1.5 bg-secondary text-secondary-foreground rounded-full px-3 py-1 text-sm"
                data-testid={`tag-item-${tag.id}`}
              >
                <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                <span data-testid={`text-tag-name-${tag.id}`}>{tag.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
