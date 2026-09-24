import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useLocation, Link, useSearch } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { 
  Camera, 
  Upload, 
  X, 
  Loader2, 
  Sparkles, 
  Check,
  ArrowLeft,
  Image as ImageIcon,
  AlertTriangle,
  Plus,
  ClipboardList,
  Mail,
  Edit2,
  Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePageHeader } from "@/lib/page-header";
import { useAuth } from "@/lib/auth";

const MAX_IMAGES = 50;

export default function ProjectNewPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const { toast } = useToast();
  const { setHeaderInfo } = usePageHeader();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const queryParams = useMemo(() => new URLSearchParams(searchString), [searchString]);

  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  useEffect(() => {
    setHeaderInfo({
      title: "Completed Photos",
      description: "Upload photos and add details",
      icon: <Camera className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
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
  }, [setHeaderInfo]);

  const [description, setDescription] = useState(queryParams.get("description") || "");
  const [jobLabel, setJobLabel] = useState(queryParams.get("jobLabel") || "");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [aiSuggestedTags, setAiSuggestedTags] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasIssue, setHasIssue] = useState(false);
  const [issueDescription, setIssueDescription] = useState("");
  
  const [customerName, setCustomerName] = useState(queryParams.get("customerName") || "");
  const [customerPhone, setCustomerPhone] = useState(queryParams.get("customerPhone") || "");
  const [customerEmail, setCustomerEmail] = useState(queryParams.get("customerEmail") || "");
  const [address, setAddress] = useState(queryParams.get("address") || "");
  const [city, setCity] = useState(queryParams.get("city") || "");
  const [state, setState] = useState(queryParams.get("state") || "MA");
  const [postalCode, setPostalCode] = useState(queryParams.get("postalCode") || "");

  const [duplicateWarning, setDuplicateWarning] = useState<{ count: number; projectIds: number[] } | null>(null);
  const [isCheckingLabel, setIsCheckingLabel] = useState(false);

  useEffect(() => {
    const trimmed = jobLabel.trim();
    if (!trimmed) { setDuplicateWarning(null); return; }
    setIsCheckingLabel(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/check-label?jobLabel=${encodeURIComponent(trimmed)}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setDuplicateWarning(data.exists ? { count: data.count, projectIds: data.projectIds } : null);
        }
      } catch {
        setDuplicateWarning(null);
      } finally {
        setIsCheckingLabel(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [jobLabel]);

  const { data: globalTagsData = [] } = useQuery<{ id: number; name: string; color: string | null; createdAt: string }[]>({
    queryKey: ["/api/global-tags"],
  });

  const { data: ownerTags = [] } = useQuery<{ id: number; name: string; color: string | null; ownerId: number; createdAt: string }[]>({
    queryKey: ["/api/owner-tags"],
  });

  const allTags = useMemo(() => {
    const globalNames = globalTagsData.map((t) => t.name);
    const customTagNames = ownerTags.map((t) => t.name).filter((name) => !globalNames.includes(name));
    return [...globalNames, ...customTagNames];
  }, [globalTagsData, ownerTags]);

  const isAdmin = user?.role === "admin";
  const isSuperAdmin = user?.role === "super_admin";
  const [isTagsEditing, setIsTagsEditing] = useState(false);
  const [newCustomTag, setNewCustomTag] = useState("");
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [editingTagType, setEditingTagType] = useState<"global" | "owner" | null>(null);

  const addOwnerTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/owner-tags", { name });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add tag");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] });
      setNewCustomTag("");
      setSelectedTags(prev => [...prev, data.name]);
      toast({ title: "Tag Added" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateOwnerTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string } }) => {
      const res = await apiRequest("PATCH", `/api/owner-tags/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update tag");
      }
      return res.json();
    },
    onSuccess: (updatedTag, variables) => {
      const oldTag = ownerTags.find(t => t.id === variables.id);
      if (oldTag) {
        setSelectedTags(prev => prev.map(t => t === oldTag.name ? updatedTag.name : t));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] });
      setEditingTagId(null); setEditingTagType(null);
      toast({ title: "Tag Updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteOwnerTagMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/owner-tags/${id}`);
      if (!res.ok) throw new Error("Failed to delete tag");
    },
    onSuccess: (_, deletedId) => {
      const deletedTag = ownerTags.find(t => t.id === deletedId);
      if (deletedTag) {
        setSelectedTags(prev => prev.filter(t => t !== deletedTag.name));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/owner-tags"] });
      toast({ title: "Tag Deleted" });
    },
  });

  const addGlobalTagMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("POST", "/api/global-tags", { name });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to add tag");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] });
      setNewCustomTag("");
      setSelectedTags(prev => [...prev, data.name]);
      toast({ title: "Global Tag Added" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateGlobalTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { name: string } }) => {
      const res = await apiRequest("PATCH", `/api/global-tags/${id}`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to update tag");
      }
      return res.json();
    },
    onSuccess: (updatedTag, variables) => {
      const oldTag = globalTagsData.find(t => t.id === variables.id);
      if (oldTag) {
        setSelectedTags(prev => prev.map(t => t === oldTag.name ? updatedTag.name : t));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] });
      setEditingTagId(null); setEditingTagType(null);
      toast({ title: "Global Tag Updated" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteGlobalTagMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/global-tags/${id}`);
      if (!res.ok) throw new Error("Failed to delete tag");
    },
    onSuccess: (_, deletedId) => {
      const deletedTag = globalTagsData.find(t => t.id === deletedId);
      if (deletedTag) {
        setSelectedTags(prev => prev.filter(t => t !== deletedTag.name));
      }
      queryClient.invalidateQueries({ queryKey: ["/api/global-tags"] });
      toast({ title: "Global Tag Deleted" });
    },
  });

  const createProjectMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/projects", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const data = await res.json();
      if (res.status === 409 && data.existingProjectId) {
        // Booking already has a linked project — redirect to it instead
        return { __redirect: true, id: data.existingProjectId };
      }
      if (!res.ok) {
        throw new Error(data.error || "Failed to create project");
      }
      return data;
    },
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      if ((project as any).__redirect) {
        toast({
          title: "Project already exists",
          description: "This booking already has a project. Opening it now.",
        });
        setLocation(`/projects/${project.id}`);
        return;
      }
      if (project.uploadWarning) {
        toast({
          title: "Project created with warning",
          description: project.uploadWarning,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Project created!",
          description: "Your project has been saved successfully.",
        });
      }
      setLocation(`/projects/${project.id}`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const analyzeImage = async (file: File) => {
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        return data.suggestedTags || [];
      }
    } catch (error) {
      console.error("Image analysis failed:", error);
    }
    return [];
  };

  const handleImageSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newFiles = Array.from(files).slice(0, MAX_IMAGES - imageFiles.length);
    if (newFiles.length === 0) return;

    const newPreviews: string[] = [];
    for (const file of newFiles) {
      const reader = new FileReader();
      const preview = await new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
      });
      newPreviews.push(preview);
    }

    setImageFiles(prev => [...prev, ...newFiles]);
    setImagePreviews(prev => [...prev, ...newPreviews]);

    if (imageFiles.length === 0 && newFiles.length > 0) {
      setIsAnalyzing(true);
      try {
        const tags = await analyzeImage(newFiles[0]);
        setAiSuggestedTags(tags);
        const newTags = tags.filter((t: string) => !selectedTags.includes(t));
        if (newTags.length > 0) {
          setSelectedTags(prev => [...prev, ...newTags]);
          toast({
            title: "AI Tags Detected",
            description: `Auto-selected: ${newTags.join(", ")}`,
          });
        } else if (tags.length === 0) {
          toast({
            title: "No tags detected",
            description: "AI could not identify matching tags for this photo.",
          });
        }
      } finally {
        setIsAnalyzing(false);
      }
    }

    e.target.value = '';
  }, [imageFiles.length, selectedTags]);

  const removeImage = (index: number) => {
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
    setImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (imageFiles.length === 0) {
      toast({
        title: "Images required",
        description: "Please upload at least one image to continue.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    imageFiles.forEach((file) => {
      formData.append("images", file);
    });
    formData.append("description", description);
    formData.append("jobLabel", jobLabel);
    formData.append("tags", JSON.stringify(selectedTags));
    formData.append("aiSuggestedTags", JSON.stringify(aiSuggestedTags));
    formData.append("hasIssue", String(hasIssue));
    if (hasIssue && issueDescription) formData.append("issueDescription", issueDescription);
    
    if (customerName) formData.append("customerName", customerName);
    if (customerPhone) formData.append("customerPhone", customerPhone);
    if (customerEmail) formData.append("customerEmail", customerEmail);
    if (address) formData.append("address", address);
    if (city) formData.append("city", city);
    if (state) formData.append("state", state);
    if (postalCode) formData.append("postalCode", postalCode);

    const calendarEventId = queryParams.get("calendarEventId");
    if (calendarEventId) formData.append("calendarEventId", calendarEventId);

    createProjectMutation.mutate(formData);
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="p-4 pb-20">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Hidden file inputs */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleImageSelect}
            data-testid="input-file-gallery"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleImageSelect}
            data-testid="input-file-camera"
          />

          {/* Photo Upload Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="h-5 w-5" />
                Project Photos
              </CardTitle>
              <CardDescription>
                Take photos or upload from gallery (up to {MAX_IMAGES})
              </CardDescription>
            </CardHeader>
            <CardContent>
              {imagePreviews.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {imagePreviews.map((preview, index) => (
                    <div key={index} className="relative aspect-square rounded-lg overflow-hidden border group">
                      <img
                        src={preview}
                        alt={`Preview ${index + 1}`}
                        className="w-full h-full object-cover"
                        data-testid={`img-preview-${index}`}
                      />
                      <button
                        type="button"
                        className="absolute top-2 right-2 z-10 h-7 w-7 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center transition-colors"
                        onClick={() => removeImage(index)}
                        data-testid={`button-remove-image-${index}`}
                        title="Remove photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      {index === 0 && (
                        <Badge className="absolute bottom-2 left-2 z-10" variant="secondary">
                          Main
                        </Badge>
                      )}
                    </div>
                  ))}
                  
                  {imageFiles.length < MAX_IMAGES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-primary/50 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-colors"
                      data-testid="button-add-more-images"
                    >
                      <Plus className="h-8 w-8" />
                      <span className="text-xs">Add More</span>
                    </button>
                  )}
                </div>
              )}

              {imagePreviews.length === 0 && (
                <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-5 sm:p-8">
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="font-medium">Upload project photos</p>
                      <p className="text-sm text-muted-foreground">
                        Take photos or select from gallery (up to {MAX_IMAGES})
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => cameraInputRef.current?.click()}
                        data-testid="button-camera"
                      >
                        <Camera className="h-4 w-4 mr-2" />
                        Camera
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                        data-testid="button-gallery"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Gallery
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {isAnalyzing && (
                <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                  <Sparkles className="h-4 w-4 animate-pulse text-primary" />
                  Analyzing image for tag suggestions...
                </div>
              )}
            </CardContent>
          </Card>

          {/* Project Details */}
          <Card>
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="jobLabel">Job Label / Number</Label>
                <div className="relative">
                  <Input
                    id="jobLabel"
                    placeholder="e.g., Job #12345"
                    value={jobLabel}
                    onChange={(e) => setJobLabel(e.target.value)}
                    data-testid="input-job-label"
                    className={duplicateWarning ? "border-yellow-500 focus-visible:ring-yellow-500" : ""}
                  />
                  {isCheckingLabel && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                {duplicateWarning && (
                  <div className="flex items-start gap-2 rounded-md border border-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-600 px-3 py-2 text-sm text-yellow-800 dark:text-yellow-300" data-testid="warning-duplicate-label">
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-yellow-600 dark:text-yellow-400" />
                    <span>
                      This job label is already in use
                      {duplicateWarning.count > 1 ? ` (${duplicateWarning.count} existing projects)` : ""}.{" "}
                      {duplicateWarning.projectIds.map((id, i) => (
                        <span key={id}>
                          <Link href={`/projects/${id}`} className="underline font-medium hover:text-yellow-900 dark:hover:text-yellow-100">
                            View project #{id}
                          </Link>
                          {i < duplicateWarning.projectIds.length - 1 ? ", " : ""}
                        </span>
                      ))}{" "}
                      — you can still submit if this is intentional.
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  placeholder="Add notes about the installation..."
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  data-testid="input-description"
                />
              </div>
            </CardContent>
          </Card>

          {/* Customer & Location */}
          <Card>
            <CardHeader>
              <CardTitle>Customer & Location</CardTitle>
              <CardDescription>Customer contact info and installation address</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input
                  id="customerName"
                  placeholder="e.g., ABC Company"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  data-testid="input-customer-name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customerPhone">Phone Number</Label>
                  <Input
                    id="customerPhone"
                    placeholder="e.g., (617) 555-0123"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    data-testid="input-customer-phone"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerEmail">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="customerEmail"
                      type="email"
                      placeholder="e.g., customer@example.com"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      className="pl-9"
                      data-testid="input-customer-email"
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  placeholder="e.g., 123 Main Street"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  data-testid="input-address"
                />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="e.g., Boston"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    data-testid="input-city"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Input
                    id="state"
                    placeholder="MA"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    maxLength={2}
                    data-testid="input-state"
                  />
                </div>
                <div className="space-y-2 col-span-2 sm:col-span-1">
                  <Label htmlFor="postalCode">ZIP Code</Label>
                  <Input
                    id="postalCode"
                    placeholder="e.g., 02101"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    maxLength={10}
                    data-testid="input-postal-code"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tags Selection */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-primary" />
                  Tags
                </CardTitle>
                <CardDescription>Select all applicable tags for this project</CardDescription>
              </div>
              {(isAdmin || isSuperAdmin) && (
                <Button
                  type="button"
                  variant={isTagsEditing ? "default" : "outline"}
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => { setIsTagsEditing(!isTagsEditing); setEditingTagId(null); setEditingTagType(null); setNewCustomTag(""); }}
                  data-testid="button-toggle-edit-tags"
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isTagsEditing && isSuperAdmin && (
                <p className="text-xs font-medium text-muted-foreground">Global Tags</p>
              )}
              <div className="flex flex-wrap gap-x-2 gap-y-2.5">
                {globalTagsData.map((tag) => {
                  const isSelected = selectedTags.includes(tag.name);
                  const isAiSuggested = aiSuggestedTags.includes(tag.name);
                  const isEditingThis = isTagsEditing && editingTagId === tag.id && editingTagType === "global";
                  return (
                    <Badge
                      key={tag.id}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer transition-colors flex items-center gap-1 px-2.5 py-1 ${isSelected ? "" : "border-slate-300 dark:border-slate-600"}`}
                      onClick={() => { if (!isEditingThis) toggleTag(tag.name); }}
                      data-testid={`tag-global-${tag.id}`}
                    >
                      {isEditingThis ? (
                        <input
                          className="bg-transparent border-none outline-none text-sm w-24"
                          defaultValue={tag.name}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            const newName = e.target.value.trim();
                            if (newName && newName !== tag.name) {
                              updateGlobalTagMutation.mutate({ id: tag.id, data: { name: newName } });
                            } else {
                              setEditingTagId(null); setEditingTagType(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newName = (e.target as HTMLInputElement).value.trim();
                              if (newName && newName !== tag.name) {
                                updateGlobalTagMutation.mutate({ id: tag.id, data: { name: newName } });
                              } else {
                                setEditingTagId(null); setEditingTagType(null);
                              }
                            } else if (e.key === "Escape") {
                              setEditingTagId(null); setEditingTagType(null);
                            }
                          }}
                          data-testid={`input-edit-global-tag-${tag.id}`}
                        />
                      ) : (
                        <>
                          {isSelected && <Check className="h-3 w-3" />}
                          {isAiSuggested && !isSelected && <Sparkles className="h-3 w-3" />}
                          {tag.name}
                          {isTagsEditing && isSuperAdmin && (
                            <>
                              <button
                                className="ml-0.5 text-current opacity-60 hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); setEditingTagId(tag.id); setEditingTagType("global"); }}
                                data-testid={`button-edit-global-tag-${tag.id}`}
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                className="text-current opacity-60 hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); deleteGlobalTagMutation.mutate(tag.id); }}
                                data-testid={`button-delete-global-tag-${tag.id}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </Badge>
                  );
                })}
                {ownerTags.filter(t => !globalTagsData.some(g => g.name === t.name)).map((tag) => {
                  const isSelected = selectedTags.includes(tag.name);
                  const isEditingThis = isTagsEditing && editingTagId === tag.id && editingTagType === "owner";
                  return (
                    <Badge
                      key={`owner-${tag.id}`}
                      variant={isSelected ? "default" : "outline"}
                      className={`cursor-pointer transition-colors flex items-center gap-1 px-2.5 py-1 ${isSelected ? "" : "border-primary/30"}`}
                      onClick={() => { if (!isEditingThis) toggleTag(tag.name); }}
                      data-testid={`tag-owner-${tag.id}`}
                    >
                      {isEditingThis ? (
                        <input
                          className="bg-transparent border-none outline-none text-sm w-24"
                          defaultValue={tag.name}
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                          onBlur={(e) => {
                            const newName = e.target.value.trim();
                            if (newName && newName !== tag.name) {
                              updateOwnerTagMutation.mutate({ id: tag.id, data: { name: newName } });
                            } else {
                              setEditingTagId(null); setEditingTagType(null);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const newName = (e.target as HTMLInputElement).value.trim();
                              if (newName && newName !== tag.name) {
                                updateOwnerTagMutation.mutate({ id: tag.id, data: { name: newName } });
                              } else {
                                setEditingTagId(null); setEditingTagType(null);
                              }
                            } else if (e.key === "Escape") {
                              setEditingTagId(null); setEditingTagType(null);
                            }
                          }}
                          data-testid={`input-edit-owner-tag-${tag.id}`}
                        />
                      ) : (
                        <>
                          {isSelected && <Check className="h-3 w-3" />}
                          {tag.name}
                          {isTagsEditing && (
                            <>
                              <button
                                className="ml-0.5 text-current opacity-60 hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); setEditingTagId(tag.id); setEditingTagType("owner"); }}
                                data-testid={`button-edit-owner-tag-${tag.id}`}
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>
                              <button
                                className="text-current opacity-60 hover:opacity-100"
                                onClick={(e) => { e.stopPropagation(); deleteOwnerTagMutation.mutate(tag.id); }}
                                data-testid={`button-delete-owner-tag-${tag.id}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </Badge>
                  );
                })}
              </div>

              {isTagsEditing && (isAdmin || isSuperAdmin) && (
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    placeholder={isSuperAdmin ? "Add global tag..." : "Add custom tag..."}
                    value={newCustomTag}
                    onChange={(e) => setNewCustomTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newCustomTag.trim()) {
                        if (isSuperAdmin) {
                          addGlobalTagMutation.mutate(newCustomTag.trim());
                        } else {
                          addOwnerTagMutation.mutate(newCustomTag.trim());
                        }
                      }
                    }}
                    className="h-8 text-sm max-w-xs"
                    data-testid="input-new-tag"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8"
                    disabled={!newCustomTag.trim()}
                    onClick={() => {
                      if (isSuperAdmin) {
                        addGlobalTagMutation.mutate(newCustomTag.trim());
                      } else {
                        addOwnerTagMutation.mutate(newCustomTag.trim());
                      }
                    }}
                    data-testid="button-add-tag"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Issue Checkbox */}
          <Card className={hasIssue ? "border-red-500 bg-red-50 dark:bg-red-950/20" : ""}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="hasIssue"
                  checked={hasIssue}
                  onCheckedChange={(checked) => setHasIssue(checked === true)}
                  className={hasIssue ? "border-red-500 data-[state=checked]:bg-red-500" : ""}
                  data-testid="checkbox-issue"
                />
                <div className="flex-1">
                  <Label 
                    htmlFor="hasIssue" 
                    className={`font-medium cursor-pointer flex items-center gap-2 ${hasIssue ? "text-red-600 dark:text-red-400" : ""}`}
                  >
                    <AlertTriangle className={`h-4 w-4 ${hasIssue ? "text-red-500" : "text-muted-foreground"}`} />
                    Report an Issue
                  </Label>
                  <p className={`text-sm mt-1 ${hasIssue ? "text-red-600/80 dark:text-red-400/80" : "text-muted-foreground"}`}>
                    Check this box if there's a problem with this installation that needs attention
                  </p>
                  {hasIssue && (
                    <>
                      <Textarea
                        placeholder="Describe the issue..."
                        value={issueDescription}
                        onChange={(e) => setIssueDescription(e.target.value)}
                        className="mt-2 border-red-300 dark:border-red-700"
                        rows={3}
                        data-testid="input-issue-description"
                      />
                      <p className="text-sm mt-2 text-red-600 dark:text-red-400 font-medium">
                        An email notification will be sent to the installation team
                      </p>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Image validation message */}
          {imageFiles.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-destructive p-3 border border-destructive/30 rounded-md bg-destructive/5" data-testid="validation-no-images">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>Please upload at least one image to continue.</span>
            </div>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={createProjectMutation.isPending || imageFiles.length === 0}
            data-testid="button-submit"
          >
            {createProjectMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving Project...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                {imageFiles.length > 0 
                  ? `Save Project (${imageFiles.length} ${imageFiles.length === 1 ? "photo" : "photos"})` 
                  : "Save Project"}
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
