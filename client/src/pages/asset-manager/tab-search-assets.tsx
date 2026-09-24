import { useState, useEffect, useCallback, useMemo, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ImageOff, ChevronDown, ChevronUp, SlidersHorizontal, Sparkles, FolderOpen, Upload, HardDrive, Camera } from "lucide-react";
import { SiGoogle } from "react-icons/si";
import AssetDetailDrawer from "./asset-detail-drawer";

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
  aiTaggedAt: string | null;
  assetDate: string | null;
  createdAt: string;
  projectName: string | null;
  projectAddress: string | null;
  jobNumber: string | null;
  capturedBy: string | null;
  sourceDisplay: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
}

interface AssetsResponse {
  assets: Asset[];
  total: number;
  page: number;
  pageSize: number;
}

interface AssetSourceStat {
  source: string;
  total: number;
  untagged: number;
}

interface AssetStats {
  total: number;
  untaggedCount: number;
  bySource: AssetSourceStat[];
}

interface GlobalTag {
  id: number;
  name: string;
  color: string;
}

interface FilterState {
  tags: string[];
  sources: string[];
  projectName: string;
  customerName: string;
}

interface TagProgress {
  done: number;
  total: number;
  failed: number;
  complete?: boolean;
  tagged?: number;
  error?: string;
  stopped?: boolean;
}

interface TenantAccessRow {
  ownerId: number;
  ownerName: string;
  ownerEmail: string | null;
  enabled: boolean;
  totalUploads: number;
}

const EMPTY_FILTERS: FilterState = { tags: [], sources: [], projectName: "", customerName: "" };
const PAGE_SIZE = 24;

// ── Module-level singleton so tagging state survives tab switches ──────────────
type ProgressListener = (p: TagProgress | null) => void;
let _tagProgress: TagProgress | null = null;
const _tagListeners = new Set<ProgressListener>();

function _emitTagProgress(p: TagProgress | null) {
  _tagProgress = p;
  _tagListeners.forEach(l => l(p));
}

/** Broadcast a tagging progress update — called by Access Hub when it starts/runs tagging. */
export function emitTagProgress(p: TagProgress | null) {
  _emitTagProgress(p);
}

/**
 * Subscribe to AI tagging progress from any component outside this tab.
 * Returns the current TagProgress (or null when idle).
 */
export function useTagProgress(): TagProgress | null {
  const [progress, setProgress] = useState<TagProgress | null>(_tagProgress);
  useEffect(() => {
    const listener: ProgressListener = p => setProgress(p);
    _tagListeners.add(listener);
    setProgress(_tagProgress);
    return () => { _tagListeners.delete(listener); };
  }, []);
  return progress;
}

export type { TagProgress };

const SOURCE_OPTIONS = [
  { value: "upload", label: "Manual" },
  { value: "companycam", label: "CompanyCam" },
  { value: "google-drive", label: "Google Drive" },
  { value: "installiq", label: "InstalliQ" },
];

function sourceLabel(source: string | null): string {
  if (!source) return "Manual";
  if (source === "upload") return "Manual";
  if (source === "companycam") return "CompanyCam";
  if (source === "google-drive" || source === "google_drive") return "Google Drive";
  if (source === "installiq") return "InstalliQ";
  return source;
}

function sourceBadgeClass(source: string | null): string {
  if (source === "companycam") return "bg-blue-500/90 text-white";
  if (source === "google-drive" || source === "google_drive") return "bg-green-600/90 text-white";
  if (source === "installiq") return "bg-orange-500/90 text-white";
  return "bg-black/50 text-white";
}

const SOURCE_META: Record<string, { label: string; Icon: ComponentType<{ className?: string }>; color: string }> = {
  upload:        { label: "Uploaded",     Icon: Upload,       color: "text-muted-foreground" },
  "google-drive":{ label: "Google Drive", Icon: SiGoogle,     color: "text-blue-500" },
  google_drive:  { label: "Google Drive", Icon: SiGoogle,     color: "text-blue-500" },
  companycam:    { label: "CompanyCam",   Icon: Camera,       color: "text-blue-600" },
  installiq:     { label: "InstalliQ",    Icon: FolderOpen,   color: "text-orange-500" },
};

