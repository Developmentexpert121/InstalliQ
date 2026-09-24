import { useState, useEffect, useRef, useMemo } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { 
  ArrowLeft, 
  Download, 
  Mail, 
  Calendar, 
  Tag, 
  FileText,
  Clock,
  User,
  Loader2,
  Sparkles,
  Trash2,
  Edit,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Save,
  X,
  Phone,
  MapPin,
  Building,
  AtSign,
  Plus,
  Upload,
  StickyNote,
  Camera,
  Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageHeader } from "@/lib/page-header";
import { getImageUrl } from "@/lib/image-url";
import { LazyImage } from "@/components/ui/lazy-image";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { LastUpdates } from "@/components/last-updates";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { Project } from "@shared/schema";


export default function ProjectDetailPage() {
  const [, params] = useRoute("/projects/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { setHeaderInfo } = usePageHeader();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin" || user?.role === "super_admin" || (user?.role === "user" && user?.jobTitle === "Install Manager");
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxZoomed, setLightboxZoomed] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [selectedImageUrls, setSelectedImageUrls] = useState<Set<string>>(new Set());
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [imageToRemove, setImageToRemove] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const MAX_PHOTOS = 50;

  const projectId = params?.id;

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: globalTagsData = [] } = useQuery<{ id: number; name: string; color: string | null }[]>({
    queryKey: ["/api/global-tags"],
  });

  const { data: ownerTagsData = [] } = useQuery<{ id: number; name: string; color: string | null }[]>({
    queryKey: ["/api/owner-tags"],
  });

  const allAvailableTags = useMemo(() => {
    const globalNames = globalTagsData.map((t) => t.name);
    const ownerNames = ownerTagsData.map((t) => t.name).filter((n) => !globalNames.includes(n));
    const combined = [...globalNames, ...ownerNames].sort();
    // Also include any existing project tags not in the list (backward compat)
    const existing = project?.tags || [];
    const extra = existing.filter((t: string) => !combined.includes(t));
    return [...combined, ...extra];
  }, [globalTagsData, ownerTagsData, project?.tags]);

  useEffect(() => {
    setHeaderInfo({
      title: project?.jobLabel || "Project Details",
      description: project ? format(new Date(project.createdAt), "MMMM d, yyyy 'at' h:mm a") : "Loading...",
      icon: <FileText className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
      actions: (
        <Link href="/dashboard">
          <Button variant="outline" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </Link>
      ),
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo, project]);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project deleted",
        description: "The project has been removed.",
      });
      setLocation("/dashboard");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete project.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      return apiRequest("PATCH", `/api/projects/${projectId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project updated",
        description: "Your changes have been saved.",
      });
      setIsEditing(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update project.",
        variant: "destructive",
      });
    },
  });

  const reportIssueMutation = useMutation({
    mutationFn: async (hasIssue: boolean) => {
      return apiRequest("POST", `/api/projects/${projectId}/report-issue`, { hasIssue });
    },
    onSuccess: (_, hasIssue) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      if (hasIssue) {
        toast({
          title: "Issue Reported",
          description: "Notification sent to Waltham.Install@fastsigns.com",
        });
      } else {
        toast({
          title: "Issue Cleared",
          description: "Issue flag has been removed.",
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update issue status.",
        variant: "destructive",
      });
    },
  });

  const openImagePicker = () => {
    const allUrls = project?.imageUrls || [];
    // Pre-select all images by default
    setSelectedImageUrls(new Set(allUrls));
    setShowImagePicker(true);
  };

  const handleDownloadPDF = async (imageUrlsToInclude?: string[]) => {
    setIsDownloading(true);
    setShowImagePicker(false);
    try {
      const allUrls = project?.imageUrls || [];
      const usePost = allUrls.length > 0;
      const body = usePost
        ? JSON.stringify({ selectedImageUrls: imageUrlsToInclude ?? allUrls })
        : undefined;

      const res = await fetch(`/api/projects/${projectId}/pdf`, {
        method: usePost ? "POST" : "GET",
        credentials: "include",
        headers: usePost ? { "Content-Type": "application/json" } : undefined,
        body,
      });
      if (!res.ok) throw new Error("Failed to generate PDF");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `project-${projectId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "PDF Downloaded",
        description: "Your project report has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download PDF.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleEmailPDF = async () => {
    setIsEmailing(true);
    try {
      if (!project?.customerEmail) {
        toast({
          title: "No Customer Email",
          description: "This booking does not have a customer email on file.",
          variant: "destructive",
        });
        setIsEmailing(false);
        return;
      }
      const res = await fetch(`/api/projects/${projectId}/email`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send email");
      }

      setEmailSent(true);
      toast({
        title: "Email Sent",
        description: `Project report has been sent to ${project.customerName || "the customer"} (${project.customerEmail}).`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Failed to send email.",
        variant: "destructive",
      });
    } finally {
      setIsEmailing(false);
    }
  };

  const startEditing = () => {
    if (!project) return;
    setEditForm({
      jobLabel: project.jobLabel || "",
      description: project.description || "",
      tags: [...(project.tags || [])],
      customerName: project.customerName || "",
      customerPhone: project.customerPhone || "",
      customerEmail: project.customerEmail || "",
      address: project.address || "",
      city: project.city || "",
      state: project.state || "",
      postalCode: project.postalCode || "",
      issueDescription: project.issueDescription || "",
      notes: project.notes || "",
      imageUrls: [...(project.imageUrls || [])],
    });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditForm({});
  };

  const handleSave = () => {
    updateMutation.mutate(editForm);
  };


  const removeImage = (indexToRemove: number) => {
    setEditForm(prev => {
      const urls = [...(prev.imageUrls || [])];
      urls.splice(indexToRemove, 1);
      return { ...prev, imageUrls: urls };
    });
    if (currentImageIndex >= (editForm.imageUrls?.length || 1) - 1) {
      setCurrentImageIndex(Math.max(0, currentImageIndex - 1));
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const existingCount = editForm.imageUrls?.length || 0;
    const remaining = MAX_PHOTOS - existingCount;
    if (remaining <= 0) {
      toast({ title: "Photo limit reached", description: `Maximum ${MAX_PHOTOS} photos allowed per project.`, variant: "destructive" });
      if (e.target) e.target.value = "";
      return;
    }
    const filesToUpload = Array.from(files).slice(0, remaining);
    if (filesToUpload.length < files.length) {
      toast({ title: "Some photos skipped", description: `Only ${filesToUpload.length} photo(s) added — maximum ${MAX_PHOTOS} per project.` });
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      for (const file of filesToUpload) {
        formData.append("images", file);
      }
      const res = await fetch(`/api/projects/${projectId}/images`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to upload images");
      const updated = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if (isEditing) {
        setEditForm(prev => ({ ...prev, imageUrls: updated.imageUrls }));
      }
      toast({
        title: "Images uploaded",
        description: `${filesToUpload.length} image(s) added to the project.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to upload images.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-4xl mx-auto">
          <Skeleton className="h-8 w-48 mb-6" />
          <Skeleton className="h-96 w-full rounded-lg mb-6" />
          <div className="space-y-4">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <Button onClick={() => setLocation("/dashboard")}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-4xl mx-auto p-4 pb-20">
        {(isAdmin || (!!user && project?.userId === user.id)) && (
          <div className="flex justify-end gap-2 mb-4 flex-wrap">
            {isEditing ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={cancelEditing}
                  data-testid="button-cancel-edit"
                >
                  <X className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  data-testid="button-save-edit"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 sm:mr-2" />
                  )}
                  <span className="hidden sm:inline">Save Changes</span>
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={startEditing}
                  data-testid="button-edit"
                >
                  <Edit className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Edit</span>
                </Button>
                {isAdmin && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" data-testid="button-delete">
                        <Trash2 className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Delete</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Project?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the project
                          and its associated data.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteMutation.mutate()}
                          className="bg-destructive text-destructive-foreground"
                          data-testid="button-confirm-delete"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
          </div>
        )}

        {isEditing ? (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
              data-testid="input-image-gallery"
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleImageUpload}
              data-testid="input-image-camera"
            />
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-5 w-5" />
                    Project Images ({editForm.imageUrls?.length || 0} / {MAX_PHOTOS})
                  </div>
                  {isUploading ? (
                    <Button variant="outline" disabled data-testid="button-upload-images">
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={(editForm.imageUrls?.length || 0) >= MAX_PHOTOS}
                        data-testid="button-camera-upload"
                      >
                        <Camera className="h-4 w-4 mr-1" />
                        Camera
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={(editForm.imageUrls?.length || 0) >= MAX_PHOTOS}
                        data-testid="button-gallery-upload"
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Gallery
                      </Button>
                    </div>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {editForm.imageUrls && editForm.imageUrls.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                    {editForm.imageUrls.map((url: string, index: number) => (
                      <div key={`${url}-${index}`} className="relative group rounded-md overflow-visible">
                        <LazyImage
                          src={getImageUrl(url)}
                          alt={`Project image ${index + 1}`}
                          className="w-full h-32 rounded-md"
                          iconSize="sm"
                        />
                        <Button
                          variant="destructive"
                          size="icon"
                          className="absolute -top-2 -right-2 h-7 w-7 rounded-full opacity-100 transition-opacity"
                          onClick={() => setImageToRemove(index)}
                          data-testid={`button-remove-image-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {(editForm.imageUrls?.length || 0) < MAX_PHOTOS && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading}
                        className="w-full h-32 rounded-md border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 text-muted-foreground hover-elevate"
                        data-testid="button-add-image-tile"
                      >
                        {isUploading ? (
                          <Loader2 className="h-6 w-6 animate-spin" />
                        ) : (
                          <Plus className="h-6 w-6" />
                        )}
                        <span className="text-xs">{isUploading ? "Uploading..." : "Add More"}</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-muted-foreground/30 rounded-md gap-2 text-muted-foreground cursor-pointer hover-elevate"
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="button-upload-empty"
                  >
                    {isUploading ? (
                      <Loader2 className="h-8 w-8 animate-spin" />
                    ) : (
                      <Upload className="h-8 w-8" />
                    )}
                    <span className="text-sm">{isUploading ? "Uploading..." : "Click to upload images"}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="mb-6 overflow-hidden">
              <CardContent className="p-0">
                {project.imageUrls && project.imageUrls.length > 0 ? (
                  <div className="relative">
                    <button
                      type="button"
                      className="block w-full cursor-zoom-in"
                      onClick={() => { setLightboxZoomed(false); setLightboxOpen(true); }}
                      aria-label="Open full-size image"
                      data-testid="button-open-lightbox"
                    >
                      <LazyImage
                        src={getImageUrl(project.imageUrls[currentImageIndex])}
                        alt={`Project image ${currentImageIndex + 1}`}
                        className="w-full max-h-[70vh]"
                        objectFit="contain"
                        iconSize="lg"
                        priority={true}
                      />
                    </button>

                    {project.imageUrls.length > 1 && (
                      <>
                        <div className="absolute top-1/2 left-2 -translate-y-1/2">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="rounded-full bg-background/80"
                            onClick={() => setCurrentImageIndex(prev => 
                              prev === 0 ? project.imageUrls!.length - 1 : prev - 1
                            )}
                            data-testid="button-prev-image"
                          >
                            <ChevronLeft className="h-5 w-5" />
                          </Button>
                        </div>
                        <div className="absolute top-1/2 right-2 -translate-y-1/2">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="rounded-full bg-background/80"
                            onClick={() => setCurrentImageIndex(prev => 
                              prev === project.imageUrls!.length - 1 ? 0 : prev + 1
                            )}
                            data-testid="button-next-image"
                          >
                            <ChevronRight className="h-5 w-5" />
                          </Button>
                        </div>
                        
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/80 px-3 py-1 rounded-full">
                          <span className="text-sm font-medium">
                            {currentImageIndex + 1} / {project.imageUrls.length}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 bg-muted">
                    <ImageIcon className="h-12 w-12 text-muted-foreground" />
                  </div>
                )}
              </CardContent>
            </Card>

            {project.imageUrls && project.imageUrls.length > 1 && (
              <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {project.imageUrls.map((url, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                      index === currentImageIndex 
                        ? "border-primary" 
                        : "border-transparent hover:border-muted-foreground/50"
                    }`}
                    data-testid={`thumbnail-${index}`}
                  >
                    <LazyImage
                      src={getImageUrl(url)}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full"
                      iconSize="sm"
                    />
                  </button>
                ))}
              </div>
            )}

            {/* Full-size image lightbox with click-to-zoom */}
            {project.imageUrls && project.imageUrls.length > 0 && (
              <Dialog open={lightboxOpen} onOpenChange={(o) => { setLightboxOpen(o); if (!o) setLightboxZoomed(false); }}>
                <DialogContent
                  className="max-w-[100vw] w-screen h-screen sm:max-w-[100vw] p-0 border-0 bg-black/95 flex items-center justify-center"
                  data-testid="dialog-lightbox"
                >
                  <DialogTitle className="sr-only">Project image {currentImageIndex + 1}</DialogTitle>
                  <div className={`w-full h-full flex items-center justify-center ${lightboxZoomed ? "overflow-auto" : "overflow-hidden"}`}>
                    <img
                      src={getImageUrl(project.imageUrls[currentImageIndex]) ?? undefined}
                      alt={`Project image ${currentImageIndex + 1}`}
                      onClick={() => setLightboxZoomed(z => !z)}
                      className={lightboxZoomed
                        ? "max-w-none cursor-zoom-out"
                        : "max-w-[100vw] max-h-[100vh] object-contain cursor-zoom-in"}
                      data-testid="img-lightbox"
                    />
                  </div>

                  {project.imageUrls.length > 1 && (
                    <>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-1/2 left-3 -translate-y-1/2 rounded-full bg-background/80"
                        onClick={(e) => { e.stopPropagation(); setLightboxZoomed(false); setCurrentImageIndex(prev => prev === 0 ? project.imageUrls!.length - 1 : prev - 1); }}
                        data-testid="button-lightbox-prev"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full bg-background/80"
                        onClick={(e) => { e.stopPropagation(); setLightboxZoomed(false); setCurrentImageIndex(prev => prev === project.imageUrls!.length - 1 ? 0 : prev + 1); }}
                        data-testid="button-lightbox-next"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 bg-background/80 px-3 py-1 rounded-full">
                        <span className="text-sm font-medium">{currentImageIndex + 1} / {project.imageUrls.length}</span>
                      </div>
                    </>
                  )}
                </DialogContent>
              </Dialog>
            )}
          </>
        )}

        <div className="flex gap-3 mb-6">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => {
              const allUrls = project?.imageUrls || [];
              if (allUrls.length > 1) {
                openImagePicker();
              } else {
                handleDownloadPDF();
              }
            }}
            disabled={isDownloading}
            data-testid="button-download-pdf"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download PDF
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleEmailPDF}
            disabled={isEmailing}
            data-testid="button-email-pdf"
          >
            {isEmailing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : emailSent ? (
              <Send className="h-4 w-4 mr-2" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            {emailSent ? "Resend Report" : "Email Report"}
          </Button>
        </div>

        <Card className={`mb-6 ${project.hasIssue ? 'border-2 border-red-500 bg-red-50 dark:bg-red-950/20' : ''}`}>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Checkbox
                id="issue-checkbox"
                checked={project.hasIssue}
                onCheckedChange={(checked) => reportIssueMutation.mutate(!!checked)}
                disabled={reportIssueMutation.isPending}
                className={`h-6 w-6 border-2 ${project.hasIssue ? 'border-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500' : ''}`}
                data-testid="checkbox-issue"
              />
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${project.hasIssue ? 'text-red-500' : 'text-muted-foreground'}`} />
                <Label 
                  htmlFor="issue-checkbox"
                  className={`text-base font-semibold ${project.hasIssue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}
                >
                  {project.hasIssue ? 'ISSUE REPORTED' : 'Report an Issue'}
                </Label>
              </div>
              {project.hasIssue && (
                <Badge variant="destructive" className="ml-auto">
                  Issue Reported
                </Badge>
              )}
            </div>
            {project.hasIssue && project.issueDescription && !isEditing && (
              <p className="mt-3 text-sm text-red-600 dark:text-red-400 ml-10">{project.issueDescription}</p>
            )}
          </CardContent>
        </Card>

        {isEditing ? (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Job Label
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  // Admins, Install Managers, and the user who created
                  // this project may edit the Job Label. For everyone
                  // else the field stays read-only as before.
                  const canEditJobLabel = isAdmin || (!!user && project?.userId === user.id);
                  return (
                    <Input
                      value={editForm.jobLabel || ""}
                      onChange={(e) =>
                        canEditJobLabel &&
                        setEditForm((prev) => ({ ...prev, jobLabel: e.target.value }))
                      }
                      readOnly={!canEditJobLabel}
                      disabled={!canEditJobLabel}
                      className={canEditJobLabel ? "" : "opacity-70 cursor-not-allowed"}
                      placeholder="e.g. 401-51023"
                      data-testid="input-job-label"
                    />
                  );
                })()}
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {allAvailableTags.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tags available. Ask your admin to add tags from the dashboard.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {allAvailableTags.map((tag) => {
                      const isSelected = editForm.tags?.includes(tag);
                      return (
                        <div key={tag} className="flex items-center gap-2">
                          <Checkbox
                            id={`tag-${tag}`}
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setEditForm(prev => ({
                                  ...prev,
                                  tags: [...(prev.tags || []), tag],
                                }));
                              } else {
                                setEditForm(prev => ({
                                  ...prev,
                                  tags: (prev.tags || []).filter((t: string) => t !== tag),
                                }));
                              }
                            }}
                            data-testid={`checkbox-tag-${tag.replace(/\s+/g, "-").toLowerCase()}`}
                          />
                          <Label
                            htmlFor={`tag-${tag}`}
                            className="text-sm cursor-pointer"
                          >
                            {tag}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editForm.description || ""}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter project description"
                  className="min-h-[150px]"
                  data-testid="input-description"
                />
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    <User className="h-4 w-4" /> Customer Name
                  </Label>
                  <Input
                    value={editForm.customerName || ""}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customerName: e.target.value }))}
                    placeholder="Customer name"
                    data-testid="input-customer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    <Phone className="h-4 w-4" /> Phone
                  </Label>
                  <Input
                    value={editForm.customerPhone || ""}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                    placeholder="Phone number"
                    data-testid="input-customer-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    <AtSign className="h-4 w-4" /> Email
                  </Label>
                  <Input
                    value={editForm.customerEmail || ""}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customerEmail: e.target.value }))}
                    placeholder="Customer email"
                    type="email"
                    data-testid="input-customer-email"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-muted-foreground">Address</Label>
                  <Input
                    value={editForm.address || ""}
                    onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Street address"
                    data-testid="input-address"
                  />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">City</Label>
                    <Input
                      value={editForm.city || ""}
                      onChange={(e) => setEditForm(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="City"
                      data-testid="input-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm text-muted-foreground">State</Label>
                    <Input
                      value={editForm.state || ""}
                      onChange={(e) => setEditForm(prev => ({ ...prev, state: e.target.value }))}
                      placeholder="State"
                      data-testid="input-state"
                    />
                  </div>
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <Label className="text-sm text-muted-foreground">Zip Code</Label>
                    <Input
                      value={editForm.postalCode || ""}
                      onChange={(e) => setEditForm(prev => ({ ...prev, postalCode: e.target.value }))}
                      placeholder="Zip code"
                      data-testid="input-postal-code"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Issue Description
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editForm.issueDescription || ""}
                  onChange={(e) => setEditForm(prev => ({ ...prev, issueDescription: e.target.value }))}
                  placeholder="Describe any issues with this project"
                  data-testid="input-issue-description"
                />
              </CardContent>
            </Card>

            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <StickyNote className="h-5 w-5" />
                  Add Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={editForm.notes || ""}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Add any notes about this project..."
                  rows={4}
                  data-testid="input-notes"
                />
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Tags
                </CardTitle>
              </CardHeader>
              <CardContent>
                {project.tags && project.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {project.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant={project.aiSuggestedTags?.includes(tag) ? "default" : "secondary"}
                      >
                        {project.aiSuggestedTags?.includes(tag) && (
                          <Sparkles className="h-3 w-3 mr-1" />
                        )}
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No tags assigned</p>
                )}
              </CardContent>
            </Card>

            {project.description && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Description
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap">{project.description}</p>
                </CardContent>
              </Card>
            )}

            {project.notes && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <StickyNote className="h-5 w-5" />
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap" data-testid="text-notes">{project.notes}</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.jobLabel && (
                  <>
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Job Label</p>
                        <p className="font-medium">{project.jobLabel}</p>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}
                {(project.customerName || project.customerPhone || project.customerEmail) && (
                  <>
                    <div className="flex items-center gap-3">
                      <User className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Customer</p>
                        {project.customerName && <p className="font-medium">{project.customerName}</p>}
                        {project.customerPhone && (
                          <p className="text-sm text-muted-foreground">{project.customerPhone}</p>
                        )}
                        {project.customerEmail && (
                          <p className="text-sm text-muted-foreground">{project.customerEmail}</p>
                        )}
                      </div>
                    </div>
                    <Separator />
                  </>
                )}
                {(project.address || project.city || project.state) && (
                  <>
                    <div className="flex items-center gap-3">
                      <MapPin className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Location</p>
                        <p className="font-medium">
                          {[project.address, project.city, project.state, project.postalCode].filter(Boolean).join(", ")}
                        </p>
                      </div>
                    </div>
                    <Separator />
                  </>
                )}
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium">
                      {format(new Date(project.createdAt), "EEEE, MMMM d, yyyy")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(project.createdAt), "h:mm a")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {project && (
          <div className="mt-4">
            <LastUpdates
              resourceType="project"
              resourceId={project.id}
              title="Last Updates"
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={imageToRemove !== null}
        onOpenChange={(open) => !open && setImageToRemove(null)}
        onConfirm={() => {
          if (imageToRemove !== null) {
            removeImage(imageToRemove);
            setImageToRemove(null);
          }
        }}
        title="Remove Image?"
        description="Are you sure you want to remove this image? You'll need to save your changes for this to take effect."
        confirmLabel="Remove"
        variant="destructive"
      />

      {/* Image picker for PDF download */}
      <Dialog open={showImagePicker} onOpenChange={setShowImagePicker}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Images for PDF</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Choose which images to include in the downloaded PDF.
            </p>
          </DialogHeader>

          <div className="flex items-center justify-between py-2 border-b">
            <span className="text-sm text-muted-foreground">
              {selectedImageUrls.size} of {project?.imageUrls?.length || 0} selected
            </span>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                data-testid="button-select-all-images"
                onClick={() => setSelectedImageUrls(new Set(project?.imageUrls || []))}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                data-testid="button-deselect-all-images"
                onClick={() => setSelectedImageUrls(new Set())}
              >
                Deselect All
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto flex-1 py-2">
            <div className="grid grid-cols-3 gap-3">
              {(project?.imageUrls || []).map((url, index) => {
                const isSelected = selectedImageUrls.has(url);
                return (
                  <div
                    key={url}
                    data-testid={`image-picker-item-${index}`}
                    className={`relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-orange-500 ring-2 ring-orange-500/30"
                        : "border-transparent opacity-60"
                    }`}
                    onClick={() => {
                      setSelectedImageUrls(prev => {
                        const next = new Set(prev);
                        if (next.has(url)) {
                          next.delete(url);
                        } else {
                          next.add(url);
                        }
                        return next;
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
                    <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? "bg-orange-500 border-orange-500"
                        : "bg-white/80 border-gray-400"
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs px-2 py-1 text-center">
                      Photo {index + 1}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="pt-2 border-t gap-2">
            <Button
              variant="outline"
              onClick={() => setShowImagePicker(false)}
              data-testid="button-cancel-image-picker"
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleDownloadPDF(Array.from(selectedImageUrls))}
              disabled={isDownloading}
              data-testid="button-confirm-download-pdf"
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF ({selectedImageUrls.size} image{selectedImageUrls.size !== 1 ? "s" : ""})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
