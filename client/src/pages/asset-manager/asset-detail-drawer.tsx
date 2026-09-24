import { useState, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, Trash2, ExternalLink, Folder, MapPin, User, Camera, Save, X, Plus, Sparkles, Phone, AtSign } from "lucide-react";
import { format } from "date-fns";

interface Asset {
  id: number;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  uploaderName?: string;
  title: string | null;
  description: string | null;
  tags: string[];
  source: string | null;
  assetDate: string | null;
  createdAt: string;
  projectName: string | null;
  projectAddress: string | null;
  jobNumber: string | null;
  capturedBy: string | null;
  sourceDisplay: string | null;
  aiTaggedAt?: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

interface GlobalTag {
  id: number;
  name: string;
  color: string | null;
}

interface AssetDetailDrawerProps {
  asset: Asset | null;
  open: boolean;
  onClose: () => void;
  onUpdate?: (updated: Asset) => void;
  readOnly?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MetaRow({
  icon, label, value, testId,
}: {
  icon: React.ReactNode; label: string; value: string | null | undefined; testId?: string;
}) {
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground leading-none mb-0.5">{label}</p>
        <p className="text-sm text-foreground truncate" data-testid={testId}>
          {value || <span className="italic text-muted-foreground">—</span>}
        </p>
      </div>
    </div>
  );
}

function TagAutocomplete({
  tags,
  globalTags,
  onAdd,
  onRemove,
}: {
  tags: string[];
  globalTags: GlobalTag[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = globalTags.filter(
    gt => !tags.includes(gt.name) && gt.name.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="space-y-2">
      {/* Applied tags */}
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" data-testid="section-applied-tags">
          {tags.map(tag => (
            <Badge
              key={tag}
              variant="secondary"
              className="flex items-center gap-1 pl-2 pr-1 py-0.5"
              data-testid={`badge-tag-${tag}`}
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 transition-colors"
                data-testid={`button-remove-tag-${tag}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">No tags yet — add from the library below</p>
      )}

      {/* Autocomplete input */}
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Plus className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Add tag from library…"
            className="h-8 text-sm pl-8"
            data-testid="input-tag-search"
          />
        </div>
        {open && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-48 overflow-y-auto" data-testid="dropdown-tag-suggestions">
            {suggestions.map(gt => (
              <button
                key={gt.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onAdd(gt.name); setQuery(""); setOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                data-testid={`option-tag-${gt.name}`}
              >
                {gt.name}
              </button>
            ))}
          </div>
        )}
        {open && query.length > 0 && suggestions.length === 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md px-3 py-2 text-xs text-muted-foreground">
            No matching tags in library
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssetDetailDrawer({ asset, open, onClose, onUpdate, readOnly = false }: AssetDetailDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState(asset?.title ?? "");
  const [description, setDescription] = useState(asset?.description ?? "");
  const [tags, setTags] = useState<string[]>(asset?.tags ?? []);
  const [projectName, setProjectName] = useState(asset?.projectName ?? "");
  const [projectAddress, setProjectAddress] = useState(asset?.projectAddress ?? "");
  const [jobNumber, setJobNumber] = useState(asset?.jobNumber ?? "");

  const isCompanyCam = asset?.source === "companycam";
  const isInstalliq = asset?.source === "installiq";
  const isReadOnlySource = isCompanyCam || isInstalliq;

  const { data: globalTagsData = [] } = useQuery<GlobalTag[]>({
    queryKey: ["/api/global-tags"],
  });

  const initFromAsset = (a: Asset | null) => {
    setTitle(a?.title ?? "");
    setDescription(a?.description ?? "");
    setTags(a?.tags ?? []);
    setProjectName(a?.projectName ?? "");
    setProjectAddress(a?.projectAddress ?? "");
    setJobNumber(a?.jobNumber ?? "");
  };

  useEffect(() => {
    if (asset) initFromAsset(asset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id, asset?.tags.join(","), asset?.title, asset?.description,
      asset?.projectName, asset?.jobNumber, asset?.projectAddress]);

  const updateMutation = useMutation({
    mutationFn: (data: {
      title?: string | null;
      description?: string | null;
      tags?: string[];
      projectName?: string | null;
      projectAddress?: string | null;
      jobNumber?: string | null;
    }) => apiRequest("PATCH", `/api/assets/${asset?.id}`, data),
    onSuccess: async (res) => {
      const updated = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      onUpdate?.(updated);
      toast({ title: "Asset updated" });
    },
    onError: () => toast({ title: "Update failed", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/assets/${asset?.id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      toast({ title: "Asset deleted" });
      onClose();
    },
    onError: () => toast({ title: "Delete failed", variant: "destructive" }),
  });

  const handleSave = () => {
    updateMutation.mutate({
      title: title || null,
      description: description || null,
      tags,
      projectName: projectName || null,
      projectAddress: projectAddress || null,
      jobNumber: jobNumber || null,
    });
  };

  if (!asset) return null;

  const displayDate = asset.assetDate ?? asset.createdAt;
  const sourceLabel = asset.sourceDisplay ?? (
    asset.source === "companycam" ? "CompanyCam"
    : asset.source === "google-drive" ? "Google Drive"
    : "Upload"
  );

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
        else initFromAsset(asset);
      }}
    >
      <SheetContent className="w-full sm:max-w-md overflow-y-auto" data-testid="drawer-asset-detail">
        <SheetHeader className="mb-3">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base font-semibold truncate" data-testid="text-asset-filename">
              Photo Details
            </SheetTitle>
            {!readOnly && !isReadOnlySource && (
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  title="Save changes"
                  data-testid="button-save-asset"
                >
                  {updateMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Save className="h-4 w-4" />}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      title="Delete asset"
                      data-testid="button-delete-asset"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Asset?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{asset.fileName}" from storage. This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteMutation.mutate()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        data-testid="button-confirm-delete"
                      >
                        {deleteMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {format(new Date(displayDate), "MMM d, yyyy · h:mm a")}
          </p>
        </SheetHeader>

        <div className="space-y-3">
          {/* Image */}
          <div className="rounded-md overflow-hidden border bg-muted aspect-video flex items-center justify-center">
            <img
              src={asset.fileUrl}
              alt={asset.title || asset.fileName}
              className="max-h-full max-w-full object-contain"
              data-testid={`img-asset-preview-${asset.id}`}
            />
          </div>

          <a
            href={asset.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            data-testid="link-open-asset"
          >
            <ExternalLink className="h-3 w-3" /> Open original
          </a>

          {/* ── Details ─────────────────────────────── */}
          <div className="border rounded-md overflow-hidden">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40 border-b">
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Details</span>
            </div>
            <div className="px-3 py-2">
              {isReadOnlySource ? (
                <div className="space-y-0">
                  <MetaRow icon={<Folder className="h-3.5 w-3.5" />} label="Job Label" value={asset.projectName} testId="text-project-name" />
                  <MetaRow icon={<MapPin className="h-3.5 w-3.5" />} label="Location" value={asset.projectAddress} testId="text-project-address" />
                  <MetaRow icon={<User className="h-3.5 w-3.5" />} label="Captured By" value={asset.capturedBy} testId="text-captured-by" />
                  <MetaRow icon={<Camera className="h-3.5 w-3.5" />} label="Source" value={sourceLabel} testId="text-source-display" />
                  <p className="text-[10px] text-muted-foreground italic pt-1">
                    {isInstalliq
                      ? "Synced from InstalliQ — edit from the Project dashboard"
                      : "Synced from CompanyCam — job details are read-only"}
                  </p>
                </div>
              ) : (
                <div className="py-1 space-y-2">
                  <div>
                    <label className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-1 mb-1">
                      <Folder className="h-3 w-3" /> Job Label
                    </label>
                    <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Enter job label" className="h-8 text-sm" disabled={readOnly} data-testid="input-project-name" />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground flex items-center gap-1 mb-1">
                      <MapPin className="h-3 w-3" /> Location
                    </label>
                    <Input value={projectAddress} onChange={e => setProjectAddress(e.target.value)} placeholder="Enter address" className="h-8 text-sm" disabled={readOnly} data-testid="input-project-address" />
                  </div>
                  <MetaRow icon={<Camera className="h-3.5 w-3.5" />} label="Source" value={sourceLabel} testId="text-source-display" />
                </div>
              )}
            </div>
          </div>

          {/* ── Customer (InstalliQ only) ─────────────────────────────────── */}
          {isInstalliq && (asset.customerName || asset.customerPhone || asset.customerEmail) && (
            <div className="border rounded-md overflow-hidden" data-testid="section-customer">
              <div className="flex items-center gap-1.5 px-3 py-2 bg-muted/40 border-b">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Customer</span>
              </div>
              <div className="px-3 py-2 space-y-0">
                {asset.customerName && (
                  <MetaRow icon={<User className="h-3.5 w-3.5" />} label="Name" value={asset.customerName} testId="text-customer-name" />
                )}
                {asset.customerPhone && (
                  <MetaRow icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={asset.customerPhone} testId="text-customer-phone" />
                )}
                {asset.customerEmail && (
                  <MetaRow icon={<AtSign className="h-3.5 w-3.5" />} label="Email" value={asset.customerEmail} testId="text-customer-email" />
                )}
              </div>
            </div>
          )}

          {/* ── Description (Title + Description) ─────────────────────────────── */}
          <div className="border rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 border-b">
              <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Description</span>
            </div>
            <div className="px-3 py-2 space-y-2">
              {isReadOnlySource ? (
                <>
                  <div>
                    <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-0.5">Title</p>
                    <p className="text-sm" data-testid="text-readonly-title">
                      {asset.title || <span className="italic text-muted-foreground">—</span>}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground mb-0.5">Description</p>
                    <p className="text-sm" data-testid="text-readonly-description">
                      {asset.description || <span className="italic text-muted-foreground">—</span>}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="asset-title" className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">Title</Label>
                    <Input id="asset-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Optional title" className="h-8 text-sm" disabled={readOnly} data-testid="input-asset-title" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="asset-description" className="text-[10px] font-semibold tracking-wider uppercase text-muted-foreground">Description</Label>
                    <Textarea id="asset-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" rows={2} className="text-sm resize-none" disabled={readOnly} data-testid="input-asset-description" />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Tags ─────────────────────────────────── */}
          <div className="border rounded-md overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b">
              <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Tags</span>
              {asset.aiTaggedAt && !isInstalliq && (
                <span className="flex items-center gap-1 text-[10px] text-primary font-medium" data-testid="badge-ai-tagged">
                  <Sparkles className="h-3 w-3" /> AI Tagged
                </span>
              )}
            </div>
            <div className="px-3 py-2">
              {readOnly || isReadOnlySource ? (
                asset.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {asset.tags.map(tag => (
                      <Badge key={tag} variant="secondary" data-testid={`badge-tag-${tag}`}>{tag}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm italic text-muted-foreground">No tags</p>
                )
              ) : (
                <div className="space-y-1">
                  <TagAutocomplete
                    tags={tags}
                    globalTags={globalTagsData}
                    onAdd={name => setTags(prev => prev.includes(name) ? prev : [...prev, name])}
                    onRemove={name => setTags(prev => prev.filter(t => t !== name))}
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── File Info ─────────────────────────────────── */}
          <div className="border rounded-md overflow-hidden">
            <div className="px-3 py-2 bg-muted/40 border-b">
              <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">File Info</span>
            </div>
            <div className="px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <div className="col-span-2 truncate" title={asset.fileName}>
                <span className="font-medium text-foreground">File:</span>{" "}
                <span data-testid="text-asset-file-name">{asset.fileName}</span>
              </div>
              <div><span className="font-medium text-foreground">Size:</span> {formatBytes(asset.fileSize)}</div>
              <div><span className="font-medium text-foreground">Type:</span> {asset.fileType}</div>
              {asset.uploaderName && (
                <div className="col-span-2">
                  <span className="font-medium text-foreground">Uploader:</span>{" "}
                  <span data-testid="text-uploader-name">{asset.uploaderName}</span>
                </div>
              )}
              {asset.aiTaggedAt && !isInstalliq && (
                <div className="col-span-2 flex items-center gap-1" data-testid="text-ai-tagged-at">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="font-medium text-foreground">AI Tagged:</span>{" "}
                  {format(new Date(asset.aiTaggedAt), "MMM d, yyyy · h:mm a")}
                </div>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
