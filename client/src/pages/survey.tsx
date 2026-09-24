import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { usePageHeader } from "@/lib/page-header";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getImageUrl } from "@/lib/image-url";
import { LazyImage } from "@/components/ui/lazy-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Camera,
  Plus,
  Search,
  ArrowLeft,
  Loader2,
  Trash2,
  Save,
  MapPin,
  FileText,
  Image as ImageIcon,
  Download,
  Mail,
  Pencil,
  X,
  Undo2,
  Type,
  PenTool,
  CalendarDays,
  StickyNote,
  Grid3X3,
  List,
  ChevronLeft,
  ChevronRight,
  Filter,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Zap,
  Building2,
  Wrench,
  Ruler,
  CheckSquare,
  FileCheck,
  ClipboardCheck,
  BookOpen,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

function SurveyListPage() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { setHeaderInfo } = usePageHeader();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "completed">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const SURVEYS_PER_PAGE = 12;

  useEffect(() => {
    setHeaderInfo({ title: "Site Surveys", description: "Site survey management" });
  }, [setHeaderInfo]);

  const { data: surveyList = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/surveys"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/surveys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({ title: "Survey deleted" });
    },
  });

  const filteredSurveys = surveyList.filter((s: any) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery ||
      s.jobName?.toLowerCase().includes(query) ||
      s.address?.toLowerCase().includes(query) ||
      s.description?.toLowerCase().includes(query);
    const matchesStatus = statusFilter === "all" ||
      (statusFilter === "completed" && s.status === "completed") ||
      (statusFilter === "draft" && s.status !== "completed");
    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const totalPages = Math.ceil(filteredSurveys.length / SURVEYS_PER_PAGE);
  const paginatedSurveys = filteredSurveys.slice(
    (currentPage - 1) * SURVEYS_PER_PAGE,
    currentPage * SURVEYS_PER_PAGE
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-3 sm:px-4 lg:px-6 py-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              type="search"
              placeholder={isMobile ? "Search Job" : "Search by job name, address, or description..."}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-survey-search"
            />
          </div>
          <Button onClick={() => navigate("/surveys/new")} data-testid="button-new-survey">
            <Plus className="h-4 w-4 mr-2" />
            New Survey
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground shrink-0">
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filter:</span>
          </div>
          <div className="flex items-center border rounded-md flex-1 sm:flex-none">
            <Button
              variant={statusFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setStatusFilter("all")}
              data-testid="button-filter-all"
            >
              All
            </Button>
            <Button
              variant={statusFilter === "completed" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setStatusFilter("completed")}
              data-testid="button-filter-completed"
            >
              Completed
            </Button>
            <Button
              variant={statusFilter === "draft" ? "secondary" : "ghost"}
              size="sm"
              className="flex-1 sm:flex-none"
              onClick={() => setStatusFilter("draft")}
              data-testid="button-filter-draft"
            >
              Draft
            </Button>
          </div>

          <div className="flex items-center gap-2 ml-auto">
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

        {filteredSurveys.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {filteredSurveys.length} survey{filteredSurveys.length !== 1 ? "s" : ""} found
          </div>
        )}
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
        ) : paginatedSurveys.length > 0 ? (
          <div className="space-y-4">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedSurveys.map((survey: any) => (
                  <SurveyCard key={survey.id} survey={survey} onDelete={(id) => {
                    if (confirm("Delete this survey?")) deleteMutation.mutate(id);
                  }} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {paginatedSurveys.map((survey: any) => (
                  <SurveyListItem key={survey.id} survey={survey} onDelete={(id) => {
                    if (confirm("Delete this survey?")) deleteMutation.mutate(id);
                  }} />
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
                <p className="text-sm text-muted-foreground" data-testid="text-pagination-info">
                  Showing {((currentPage - 1) * SURVEYS_PER_PAGE) + 1}-{Math.min(currentPage * SURVEYS_PER_PAGE, filteredSurveys.length)} of {filteredSurveys.length} surveys
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
          <div className="text-center py-16 text-muted-foreground">
            <Camera className="h-12 w-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-medium">No surveys yet</p>
            <p className="text-sm mt-1">Create your first site survey to get started</p>
          </div>
        )}
      </main>
    </div>
  );
}

function SurveyCard({ survey, onDelete }: { survey: any; onDelete: (id: number) => void }) {
  return (
    <Link href={`/surveys/${survey.id}`}>
      <Card
        className="overflow-visible cursor-pointer transition-all hover:shadow-md h-full flex flex-col"
        data-testid={`card-survey-${survey.id}`}
      >
        <CardContent className="p-0 flex flex-col flex-1">
          <div className="relative aspect-video bg-muted rounded-t-md overflow-hidden">
            {survey.thumbnailUrl ? (
              <LazyImage
                src={getImageUrl(survey.thumbnailUrl)}
                alt={survey.jobName || "Survey photo"}
                className="w-full h-full"
                iconSize="md"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Camera className="h-8 w-8 text-muted-foreground/40" />
              </div>
            )}
            <div className="absolute top-2 right-2">
              <Badge
                variant={survey.status === "completed" ? "default" : "secondary"}
                className="text-xs"
              >
                {survey.status === "completed" ? "Completed" : "Draft"}
              </Badge>
            </div>
            {survey.photoCount > 1 && (
              <div className="absolute bottom-2 left-2">
                <Badge variant="secondary" className="text-xs">
                  +{survey.photoCount - 1} more
                </Badge>
              </div>
            )}
          </div>
          <div className="p-4 flex flex-col flex-1 gap-2">
            {survey.jobName && (
              <p className="font-semibold text-sm truncate" data-testid={`text-survey-name-${survey.id}`}>
                {survey.jobName}
              </p>
            )}
            {survey.address && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />
                {survey.address}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 mt-auto">
              <Badge variant="outline" className="text-xs">
                <Camera className="h-3 w-3 mr-1" />
                {survey.photoCount || 0} photos
              </Badge>
              {survey.calendarEventId && (
                <Badge variant="outline" className="text-xs">
                  <CalendarDays className="h-3 w-3 mr-1" />
                  Linked
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(survey.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SurveyListItem({ survey, onDelete }: { survey: any; onDelete: (id: number) => void }) {
  return (
    <Link href={`/surveys/${survey.id}`}>
      <Card
        className="overflow-visible cursor-pointer transition-all hover:shadow-md"
        data-testid={`card-survey-${survey.id}`}
      >
        <CardContent className="p-4">
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-md overflow-hidden bg-muted flex-shrink-0">
              {survey.thumbnailUrl ? (
                <LazyImage
                  src={getImageUrl(survey.thumbnailUrl)}
                  alt={survey.jobName || "Survey photo"}
                  className="w-full h-full"
                  iconSize="sm"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Camera className="h-6 w-6 text-muted-foreground/40" />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-sm truncate" data-testid={`text-survey-name-${survey.id}`}>
                  {survey.jobName || "Untitled Survey"}
                </p>
                <Badge
                  variant={survey.status === "completed" ? "default" : "secondary"}
                  className="text-xs shrink-0"
                >
                  {survey.status === "completed" ? "Completed" : "Draft"}
                </Badge>
              </div>
              {survey.address && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {survey.address}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1">
                  <Camera className="h-3 w-3" />
                  {survey.photoCount || 0} photos
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" />
                  {new Date(survey.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
                {survey.calendarEventId && (
                  <Badge variant="outline" className="text-xs">
                    Linked to booking
                  </Badge>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 self-start"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(survey.id);
              }}
              data-testid={`button-delete-survey-${survey.id}`}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function SurveyFormPage({ surveyId, calendarEventId, initialJobName, initialAddress, initialDescription }: {
  surveyId?: number;
  calendarEventId?: number;
  initialJobName?: string;
  initialAddress?: string;
  initialDescription?: string;
}) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { setHeaderInfo } = usePageHeader();
  const [form, setForm] = useState({
    jobName: initialJobName || "",
    address: initialAddress || "",
    description: initialDescription || "",
    generalNotes: "",
  });

  useEffect(() => {
    setHeaderInfo({ title: surveyId ? "Edit Survey" : "New Survey", description: "" });
  }, [setHeaderInfo, surveyId]);

  const { data: existingSurvey, isLoading: loadingSurvey } = useQuery<any>({
    queryKey: ["/api/surveys", surveyId],
    enabled: !!surveyId,
  });

  const { data: calendarEvent } = useQuery<any>({
    queryKey: ["/api/calendar-events", calendarEventId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/calendar-events/${calendarEventId}/details`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!calendarEventId && !surveyId,
  });

  useEffect(() => {
    if (existingSurvey) {
      setForm({
        jobName: existingSurvey.jobName || "",
        address: existingSurvey.address || "",
        description: existingSurvey.description || "",
        generalNotes: existingSurvey.generalNotes || "",
      });
    }
  }, [existingSurvey]);

  useEffect(() => {
    if (calendarEvent && !surveyId) {
      const evt = calendarEvent.event || calendarEvent;
      const job = calendarEvent.job;
      const bestAddress = job?.formattedAddress || job?.address || evt.address ||
        (job?.city && job?.state ? `${job.address || ""}, ${job.city}, ${job.state}`.replace(/^,\s*/, "") : "") || "";
      const bestName = evt.title || evt.workJobNumber || job?.customerName || "";
      const bestDesc = evt.description || evt.jobDescription || job?.description || "";
      setForm(prev => ({
        jobName: bestName || prev.jobName || "",
        address: bestAddress || prev.address || "",
        description: bestDesc || prev.description || "",
        generalNotes: prev.generalNotes || "",
      }));
    }
  }, [calendarEvent, surveyId]);

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      if (surveyId) {
        return apiRequest("PATCH", `/api/surveys/${surveyId}`, data);
      } else {
        return apiRequest("POST", "/api/surveys", {
          ...data,
          calendarEventId: calendarEventId || null,
        });
      }
    },
    onSuccess: async (res) => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys"] });
      toast({ title: surveyId ? "Survey updated" : "Survey created" });
      if (!surveyId) {
        const data = await res.json();
        navigate(`/surveys/${data.id}`);
      } else {
        navigate(`/surveys/${surveyId}`);
      }
    },
    onError: () => {
      toast({ title: "Failed to save survey", variant: "destructive" });
    },
  });

  if (loadingSurvey) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-auto">
        <div className="max-w-2xl mx-auto p-4 sm:p-6 space-y-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(surveyId ? `/surveys/${surveyId}` : "/surveys")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Job Name *</Label>
              <Input
                value={form.jobName}
                onChange={(e) => setForm(f => ({ ...f, jobName: e.target.value }))}
                placeholder="Enter job name"
                data-testid="input-survey-jobname"
              />
            </div>
            <div className="space-y-2">
              <Label>Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm(f => ({ ...f, address: e.target.value }))}
                placeholder="Enter address"
                data-testid="input-survey-address"
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Job description"
                rows={3}
                data-testid="input-survey-description"
              />
            </div>
            <div className="space-y-2">
              <Label>General Notes</Label>
              <Textarea
                value={form.generalNotes}
                onChange={(e) => setForm(f => ({ ...f, generalNotes: e.target.value }))}
                placeholder="Additional notes"
                rows={3}
                data-testid="input-survey-notes"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={!form.jobName || saveMutation.isPending}
                className="flex-1"
                data-testid="button-save-survey"
              >
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                {surveyId ? "Save Changes" : "Create Survey"}
              </Button>
              <Button variant="outline" onClick={() => navigate(surveyId ? `/surveys/${surveyId}` : "/surveys")} data-testid="button-cancel-survey">
                Cancel
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PhotoAnnotationDialog({ photo, open, onClose, surveyId }: { photo: any; open: boolean; onClose: () => void; surveyId: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<"draw" | "text" | "measure">("draw");
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#FF0000");
  const [lineWidth, setLineWidth] = useState(4);
  const [history, setHistory] = useState<ImageData[]>([]);
  const [textInput, setTextInput] = useState("");
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [floatingText, setFloatingText] = useState<{ text: string; x: number; y: number } | null>(null);
  const [isDraggingText, setIsDraggingText] = useState(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const { toast } = useToast();

  const [localNote, setLocalNote] = useState<string>("");
  const [localMeasurements, setLocalMeasurements] = useState<PhotoMeasurements>({});
  const [fieldsSaving, setFieldsSaving] = useState(false);

  const saveFieldsMutation = useMutation({
    mutationFn: async ({ note, measurements }: { note: string; measurements: PhotoMeasurements }) => {
      return apiRequest("PATCH", `/api/surveys/${surveyId}/photos/${photo?.id}`, { note, measurements });
    },
    onMutate: () => setFieldsSaving(true),
    onSettled: () => setFieldsSaving(false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
    },
    onError: () => {
      toast({ title: "Failed to save fields", variant: "destructive" });
    },
  });

  const handleFieldBlur = () => {
    if (!photo?.id) return;
    saveFieldsMutation.mutate({ note: localNote, measurements: localMeasurements });
  };

  const updateMeasurement = (key: keyof PhotoMeasurements, value: string) => {
    setLocalMeasurements(prev => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    if (!open || !photo) return;
    setLocalNote(photo.note || "");
    setLocalMeasurements((photo.measurements as PhotoMeasurements) || {});
    setImgLoaded(false);
    setHistory([]);
    setTextPos(null);
    setTextInput("");
    setFloatingText(null);
    setIsDraggingText(false);

    const rawUrl = photo.annotatedImageUrl || photo.originalImageUrl;
    const fileName = rawUrl.replace(/^.*\/uploads\//, "").replace(/^\/objects\/uploads\//, "").replace(/^\/uploads\//, "");
    const proxyUrl = `/api/image-proxy?file=${encodeURIComponent(fileName)}`;

    const drawImageToCanvas = (img: HTMLImageElement) => {
      imgRef.current = img;

      const drawToCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return false;
        const container = containerRef.current;
        if (!container) return false;

        const containerW = container.clientWidth;
        const containerH = container.clientHeight;

        if (containerW < 50 || containerH < 50) return false;

        const maxW = containerW - 16;
        const maxH = containerH - 16;
        const scale = Math.min(maxW / img.width, maxH / img.height, 2);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        setImgLoaded(true);
        return true;
      };

      let attempts = 0;
      const tryDraw = () => {
        if (drawToCanvas()) return;
        attempts++;
        if (attempts < 20) {
          setTimeout(tryDraw, 100);
        }
      };
      setTimeout(tryDraw, 150);
    };

    fetch(proxyUrl)
      .then(res => {
        if (!res.ok) throw new Error("Proxy failed");
        return res.blob();
      })
      .then(blob => {
        const objectUrl = URL.createObjectURL(blob);
        const img = new window.Image();
        img.onload = () => drawImageToCanvas(img);
        img.onerror = () => URL.revokeObjectURL(objectUrl);
        img.src = objectUrl;
      })
      .catch(() => {
        const img = new window.Image();
        img.onload = () => drawImageToCanvas(img);
        img.src = getImageUrl(rawUrl);
      });
  }, [open, photo]);

  const saveState = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return;
    }
    setHistory(prev => [...prev, imageData]);
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === "text" || tool === "measure") {
      const pos = getPos(e);
      setTextPos(pos);
      return;
    }
    saveState();
    setIsDrawing(true);
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || tool !== "draw") return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => {
    setIsDrawing(false);
  };

  const addText = () => {
    if (!textPos || !textInput.trim()) return;
    setFloatingText({ text: textInput.trim(), x: textPos.x, y: textPos.y });
    setTextPos(null);
    setTextInput("");
  };

  const stampText = () => {
    if (!floatingText) return;
    saveState();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const fontSize = Math.max(18, canvas.width * 0.04);
    ctx.font = `bold ${fontSize}px Arial`;
    ctx.fillStyle = color;
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = 4;
    ctx.strokeText(floatingText.text, floatingText.x, floatingText.y);
    ctx.fillText(floatingText.text, floatingText.x, floatingText.y);
    setFloatingText(null);
  };

  const cancelFloatingText = () => {
    setFloatingText(null);
  };

  const handleFloatingDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDraggingText(true);
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;
    dragOffsetRef.current = {
      x: canvasX - (floatingText?.x || 0),
      y: canvasY - (floatingText?.y || 0),
    };
  };

  const handleFloatingDragMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDraggingText || !floatingText) return;
    e.stopPropagation();
    e.preventDefault();
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;
    setFloatingText(prev => prev ? {
      ...prev,
      x: canvasX - dragOffsetRef.current.x,
      y: canvasY - dragOffsetRef.current.y,
    } : null);
  }, [isDraggingText, floatingText]);

  const handleFloatingDragEnd = useCallback(() => {
    setIsDraggingText(false);
  }, []);

  const undo = () => {
    if (history.length === 0) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const prev = history[history.length - 1];
    ctx.putImageData(prev, 0, 0);
    setHistory(h => h.slice(0, -1));
  };

  const clearAnnotations = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const img = imgRef.current!;
    saveState();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const canvas = canvasRef.current!;
      let blob: Blob;
      try {
        blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => {
            if (b) resolve(b);
            else reject(new Error("toBlob returned null"));
          }, "image/png");
        });
      } catch {
        throw new Error("Cannot export canvas — try again");
      }
      const formData = new FormData();
      formData.append("annotatedImage", blob, `annotated-${photo.id}.png`);
      const res = await fetch(`/api/surveys/${surveyId}/photos/${photo.id}/annotate`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      toast({ title: "Annotation saved" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Failed to save annotation", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[100vw] max-w-[100vw] sm:max-w-5xl h-[100dvh] sm:h-[95vh] sm:max-h-[95vh] flex flex-col overflow-hidden p-0 rounded-none sm:rounded-lg gap-0">
        <DialogHeader className="px-3 sm:px-4 pt-3 pb-2 shrink-0">
          <DialogTitle className="text-base sm:text-lg">Annotate Photo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap gap-2 px-3 sm:px-4 pb-2 shrink-0">
          <Button
            variant={tool === "draw" ? "default" : "outline"}
            size="sm"
            className="h-11 sm:h-10 px-4 text-sm"
            onClick={() => setTool("draw")}
            data-testid="tool-draw"
          >
            <PenTool className="h-5 w-5 sm:h-4 sm:w-4 mr-1.5" />
            Draw
          </Button>
          <Button
            variant={tool === "text" ? "default" : "outline"}
            size="sm"
            className="h-11 sm:h-10 px-4 text-sm"
            onClick={() => setTool("text")}
            data-testid="tool-text"
          >
            <Type className="h-5 w-5 sm:h-4 sm:w-4 mr-1.5" />
            Text
          </Button>
          <Button
            variant={tool === "measure" ? "default" : "outline"}
            size="sm"
            className="h-11 sm:h-10 px-4 text-sm"
            onClick={() => setTool("measure")}
            data-testid="tool-measure"
          >
            <Type className="h-5 w-5 sm:h-4 sm:w-4 mr-1.5" />
            Measure
          </Button>
          <Separator orientation="vertical" className="h-11 sm:h-10" />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-11 w-11 sm:h-10 sm:w-10 rounded cursor-pointer border-2"
            data-testid="color-picker"
          />
          <Button variant="outline" size="sm" className="h-11 w-11 sm:h-10 sm:w-10 p-0" onClick={undo} data-testid="button-undo">
            <Undo2 className="h-5 w-5 sm:h-4 sm:w-4" />
          </Button>
          <Button variant="outline" size="sm" className="h-11 sm:h-10 px-3 text-sm text-destructive border-destructive/30 hover:bg-destructive/10" onClick={clearAnnotations} data-testid="button-clear">
            <X className="h-5 w-5 sm:h-4 sm:w-4 mr-1" /> Clear
          </Button>
        </div>

        {textPos && (tool === "text" || tool === "measure") && (
          <div className="px-3 sm:px-4 pb-2 flex gap-2 shrink-0">
            <Input
              placeholder={tool === "measure" ? 'e.g. 48" W x 24" H' : "Type text..."}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addText()}
              autoFocus
              className="flex-1 h-11 sm:h-10 text-base sm:text-sm"
              data-testid="input-annotation-text"
            />
            <Button size="sm" className="h-11 sm:h-10 px-5 text-sm" onClick={addText} data-testid="button-add-text">
              Add
            </Button>
          </div>
        )}

        <div ref={containerRef} className="flex-1 min-h-0 overflow-auto px-2 sm:px-4 flex items-center justify-center bg-muted/30 relative">
          <div className="relative inline-block">
            <canvas
              ref={canvasRef}
              className="border-2 border-primary/30 rounded shadow-sm max-w-full max-h-full cursor-crosshair touch-none"
              style={{ objectFit: "contain" }}
              onMouseDown={floatingText ? undefined : startDraw}
              onMouseMove={floatingText ? undefined : draw}
              onMouseUp={floatingText ? undefined : endDraw}
              onMouseLeave={floatingText ? undefined : endDraw}
              onTouchStart={floatingText ? undefined : startDraw}
              onTouchMove={floatingText ? undefined : draw}
              onTouchEnd={floatingText ? undefined : endDraw}
              data-testid="annotation-canvas"
            />
            {floatingText && canvasRef.current && (() => {
              const canvas = canvasRef.current!;
              const rect = canvas.getBoundingClientRect();
              const scaleX = rect.width / canvas.width;
              const scaleY = rect.height / canvas.height;
              const fontSize = Math.max(18, canvas.width * 0.04);
              const screenX = floatingText.x * scaleX;
              const screenY = floatingText.y * scaleY;
              const screenFontSize = fontSize * scaleX;
              return (
                <div
                  className="absolute touch-none select-none"
                  style={{
                    left: `${screenX}px`,
                    top: `${screenY - screenFontSize}px`,
                    cursor: isDraggingText ? "grabbing" : "grab",
                    zIndex: 10,
                  }}
                  onMouseDown={handleFloatingDragStart}
                  onMouseMove={handleFloatingDragMove}
                  onMouseUp={handleFloatingDragEnd}
                  onMouseLeave={handleFloatingDragEnd}
                  onTouchStart={handleFloatingDragStart}
                  onTouchMove={handleFloatingDragMove}
                  onTouchEnd={handleFloatingDragEnd}
                  data-testid="floating-text"
                >
                  <div
                    className="border-2 border-dashed border-blue-500 rounded px-1 py-0.5 bg-white/60"
                    style={{
                      fontSize: `${screenFontSize}px`,
                      fontWeight: "bold",
                      fontFamily: "Arial, sans-serif",
                      color: color,
                      whiteSpace: "nowrap",
                      lineHeight: 1.2,
                    }}
                  >
                    {floatingText.text}
                  </div>
                  <div className="flex gap-1 mt-1 justify-center">
                    <button
                      className="bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded shadow touch-none"
                      onMouseDown={(e) => { e.stopPropagation(); stampText(); }}
                      onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); stampText(); }}
                      data-testid="button-stamp-text"
                    >
                      Place
                    </button>
                    <button
                      className="bg-red-500 text-white text-xs font-bold px-3 py-1.5 rounded shadow touch-none"
                      onMouseDown={(e) => { e.stopPropagation(); cancelFloatingText(); }}
                      onTouchStart={(e) => { e.stopPropagation(); e.preventDefault(); cancelFloatingText(); }}
                      data-testid="button-cancel-floating-text"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Notes & Measurements panel */}
        <div className="shrink-0 border-t bg-muted/30 px-3 py-2 max-h-56 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes &amp; Measurements</span>
            {fieldsSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-auto" />}
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs font-medium">Photo Note</Label>
              <Textarea
                rows={2}
                placeholder="Add a note for this photo..."
                value={localNote}
                onChange={e => setLocalNote(e.target.value)}
                onBlur={handleFieldBlur}
                className="mt-1 text-sm"
                maxLength={500}
                data-testid="input-photo-note"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-medium">Sign Width</Label>
                <Input
                  placeholder='e.g. 48"'
                  value={localMeasurements.signWidth || ""}
                  onChange={e => updateMeasurement("signWidth", e.target.value)}
                  onBlur={handleFieldBlur}
                  className="mt-1 text-sm h-8"
                  data-testid="input-photo-sign-width"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Sign Height</Label>
                <Input
                  placeholder='e.g. 24"'
                  value={localMeasurements.signHeight || ""}
                  onChange={e => updateMeasurement("signHeight", e.target.value)}
                  onBlur={handleFieldBlur}
                  className="mt-1 text-sm h-8"
                  data-testid="input-photo-sign-height"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Ground to Sign</Label>
                <Input
                  placeholder="e.g. 8ft 6in"
                  value={localMeasurements.groundToSign || ""}
                  onChange={e => updateMeasurement("groundToSign", e.target.value)}
                  onBlur={handleFieldBlur}
                  className="mt-1 text-sm h-8"
                  data-testid="input-photo-ground-to-sign"
                />
              </div>
              <div>
                <Label className="text-xs font-medium">Square Footage</Label>
                <Input
                  placeholder="e.g. 8 sq ft"
                  value={localMeasurements.squareFootage || ""}
                  onChange={e => updateMeasurement("squareFootage", e.target.value)}
                  onBlur={handleFieldBlur}
                  className="mt-1 text-sm h-8"
                  data-testid="input-photo-square-footage"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs font-medium">Cut Size</Label>
                <Input
                  placeholder='e.g. 48" x 24"'
                  value={localMeasurements.cutSize || ""}
                  onChange={e => updateMeasurement("cutSize", e.target.value)}
                  onBlur={handleFieldBlur}
                  className="mt-1 text-sm h-8"
                  data-testid="input-photo-cut-size"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 p-3 sm:p-4 border-t shrink-0">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex-1 h-12 sm:h-10 text-base sm:text-sm"
            data-testid="button-save-annotation"
          >
            {saveMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Save className="h-5 w-5 mr-2" />}
            Save Annotation
          </Button>
          <Button variant="outline" onClick={onClose} className="h-12 sm:h-10 px-5 text-base sm:text-sm">Cancel</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SurveyDetailPage({ surveyId }: { surveyId: number }) {
  const { toast } = useToast();
  const { setHeaderInfo } = usePageHeader();
  const [, navigate] = useLocation();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [annotatingPhoto, setAnnotatingPhoto] = useState<any>(null);
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [viewingPhoto, setViewingPhoto] = useState<any>(null);
  const [uploadingPhotoCount, setUploadingPhotoCount] = useState(0);

  const { data: survey, isLoading } = useQuery<any>({
    queryKey: ["/api/surveys", surveyId],
  });

  useEffect(() => {
    if (survey) {
      setHeaderInfo({ title: survey.jobName, description: "Survey Details" });
    }
  }, [survey, setHeaderInfo]);

  const uploadMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("photos", f));
      const res = await fetch(`/api/surveys/${surveyId}/photos`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: (_data, files) => {
      const count = files.length;
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      toast({ title: `${count} photo${count !== 1 ? "s" : ""} uploaded successfully`, variant: "success" });
    },
    onError: () => {
      toast({ title: "Failed to upload photos", variant: "destructive" });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId: number) => {
      await apiRequest("DELETE", `/api/surveys/${surveyId}/photos/${photoId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      toast({ title: "Photo deleted" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ photoId, note }: { photoId: number; note: string }) => {
      await apiRequest("PATCH", `/api/surveys/${surveyId}/photos/${photoId}`, { note });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      setEditingNoteId(null);
      toast({ title: "Note saved" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/surveys/${surveyId}`, { status: "completed" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
      toast({ title: "Survey marked as completed" });
    },
  });

  const handleOpenEmailDialog = () => {
    setEmailTo("");
    setEmailSubject(survey ? `Site Survey: ${survey.jobName}` : "Site Survey Report");
    setEmailMessage(survey ? `Please find attached the site survey report for ${survey.jobName}.` : "");
    setEmailDialogOpen(true);
  };

  const handleEmail = async () => {
    if (!emailTo.trim()) {
      toast({ title: "Recipient email is required", variant: "destructive" });
      return;
    }
    setEmailSending(true);
    try {
      const res = await apiRequest("POST", `/api/surveys/${surveyId}/email`, {
        recipientEmail: emailTo.trim(),
        subject: emailSubject.trim(),
        message: emailMessage.trim(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send email");
      setEmailDialogOpen(false);
      toast({ title: "Email Sent", description: `Survey report sent to ${data.sentTo}` });
    } catch (err: any) {
      toast({ title: "Failed to send email", description: err.message, variant: "destructive" });
    } finally {
      setEmailSending(false);
    }
  };

  const handleDownloadPdf = () => {
    window.open(`/api/surveys/${surveyId}/pdf`, "_blank");
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Survey not found
      </div>
    );
  }

  const photos = survey.photos || [];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => navigate("/surveys")} data-testid="button-back-list">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Surveys
            </Button>
            <div className="flex-1" />
            <Button variant="outline" size="sm" onClick={() => navigate(`/surveys/${surveyId}/edit`)} data-testid="button-edit-survey">
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            {survey.status !== "completed" && (
              <Button size="sm" variant="outline" onClick={() => completeMutation.mutate()} disabled={completeMutation.isPending} data-testid="button-complete-survey">
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Mark Complete
              </Button>
            )}
          </div>

          <Card>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{survey.jobName}</h2>
                <Badge variant={survey.status === "completed" ? "default" : "secondary"}>
                  {survey.status}
                </Badge>
              </div>
              {survey.address && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-4 w-4 shrink-0" />
                  {survey.address}
                </p>
              )}
              {survey.calendarEventId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit gap-1.5 text-sm"
                  onClick={() => navigate(`/calendar?openEvent=${survey.calendarEventId}`)}
                  data-testid="button-view-booking"
                >
                  <CalendarDays className="h-4 w-4 shrink-0" />
                  View Booking #{survey.calendarEventId}
                </Button>
              )}
              {survey.description && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-sm whitespace-pre-wrap">{survey.description}</p>
                </div>
              )}
              {survey.generalNotes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">General Notes</p>
                  <p className="text-sm whitespace-pre-wrap">{survey.generalNotes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-base sm:text-sm flex items-center gap-2">
                <Camera className="h-5 w-5 sm:h-4 sm:w-4" />
                Survey Photos ({photos.length})
              </h3>
              <div className="flex gap-2">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (!e.target.files || e.target.files.length === 0) return;
                    const MAX_PHOTOS = 50;
                    const existingCount = photos.length;
                    const remaining = Math.max(0, MAX_PHOTOS - existingCount);

                    if (remaining === 0) {
                      toast({
                        title: "Photo limit reached",
                        description: `You already have ${MAX_PHOTOS} photos. Please delete some before adding more.`,
                        variant: "destructive",
                      });
                      e.target.value = "";
                      return;
                    }

                    let filesToUse = e.target.files;
                    if (e.target.files.length > remaining) {
                      const dt = new DataTransfer();
                      for (let i = 0; i < remaining; i++) {
                        dt.items.add(e.target.files[i]);
                      }
                      filesToUse = dt.files;
                      toast({
                        title: "Selection trimmed",
                        description: `You selected ${e.target.files.length} photos but only ${remaining} more can be added (limit is ${MAX_PHOTOS}). The first ${remaining} photos will be uploaded.`,
                      });
                    }

                    setUploadingPhotoCount(filesToUse.length);
                    uploadMutation.mutate(filesToUse);
                  }}
                  data-testid="input-photo-upload"
                />
                <Button
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploadMutation.isPending}
                  className="h-11 sm:h-9 px-4 text-base sm:text-sm"
                  data-testid="button-upload-photos"
                >
                  {uploadMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Camera className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />}
                  Add Photos
                </Button>
              </div>
            </div>

            {uploadMutation.isPending && (
              <div className="flex items-center gap-3 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg" data-testid="upload-progress-banner">
                <Loader2 className="h-5 w-5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                    Uploading {uploadingPhotoCount} photo{uploadingPhotoCount !== 1 ? "s" : ""}...
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Please wait, this may take a moment for large files</p>
                </div>
              </div>
            )}

            {photos.length === 0 && !uploadMutation.isPending ? (
              <div className="text-center py-12 border-2 border-dashed rounded-lg">
                <ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground/40" />
                <p className="text-base sm:text-sm text-muted-foreground mb-4">No photos yet</p>
                <Button variant="outline" onClick={() => photoInputRef.current?.click()} className="h-11 px-5 text-base sm:text-sm" data-testid="button-upload-first-photo">
                  <Camera className="h-5 w-5 mr-2" />
                  Take or Upload Photo
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {photos.map((photo: any, idx: number) => (
                  <Card key={photo.id} className="overflow-hidden" data-testid={`photo-card-${photo.id}`}>
                    <div
                      className="aspect-[4/3] bg-muted relative group cursor-pointer"
                      onClick={() => setAnnotatingPhoto(photo)}
                    >
                      <img
                        src={getImageUrl(photo.annotatedImageUrl || photo.originalImageUrl)}
                        alt={`Survey photo ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {photo.hasAnnotations && (
                        <Badge className="absolute top-2 left-2 text-sm px-2.5 py-1" variant="secondary">
                          <PenTool className="h-3.5 w-3.5 mr-1.5" />
                          Annotated
                        </Badge>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 active:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 active:opacity-100">
                        <span className="text-white text-base font-medium bg-black/50 px-4 py-2 rounded-lg">Tap to Annotate</span>
                      </div>
                    </div>
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      {editingNoteId === photo.id ? (
                        <div className="flex gap-2">
                          <Input
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                            placeholder="Add note..."
                            className="h-11 sm:h-10 text-base sm:text-sm flex-1"
                            autoFocus
                            onKeyDown={(e) => e.key === "Enter" && updateNoteMutation.mutate({ photoId: photo.id, note: noteText })}
                            data-testid={`input-note-${photo.id}`}
                          />
                          <Button className="h-11 sm:h-10 px-4" onClick={() => updateNoteMutation.mutate({ photoId: photo.id, note: noteText })} data-testid={`button-save-note-${photo.id}`}>
                            <Save className="h-4 w-4 mr-1.5" />
                            Save
                          </Button>
                          <Button variant="ghost" className="h-11 sm:h-10 w-11 sm:w-10 p-0" onClick={() => setEditingNoteId(null)}>
                            <X className="h-5 w-5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          {photo.note ? (
                            <p className="text-sm text-muted-foreground flex-1 min-w-0">
                              <StickyNote className="h-4 w-4 inline mr-1.5 text-primary" />
                              {photo.note}
                              <button className="ml-2 text-primary hover:underline" onClick={() => { setEditingNoteId(photo.id); setNoteText(photo.note || ""); }}>
                                <Pencil className="h-3.5 w-3.5 inline" />
                              </button>
                            </p>
                          ) : null}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="h-11 sm:h-10 text-sm flex-1"
                          onClick={() => { setEditingNoteId(photo.id); setNoteText(photo.note || ""); }}
                          data-testid={`button-add-note-${photo.id}`}
                        >
                          <StickyNote className="h-4 w-4 mr-2" />
                          {photo.note ? "Edit Note" : "Add Note"}
                        </Button>
                        <Button
                          variant="outline"
                          className="h-11 sm:h-10 text-sm flex-1"
                          onClick={() => setAnnotatingPhoto(photo)}
                          data-testid={`button-annotate-${photo.id}`}
                        >
                          <PenTool className="h-4 w-4 mr-2" />
                          Annotate
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-11 sm:h-10 w-11 sm:w-10 p-0 text-destructive shrink-0"
                          onClick={() => {
                            if (confirm("Delete this photo?")) deletePhotoMutation.mutate(photo.id);
                          }}
                          data-testid={`button-delete-photo-${photo.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* ── Assessment Sections ─────────────────────────────── */}
          <div className="p-4 sm:p-6 border-t">
            <SurveyAssessmentSections survey={survey} surveyId={surveyId} />
          </div>

          {photos.length > 0 && (
            <div className="flex gap-2 flex-wrap sticky bottom-4 bg-background/80 backdrop-blur-sm p-3 rounded-lg border shadow-lg">
              <Button variant="outline" onClick={handleDownloadPdf} className="flex-1 min-w-[120px] h-12 sm:h-10 text-base sm:text-sm" data-testid="button-download-pdf">
                <Download className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                Download PDF
              </Button>
              <Button
                onClick={handleOpenEmailDialog}
                disabled={emailSending}
                className="flex-1 min-w-[120px] h-12 sm:h-10 text-base sm:text-sm"
                data-testid="button-email-survey"
              >
                <Mail className="h-5 w-5 sm:h-4 sm:w-4 mr-2" />
                Email Survey
              </Button>
            </div>
          )}
        </div>
      </div>

      <PhotoAnnotationDialog
        photo={annotatingPhoto}
        open={!!annotatingPhoto}
        onClose={() => setAnnotatingPhoto(null)}
        surveyId={surveyId}
      />

      <Dialog open={emailDialogOpen} onOpenChange={(o) => { if (!emailSending) setEmailDialogOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email Survey Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="email-to">Recipient Email <span className="text-destructive">*</span></Label>
              <Input
                id="email-to"
                type="email"
                placeholder="customer@example.com"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                data-testid="input-email-to"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                data-testid="input-email-subject"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                rows={3}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                data-testid="input-email-message"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                className="flex-1"
                onClick={handleEmail}
                disabled={emailSending}
                data-testid="button-send-email-confirm"
              >
                {emailSending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Send Email
              </Button>
              <Button variant="outline" onClick={() => setEmailDialogOpen(false)} disabled={emailSending} data-testid="button-cancel-email">
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingPhoto} onOpenChange={(o) => !o && setViewingPhoto(null)}>
        <DialogContent className="w-[100vw] max-w-[100vw] sm:max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden p-0 rounded-none sm:rounded-lg gap-0">
          <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
            <DialogTitle className="text-base">Photo {viewingPhoto ? `#${photos.indexOf(viewingPhoto) + 1}` : ""}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-auto p-4 flex items-center justify-center bg-muted/30">
            {viewingPhoto && (
              <img
                src={getImageUrl(viewingPhoto.annotatedImageUrl || viewingPhoto.originalImageUrl)}
                alt="Survey photo"
                className="max-w-full max-h-full object-contain rounded"
              />
            )}
          </div>
          {viewingPhoto?.note && (
            <div className="px-4 py-3 border-t text-sm text-muted-foreground shrink-0">
              <StickyNote className="h-4 w-4 inline mr-2" />
              {viewingPhoto.note}
            </div>
          )}
          <div className="flex gap-2 p-4 border-t shrink-0">
            <Button className="h-12 sm:h-10 flex-1 text-base sm:text-sm" onClick={() => { setAnnotatingPhoto(viewingPhoto); setViewingPhoto(null); }} data-testid="button-annotate-from-view">
              <PenTool className="h-5 w-5 mr-2" />
              Annotate This Photo
            </Button>
            <Button variant="outline" className="h-12 sm:h-10 px-5 text-base sm:text-sm" onClick={() => setViewingPhoto(null)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Assessment Data Type ────────────────────────────────────────────────────
type AssessmentData = {
  sitePlacementDescription?: string;
  siteCovered?: string;
  siteWeatherDependent?: string;
  safetyObstructions?: string;
  accessHeight?: string;
  safetyIssues?: string;
  ladderLiftRequired?: string;
  wallSurface?: string;
  substrateCondition?: string;
  mountingMethods?: string[];
  electricPresent?: string;
  electricalNotes?: string;
  digSafeCallNeeded?: boolean;
  permitRequired?: string;
  permitNotes?: string;
  isReplacementSign?: string;
  removalScheduled?: string;
  signAuditPunchList?: string;
  punchList?: string;
  summaryNotes?: string;
};

type PhotoMeasurements = {
  signWidth?: string;
  signHeight?: string;
  groundToSign?: string;
  squareFootage?: string;
  cutSize?: string;
};

const WALL_SURFACES = ["Drywall", "Glass", "Concrete", "CMU / Block", "Brick", "Stucco", "Wood Siding", "Metal Panel", "Tile", "Other"];
const MOUNTING_METHODS = ["Double-sided Tape", "Anchors", "Standoffs", "Screw-in", "Holes for Posts", "Core Drill for Posts"];
const ACCESS_HEIGHTS = ["Ground Level", "Ladder (up to 14')", "Bucket Truck"];
const LADDER_LIFT_OPTIONS = ["None", "Ladder", "Lift", "Bucket Truck"];
const LADDER_LIFT_LABELS: Record<string, string> = {
  none: "None",
  ladder: "Ladder",
  lift: "Lift",
  bucket_truck: "Bucket Truck",
};

function CharCounter({ value, max }: { value: string; max: number }) {
  return (
    <div className="text-right text-xs text-muted-foreground mt-0.5">
      {value.length} / {max}
    </div>
  );
}

function RadioGroup({ value, onChange, options, testIdPrefix }: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  testIdPrefix?: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(value === opt.value ? "" : opt.value)}
          data-testid={testIdPrefix ? `${testIdPrefix}-${opt.value}` : undefined}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
            value === opt.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${value === opt.value ? "border-primary" : "border-muted-foreground/40"}`}>
            {value === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
          </div>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function MultiToggle({ values, onChange, options, testIdPrefix }: {
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  testIdPrefix?: string;
}) {
  const toggle = (opt: string) => {
    if (values.includes(opt)) onChange(values.filter(v => v !== opt));
    else onChange([...values, opt]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          data-testid={testIdPrefix ? `${testIdPrefix}-${opt.replace(/\s+/g, "-").toLowerCase()}` : undefined}
          className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
            values.includes(opt)
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/50"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

interface AssessmentSectionProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  summary: string;
  children: React.ReactNode;
  hasData: boolean;
  isSaving?: boolean;
  testId?: string;
}

function AssessmentSection({ icon, iconBg, title, summary, children, hasData, isSaving, testId }: AssessmentSectionProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`border rounded-lg overflow-hidden transition-all ${hasData ? "border-primary/30" : "border-border"}`} data-testid={testId}>
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 sm:p-4 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
        onClick={() => setOpen(o => !o)}
        data-testid={testId ? `${testId}-toggle` : undefined}
      >
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{title}</p>
          {summary && <p className="text-xs text-muted-foreground truncate mt-0.5">{summary}</p>}
        </div>
        {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />}
        {!isSaving && hasData && <div className="w-2 h-2 rounded-full bg-primary shrink-0" />}
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
      </button>

      {open && (
        <div className="px-3 sm:px-4 pb-4 border-t bg-muted/10 space-y-4 pt-4">
          {children}
          {isSaving && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Saving…
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SurveyAssessmentSections({ survey, surveyId }: { survey: any; surveyId: number }) {
  const { toast } = useToast();
  const [data, setData] = useState<AssessmentData>(() => (survey.assessmentData as AssessmentData) || {});
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setData((survey.assessmentData as AssessmentData) || {});
  }, [survey.assessmentData]);

  const saveMutation = useMutation({
    mutationFn: async (assessmentData: AssessmentData) => {
      return apiRequest("PATCH", `/api/surveys/${surveyId}`, { assessmentData });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/surveys", surveyId] });
    },
    onError: () => {
      toast({ title: "Failed to auto-save assessment", variant: "destructive" });
    },
  });

  const update = (patch: Partial<AssessmentData>) => {
    setData(d => {
      const next = { ...d, ...patch };
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      debounceTimer.current = setTimeout(() => {
        saveMutation.mutate(next);
      }, 800);
      return next;
    });
  };
  const saving = saveMutation.isPending;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-base sm:text-sm flex items-center gap-2">
        <ClipboardList className="h-5 w-5 sm:h-4 sm:w-4" />
        Site Assessment
      </h3>

      {/* 1. Site Overview */}
      <AssessmentSection
        icon={<Building2 className="h-5 w-5 text-blue-600" />}
        iconBg="bg-blue-50 dark:bg-blue-950"
        title="Site Overview"
        summary={[
          data.sitePlacementDescription && `Placement: ${data.sitePlacementDescription.slice(0, 40)}`,
          data.siteCovered && `Site: ${data.siteCovered === "covered" ? "Covered" : "Not covered"}`,
          data.siteWeatherDependent === "weather_dependent" && "Weather dependent",
        ].filter(Boolean).join(" · ")}
        hasData={!!(data.sitePlacementDescription || data.siteCovered || data.siteWeatherDependent)}
        isSaving={saving}
        testId="section-site-overview"
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium">General description / placement of sign</Label>
          <Textarea
            rows={3}
            placeholder="Describe where the sign will be installed..."
            value={data.sitePlacementDescription || ""}
            onChange={e => update({ sitePlacementDescription: e.target.value })}
            maxLength={300}
            data-testid="input-site-placement"
          />
          <CharCounter value={data.sitePlacementDescription || ""} max={300} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Site covered?</Label>
          <RadioGroup
            value={data.siteCovered || ""}
            onChange={v => update({ siteCovered: v })}
            options={[{ label: "Covered", value: "covered" }, { label: "Not covered", value: "not_covered" }]}
            testIdPrefix="radio-site-covered"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Site weather dependent?</Label>
          <RadioGroup
            value={data.siteWeatherDependent || ""}
            onChange={v => update({ siteWeatherDependent: v })}
            options={[{ label: "Weather dependent", value: "weather_dependent" }, { label: "Not weather dependent", value: "not_weather_dependent" }]}
            testIdPrefix="radio-weather"
          />
        </div>
      </AssessmentSection>

      {/* 2. Access */}
      <AssessmentSection
        icon={<CheckSquare className="h-5 w-5 text-orange-600" />}
        iconBg="bg-orange-50 dark:bg-orange-950"
        title="Access"
        summary={[
          data.safetyObstructions && `Obstructions noted`,
          data.accessHeight && data.accessHeight,
          data.ladderLiftRequired && data.ladderLiftRequired !== "none" && `Equipment: ${LADDER_LIFT_LABELS[data.ladderLiftRequired] ?? data.ladderLiftRequired}`,
        ].filter(Boolean).join(" · ")}
        hasData={!!(data.safetyObstructions || data.accessHeight || data.safetyIssues || data.ladderLiftRequired)}
        isSaving={saving}
        testId="section-safety-access"
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium">Safety / Accessibility or Obstructions?</Label>
          <Textarea
            rows={3}
            placeholder="Describe any obstructions or accessibility concerns..."
            value={data.safetyObstructions || ""}
            onChange={e => update({ safetyObstructions: e.target.value })}
            maxLength={300}
            data-testid="input-safety-obstructions"
          />
          <CharCounter value={data.safetyObstructions || ""} max={300} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Access height</Label>
          <Select value={data.accessHeight || ""} onValueChange={v => update({ accessHeight: v })}>
            <SelectTrigger data-testid="select-access-height">
              <SelectValue placeholder="Select access height..." />
            </SelectTrigger>
            <SelectContent>
              {ACCESS_HEIGHTS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Any potential safety issues?</Label>
          <Textarea
            rows={2}
            placeholder="Note any safety concerns..."
            value={data.safetyIssues || ""}
            onChange={e => update({ safetyIssues: e.target.value })}
            maxLength={300}
            data-testid="input-safety-issues"
          />
          <CharCounter value={data.safetyIssues || ""} max={300} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Ladder or lift required?</Label>
          <Select value={data.ladderLiftRequired || ""} onValueChange={v => update({ ladderLiftRequired: v })}>
            <SelectTrigger data-testid="select-ladder-lift">
              <SelectValue placeholder="Select equipment needed..." />
            </SelectTrigger>
            <SelectContent>
              {LADDER_LIFT_OPTIONS.map(o => <SelectItem key={o} value={o.toLowerCase().replace(/\s+/g, "_")}>{o}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </AssessmentSection>

      {/* 3. Wall & Mounting */}
      <AssessmentSection
        icon={<Wrench className="h-5 w-5 text-green-600" />}
        iconBg="bg-green-50 dark:bg-green-950"
        title="Wall & Mounting"
        summary={[
          data.wallSurface && `Wall: ${data.wallSurface}`,
          data.mountingMethods?.length && `Mounting: ${data.mountingMethods.join(", ")}`,
        ].filter(Boolean).join(" · ")}
        hasData={!!(data.wallSurface || data.mountingMethods?.length || data.substrateCondition)}
        isSaving={saving}
        testId="section-wall-mounting"
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium">Wall Surface / Substrate Type</Label>
          <Select value={data.wallSurface || ""} onValueChange={v => update({ wallSurface: v })}>
            <SelectTrigger data-testid="select-wall-surface">
              <SelectValue placeholder="Select wall surface..." />
            </SelectTrigger>
            <SelectContent>
              {WALL_SURFACES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Document substrate condition</Label>
          <Textarea
            rows={2}
            placeholder="Describe the condition of the substrate..."
            value={data.substrateCondition || ""}
            onChange={e => update({ substrateCondition: e.target.value })}
            maxLength={300}
            data-testid="input-substrate-condition"
          />
          <CharCounter value={data.substrateCondition || ""} max={300} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Mounting / Attachment Method</Label>
          <MultiToggle
            values={data.mountingMethods || []}
            onChange={v => update({ mountingMethods: v })}
            options={MOUNTING_METHODS}
            testIdPrefix="toggle-mount"
          />
        </div>
      </AssessmentSection>

      {/* 4. Electrical */}
      <AssessmentSection
        icon={<Zap className="h-5 w-5 text-yellow-600" />}
        iconBg="bg-yellow-50 dark:bg-yellow-950"
        title="Electrical"
        summary={[
          data.electricPresent && `Electric: ${data.electricPresent === "yes" ? "Present" : data.electricPresent === "no" ? "Not present" : "Unknown"}`,
          data.digSafeCallNeeded && "Dig Safe Call required",
        ].filter(Boolean).join(" · ")}
        hasData={!!(data.electricPresent || data.electricalNotes || data.digSafeCallNeeded)}
        isSaving={saving}
        testId="section-electrical"
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium">Is electric present at the sign?</Label>
          <RadioGroup
            value={data.electricPresent || ""}
            onChange={v => update({ electricPresent: v })}
            options={[
              { label: "Yes", value: "yes" },
              { label: "No", value: "no" },
              { label: "Don't Know", value: "dont_know" },
            ]}
            testIdPrefix="radio-electric"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Electrical notes</Label>
          <Textarea
            rows={3}
            placeholder="Any electrical notes or requirements..."
            value={data.electricalNotes || ""}
            onChange={e => update({ electricalNotes: e.target.value })}
            maxLength={300}
            data-testid="input-electrical-notes"
          />
          <CharCounter value={data.electricalNotes || ""} max={300} />
        </div>
        <div className="flex items-center gap-3 py-1">
          <Checkbox
            id="dig-safe"
            checked={!!data.digSafeCallNeeded}
            onCheckedChange={v => update({ digSafeCallNeeded: !!v })}
            data-testid="checkbox-dig-safe"
          />
          <label htmlFor="dig-safe" className="text-sm font-medium cursor-pointer">
            Dig Safe Call Needed
          </label>
        </div>
      </AssessmentSection>

      {/* 5. Permit & Dig Safe */}
      <AssessmentSection
        icon={<FileCheck className="h-5 w-5 text-purple-600" />}
        iconBg="bg-purple-50 dark:bg-purple-950"
        title="Permit & Dig Safe"
        summary={[
          data.permitRequired && `Permit: ${data.permitRequired === "yes" ? "Required" : "Not required"}`,
          data.permitNotes && `Notes on file`,
        ].filter(Boolean).join(" · ")}
        hasData={!!(data.permitRequired || data.permitNotes)}
        isSaving={saving}
        testId="section-permitting"
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium">Permit required?</Label>
          <RadioGroup
            value={data.permitRequired || ""}
            onChange={v => update({ permitRequired: v })}
            options={[{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]}
            testIdPrefix="radio-permit"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Permit info / notes</Label>
          <Textarea
            rows={3}
            placeholder="Permit details, application numbers, notes..."
            value={data.permitNotes || ""}
            onChange={e => update({ permitNotes: e.target.value })}
            maxLength={300}
            data-testid="input-permit-notes"
          />
          <CharCounter value={data.permitNotes || ""} max={300} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Dig Safe call needed?</Label>
          <RadioGroup
            value={data.digSafeCallNeeded === true ? "yes" : data.digSafeCallNeeded === false ? "no" : ""}
            onChange={v => update({ digSafeCallNeeded: v === "yes" })}
            options={[{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]}
            testIdPrefix="radio-dig-safe"
          />
        </div>
      </AssessmentSection>

      {/* 6. Sign Audit */}
      <AssessmentSection
        icon={<ClipboardCheck className="h-5 w-5 text-red-600" />}
        iconBg="bg-red-50 dark:bg-red-950"
        title="Sign Audit"
        summary={[
          data.isReplacementSign && `Replacement: ${data.isReplacementSign === "yes" ? "Yes" : "No"}`,
          data.removalScheduled === "yes" && "Removal scheduled",
        ].filter(Boolean).join(" · ")}
        hasData={!!(data.isReplacementSign || data.removalScheduled || data.signAuditPunchList)}
        isSaving={saving}
        testId="section-sign-audit"
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium">Is this a replacement sign?</Label>
          <RadioGroup
            value={data.isReplacementSign || ""}
            onChange={v => update({ isReplacementSign: v })}
            options={[{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]}
            testIdPrefix="radio-replacement"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Removal scheduled?</Label>
          <RadioGroup
            value={data.removalScheduled || ""}
            onChange={v => update({ removalScheduled: v })}
            options={[{ label: "Yes", value: "yes" }, { label: "No", value: "no" }]}
            testIdPrefix="radio-removal"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">To do / Punch list</Label>
          <Textarea
            rows={3}
            placeholder="List action items for this sign..."
            value={data.signAuditPunchList || ""}
            onChange={e => update({ signAuditPunchList: e.target.value })}
            maxLength={300}
            data-testid="input-audit-punchlist"
          />
          <CharCounter value={data.signAuditPunchList || ""} max={300} />
        </div>
      </AssessmentSection>

      {/* 7. Notes */}
      <AssessmentSection
        icon={<BookOpen className="h-5 w-5 text-gray-600" />}
        iconBg="bg-gray-100 dark:bg-gray-800"
        title="Notes"
        summary={[
          data.punchList && `Punch list: ${data.punchList.slice(0, 40)}${data.punchList.length > 40 ? "..." : ""}`,
          data.summaryNotes && `Summary on file`,
        ].filter(Boolean).join(" · ")}
        hasData={!!(data.punchList || data.summaryNotes)}
        isSaving={saving}
        testId="section-notes"
      >
        <div className="space-y-2">
          <Label className="text-xs font-medium">To do / Punch list</Label>
          <Textarea
            rows={4}
            placeholder="To do / punch list"
            value={data.punchList || ""}
            onChange={e => update({ punchList: e.target.value })}
            maxLength={300}
            data-testid="input-punchlist"
          />
          <CharCounter value={data.punchList || ""} max={300} />
        </div>
        <div className="space-y-2">
          <Label className="text-xs font-medium">Summary notes</Label>
          <Textarea
            rows={4}
            placeholder="Summary notes"
            value={data.summaryNotes || ""}
            onChange={e => update({ summaryNotes: e.target.value })}
            maxLength={300}
            data-testid="input-summary-notes"
          />
          <CharCounter value={data.summaryNotes || ""} max={300} />
        </div>
      </AssessmentSection>
    </div>
  );
}

export default function SurveyPage() {
  const [matchList] = useRoute("/surveys");
  const [matchNew] = useRoute("/surveys/new");
  const [matchDetail, paramsDetail] = useRoute("/surveys/:id");
  const [matchEdit, paramsEdit] = useRoute("/surveys/:id/edit");

  const searchParams = new URLSearchParams(window.location.search);
  const calendarEventId = searchParams.get("calendarEventId");
  const qsJobName = searchParams.get("jobName") || "";
  const qsAddress = searchParams.get("address") || "";
  const qsDescription = searchParams.get("description") || "";

  if (matchNew) {
    return <SurveyFormPage
      calendarEventId={calendarEventId ? parseInt(calendarEventId) : undefined}
      initialJobName={qsJobName}
      initialAddress={qsAddress}
      initialDescription={qsDescription}
    />;
  }

  if (matchEdit && paramsEdit?.id) {
    return <SurveyFormPage surveyId={parseInt(paramsEdit.id)} />;
  }

  if (matchDetail && paramsDetail?.id) {
    return <SurveyDetailPage surveyId={parseInt(paramsDetail.id)} />;
  }

  return <SurveyListPage />;
}