function buildQueryString(params: Record<string, string | string[] | number | undefined>): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(params)) {
    if (val === undefined || val === "" || (Array.isArray(val) && val.length === 0)) continue;
    if (Array.isArray(val)) {
      val.forEach(v => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`));
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

function countActiveFilters(f: FilterState): number {
  let n = f.tags.length + f.sources.length;
  if (f.projectName.trim()) n += 1;
  if (f.customerName.trim()) n += 1;
  return n;
}

export default function TabSearchAssets() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [staged, setStaged] = useState<FilterState>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<FilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("all");

  const isSuperAdmin = user?.role === "super_admin";
  const activeFilterCount = useMemo(() => countActiveFilters(applied), [applied]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: tagsData } = useQuery<{ tags: GlobalTag[] }>({
    queryKey: ["/api/assets/tags"],
    queryFn: async () => {
      const res = await fetch("/api/assets/tags", { credentials: "include" });
      if (!res.ok) return { tags: [] };
      return res.json();
    },
  });
  const allTags = tagsData?.tags ?? [];

  const { data: owners } = useQuery<TenantAccessRow[]>({
    queryKey: ["/api/asset-manager/access"],
    enabled: isSuperAdmin,
  });

  const ownerIdParam = isSuperAdmin && selectedOwnerId && selectedOwnerId !== "all" ? parseInt(selectedOwnerId, 10) : undefined;

  const { data: assetStats } = useQuery<AssetStats>({
    queryKey: ["/api/assets/stats", ownerIdParam],
    queryFn: async () => {
      const qs = ownerIdParam ? `?ownerId=${ownerIdParam}` : "";
      const res = await fetch(`/api/assets/stats${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load stats");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const queryKey = useMemo(() => [
    "/api/assets",
    ownerIdParam,
    debouncedSearch,
    applied.tags,
    applied.sources,
    applied.projectName,
    applied.customerName,
    page,
  ], [ownerIdParam, debouncedSearch, applied, page]);

  const { data, isLoading } = useQuery<AssetsResponse>({
    queryKey,
    queryFn: async () => {
      const qs = buildQueryString({
        ownerId: ownerIdParam,
        search: debouncedSearch || undefined,
        tags: applied.tags,
        sources: applied.sources,
        projectName: applied.projectName || undefined,
        customerName: applied.customerName || undefined,
        page,
        pageSize: PAGE_SIZE,
      });
      const res = await fetch(`/api/assets${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load assets");
      return res.json();
    },
  });

  const assets = data?.assets ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const showing = assets.length > 0
    ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${(page - 1) * PAGE_SIZE + assets.length} of ${total}`
    : "";

  const handleAssetUpdate = useCallback((updated: Asset) => {
    setSelectedAsset(updated);
  }, []);

  useEffect(() => {
    if (!selectedAsset || !data?.assets) return;
    const fresh = data.assets.find(a => a.id === selectedAsset.id);
    if (fresh) setSelectedAsset(fresh);
  }, [data?.assets]);

  function toggleStagedTag(tag: string) {
    setStaged(s => ({
      ...s,
      tags: s.tags.includes(tag) ? s.tags.filter(t => t !== tag) : [...s.tags, tag],
    }));
  }

  function toggleStagedSource(source: string) {
    setStaged(s => ({
      ...s,
      sources: s.sources.includes(source) ? s.sources.filter(x => x !== source) : [...s.sources, source],
    }));
  }

  function handleApply() {
    setApplied({ ...staged });
    setPage(1);
  }

  function handleClear() {
    setStaged(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  }

  const hasUncommittedChanges = JSON.stringify(staged) !== JSON.stringify(applied);

  return (
    <div className="space-y-4" data-testid="section-search-assets">
      {/* Owner picker — super_admin only */}
      {isSuperAdmin && owners && owners.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground shrink-0">Viewing:</span>
          <Select
            value={selectedOwnerId}
            onValueChange={(val) => { setSelectedOwnerId(val); setPage(1); }}
          >
            <SelectTrigger className="w-56 h-8 text-sm" data-testid="select-owner-filter">
              <SelectValue placeholder="Select one owner" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" data-testid="select-owner-all">Select one owner</SelectItem>
              {owners.map(o => (
                <SelectItem key={o.ownerId} value={String(o.ownerId)} data-testid={`select-owner-${o.ownerId}`}>
                  {o.ownerName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Search box */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, job label, job number, tag, or description…"
          className="pl-9"
          data-testid="input-asset-search"
        />
      </div>

      {/* Filters toggle bar */}
      <div className="border rounded-lg overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-2.5 bg-muted/40 hover:bg-muted/60 transition-colors text-sm font-medium"
          onClick={() => setFiltersOpen(o => !o)}
          data-testid="button-toggle-filters"
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <Badge className="h-5 px-1.5 text-xs" data-testid="badge-filter-count">
                {activeFilterCount}
              </Badge>
            )}
          </span>
          {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        <div className={`transition-all duration-200 ease-in-out overflow-hidden ${filtersOpen ? "max-h-[800px]" : "max-h-0"}`}>
          <div className="p-4 border-t space-y-4 bg-background">
            {/* Tag pills */}
            {allTags.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Tags</p>
                <div className="flex flex-wrap gap-1.5" data-testid="section-tag-pills">
                  {allTags.map(tag => {
                    const selected = staged.tags.includes(tag.name);
                    return (
                      <button
                        key={tag.id}
                        onClick={() => toggleStagedTag(tag.name)}
                        data-testid={`pill-tag-${tag.name}`}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          selected
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-foreground border-border hover:border-primary/50"
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Job label filter */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Job Label</p>
              <Input
                value={staged.projectName}
                onChange={e => setStaged(s => ({ ...s, projectName: e.target.value }))}
                placeholder="Filter by job label…"
                className="h-8 text-sm"
                data-testid="input-filter-job-label"
              />
            </div>

            {/* Customer filter */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Customer</p>
              <Input
                value={staged.customerName}
                onChange={e => setStaged(s => ({ ...s, customerName: e.target.value }))}
                placeholder="Filter by customer name…"
                className="h-8 text-sm"
                data-testid="input-filter-customer-name"
              />
            </div>

            {/* Source pills */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Source</p>
              <div className="flex flex-wrap gap-1.5" data-testid="section-source-pills">
                {SOURCE_OPTIONS.map(opt => {
                  const selected = staged.sources.includes(opt.value);
                  return (
                    <button
                      key={opt.value}
                      onClick={() => toggleStagedSource(opt.value)}
                      data-testid={`pill-source-${opt.value}`}
                      className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        selected
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-muted/50 text-foreground border-border hover:border-primary/50"
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!hasUncommittedChanges}
                data-testid="button-apply-filters"
              >
                Apply
              </Button>
              {(activeFilterCount > 0 || countActiveFilters(staged) > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClear}
                  data-testid="button-clear-filters"
                >
                  Clear all
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      {assetStats && (
        <div className="flex flex-wrap items-center gap-2" data-testid="section-stats-row">
          <div className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1 text-xs" data-testid="stat-total">
            <HardDrive className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-medium">{assetStats.total}</span>
            <span className="text-muted-foreground">total</span>
          </div>

          {(assetStats.bySource ?? [])
            .filter((s) => s.source in SOURCE_META)
            .map((s) => {
              const cfg = SOURCE_META[s.source];
              return (
                <div
                  key={s.source}
                  className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1 text-xs"
                  data-testid={`stat-source-${s.source}`}
                >
                  <cfg.Icon className={`h-3 w-3 shrink-0 ${cfg.color}`} />
                  <span className="text-muted-foreground">{cfg.label}:</span>
                  <span className="font-medium">{s.total}</span>
                </div>
              );
            })}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="aspect-square w-full" />
              <div className="p-3 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-center text-muted-foreground" data-testid="empty-assets">
          <ImageOff className="h-12 w-12" />
          <div>
            <p className="font-medium">
              {debouncedSearch || activeFilterCount > 0 ? "No assets match your filters" : "No assets yet"}
            </p>
            <p className="text-sm">
              {debouncedSearch || activeFilterCount > 0 ? "Try adjusting your search or filters" : "Upload some images to get started"}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="grid-assets">
            {assets.map((asset) => (
              <Card
                key={asset.id}
                className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all group"
                onClick={() => setSelectedAsset(asset)}
                data-testid={`card-asset-${asset.id}`}
              >
                <div className="aspect-square bg-muted relative overflow-hidden">
                  <img
                    src={asset.fileUrl}
                    alt={asset.title || asset.fileName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    data-testid={`img-asset-${asset.id}`}
                  />
                  <div className="absolute top-1 left-1">
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${sourceBadgeClass(asset.source)}`}
                      data-testid={`badge-source-${asset.id}`}
                    >
                      {sourceLabel(asset.source)}
                    </span>
                  </div>
                  {asset.aiTaggedAt && asset.source !== 'installiq' && (
                    <div className="absolute top-1 right-1" title={`AI tagged ${new Date(asset.aiTaggedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}>
                      <span className="flex items-center gap-0.5 bg-primary/90 text-primary-foreground text-[9px] font-semibold px-1 py-0.5 rounded ring-1 ring-white/20" data-testid={`dot-ai-${asset.id}`}>
                        <Sparkles className="h-2 w-2" /> AI
                      </span>
                    </div>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-1.5">
                  {asset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {asset.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs" data-testid={`badge-tag-${asset.id}-${tag}`}>
                          {tag}
                        </Badge>
                      ))}
                      {asset.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">+{asset.tags.length - 3}</Badge>
                      )}
                    </div>
                  )}
                  {asset.projectName && (
                    <div className="flex items-center gap-1 min-w-0" data-testid={`text-project-${asset.id}`}>
                      <FolderOpen className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="text-xs text-foreground/80 truncate font-medium">{asset.projectName}</span>
                      {asset.jobNumber && (
                        <span className="text-xs text-muted-foreground shrink-0">· {asset.jobNumber}</span>
                      )}
                      <span
                        className="text-xs text-muted-foreground shrink-0 ml-auto pl-3"
                        title={asset.customerName && asset.customerName.length > 15 ? asset.customerName : undefined}
                        data-testid={`text-customer-name-${asset.id}`}
                      >
                        {asset.customerName
                            ? (asset.customerName.length > 15
                                ? asset.customerName.slice(0, 15) + '…'
                                : asset.customerName)
                            : '-'}
                      </span>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground" data-testid={`text-asset-date-${asset.id}`}>
                    {new Date(asset.assetDate ?? asset.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                  {asset.aiTaggedAt && asset.source !== 'installiq' && (
                    <p className="text-[10px] text-primary/70 flex items-center gap-0.5" data-testid={`text-ai-tagged-date-${asset.id}`}>
                      <Sparkles className="h-2.5 w-2.5 shrink-0" />
                      AI tagged {new Date(asset.aiTaggedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2" data-testid="section-pagination">
            <p className="text-xs text-muted-foreground" data-testid="text-pagination-info">{showing}</p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                data-testid="button-prev-page"
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground" data-testid="text-page-number">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
                data-testid="button-next-page"
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <AssetDetailDrawer
        asset={selectedAsset}
        open={selectedAsset !== null}
        onClose={() => setSelectedAsset(null)}
        onUpdate={handleAssetUpdate}
        readOnly={user?.role !== "admin" && user?.role !== "super_admin"}
      />
    </div>
  );
}
