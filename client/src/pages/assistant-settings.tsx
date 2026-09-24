import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Upload, Trash2, FileText, Loader2, Save, Plus, AlertCircle, Settings, BookOpen, Sparkles, Info, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { usePageHeader } from "@/lib/page-header";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useLocation } from "wouter";

interface AssistantFile {
  id: number | string;
  userId: number;
  openaiFileId: string;
  fileName: string;
  fileSize: number;
  uploadedAt?: string;
  createdAt?: string;
  source?: string;
}

interface AssistantSettings {
  hasAssistant: boolean;
  assistantId?: string;
  name?: string;
  instructions?: string | null;
  model?: string;
  files: AssistantFile[];
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function AssistantSettingsPage({ adminId }: { adminId?: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { setHeaderInfo } = usePageHeader();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [instructions, setInstructions] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<number | string | null>(null);
  const [fileToDelete, setFileToDelete] = useState<{ id: number | string; name: string } | null>(null);
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isSuperAdminManaging = !!adminId && user?.role === "super_admin";
  const apiPrefix = adminId ? `/api/assistant/admin/${adminId}` : `/api/assistant`;
  const settingsQueryKey = adminId ? ["/api/assistant/settings", adminId] : ["/api/assistant/settings"];

  useEffect(() => {
    setHeaderInfo({
      title: isSuperAdminManaging ? "AI Assistant Settings" : "AI Assistant Settings",
      description: isSuperAdminManaging ? "Manage this admin's AI scheduling assistant" : "Configure your personalized AI scheduling assistant",
    });
  }, [setHeaderInfo, isSuperAdminManaging]);

  const { data: settings, isLoading } = useQuery<AssistantSettings>({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      const res = await fetch(`${apiPrefix}/settings`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  useEffect(() => {
    if (settings?.instructions) {
      setInstructions(settings.instructions);
    }
  }, [settings?.instructions]);

  const handleCreateAssistant = async () => {
    setIsCreating(true);
    try {
      await apiRequest("POST", `${apiPrefix}/create`);
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast({ title: "Assistant Created", description: "Your personalized AI assistant has been created successfully." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create assistant", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleSaveInstructions = async () => {
    setIsSaving(true);
    try {
      await apiRequest("PUT", `${apiPrefix}/instructions`, { instructions });
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast({ title: "Saved", description: "Assistant instructions updated successfully." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save instructions", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${apiPrefix}/files`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Upload failed");
      }
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast({ title: "File Uploaded", description: `${file.name} has been attached to your assistant.`, variant: "success" });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message || "Failed to upload file", variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteFile = async (fileId: number | string) => {
    setDeletingFileId(fileId);
    try {
      if (typeof fileId === "string" && fileId.startsWith("vs_")) {
        const openaiFileId = fileId.replace("vs_", "");
        await apiRequest("DELETE", `${apiPrefix}/files/vector-store/${openaiFileId}`);
      } else {
        await apiRequest("DELETE", `${apiPrefix}/files/${fileId}`);
      }
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      toast({ title: "File Removed", description: "File has been removed from your assistant." });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete file", variant: "destructive" });
    } finally {
      setDeletingFileId(null);
    }
  };

  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] p-6" data-testid="assistant-access-denied">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">Owner access required to manage AI assistant settings.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" data-testid="assistant-loading">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading assistant settings...</p>
        </div>
      </div>
    );
  }

  if (!settings?.hasAssistant) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 pb-12" data-testid="assistant-setup">
        <div className="space-y-6">
          {isSuperAdminManaging && (
            <Button
              variant="ghost"
              onClick={() => setLocation("/admin")}
              data-testid="button-back-to-admin"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to User Management
            </Button>
          )}
          <div className="text-center space-y-2 mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight" data-testid="text-setup-title">Set Up Your AI Assistant</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Create a personalized AI assistant that understands your business details, equipment, and pricing to provide accurate scheduling estimates.
            </p>
          </div>

          <Card>
            <CardContent className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3 rounded-md bg-muted/50 p-4">
                  <Settings className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Business Configuration</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Your business info from onboarding</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-muted/50 p-4">
                  <Sparkles className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Smart Scheduling</p>
                    <p className="text-xs text-muted-foreground mt-0.5">AI-powered install time estimates</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-muted/50 p-4">
                  <BookOpen className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Knowledge Base</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Upload pricing & product docs</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-md bg-muted/50 p-4">
                  <Info className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Customizable</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Edit instructions & behavior</p>
                  </div>
                </div>
              </div>

              <Separator />

              <Button
                onClick={handleCreateAssistant}
                disabled={isCreating}
                className="w-full"
                size="lg"
                data-testid="button-create-assistant"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Your Assistant...
                  </>
                ) : (
                  <>
                    <Plus className="mr-2 h-4 w-4" />
                    Create My AI Assistant
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const hasChanges = instructions !== (settings.instructions || "");

  return (
    <div className="p-4 sm:p-6 lg:p-8 pb-12" data-testid="assistant-settings">
      <div className="space-y-6">
        {isSuperAdminManaging && (
          <Button
            variant="ghost"
            onClick={() => setLocation("/admin")}
            data-testid="button-back-to-admin"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to User Management
          </Button>
        )}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 flex-shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg" data-testid="text-assistant-name">
                    {settings.name || "Your AI Assistant"}
                  </CardTitle>
                  <CardDescription className="mt-0.5">
                    Personalized scheduling assistant for your business
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" data-testid="badge-assistant-model">{settings.model || "gpt-4o"}</Badge>
                <Badge variant="outline" className="text-green-600 border-green-200 dark:text-green-400 dark:border-green-800">Active</Badge>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Instructions</CardTitle>
                </div>
                <CardDescription>
                  Customize how your AI assistant analyzes work orders and provides scheduling estimates. Changes apply to all future requests.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={20}
                  className="font-mono text-sm leading-relaxed resize-y min-h-[200px]"
                  placeholder="Enter instructions for your AI assistant..."
                  data-testid="textarea-instructions"
                />
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-xs text-muted-foreground">
                    {instructions.length.toLocaleString()} characters
                  </p>
                  <Button
                    onClick={() => setShowSaveConfirm(true)}
                    disabled={isSaving || !hasChanges}
                    data-testid="button-save-instructions"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Save Instructions
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-base">Knowledge Files</CardTitle>
                  </div>
                  {settings.files.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{settings.files.length} file{settings.files.length !== 1 ? "s" : ""}</Badge>
                  )}
                </div>
                <CardDescription>
                  Upload documents to give your assistant additional context about your business.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileUpload}
                    accept=".pdf,.txt,.csv,.json,.md,.docx"
                    data-testid="input-file-upload"
                  />
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    data-testid="button-upload-file"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="mr-2 h-4 w-4" />
                        Upload File
                      </>
                    )}
                  </Button>
                  <p className="text-[10px] text-muted-foreground mt-2 text-center">
                    PDF, TXT, CSV, JSON, MD, DOCX
                  </p>
                </div>

                <Separator />

                {settings.files.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground" data-testid="text-no-files">
                    <FileText className="mx-auto mb-3 h-8 w-8 opacity-40" />
                    <p className="text-sm font-medium">No files uploaded yet</p>
                    <p className="text-xs mt-1">Upload pricing sheets, catalogs, or install guides</p>
                  </div>
                ) : (
                  <div className="space-y-2" data-testid="file-list">
                    {settings.files.map((file) => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between gap-2 rounded-md border p-3"
                        data-testid={`file-item-${file.id}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{file.fileName}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(file.fileSize)}
                              {(file.uploadedAt || file.createdAt) && ` · ${new Date((file.uploadedAt || file.createdAt)!).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFileToDelete({ id: file.id, name: file.fileName })}
                          disabled={deletingFileId === file.id}
                          data-testid={`button-delete-file-${file.id}`}
                        >
                          {deletingFileId === file.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-base">Quick Tips</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5 flex-shrink-0">1</span>
                    <span>Edit instructions to fine-tune how your assistant estimates install times</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5 flex-shrink-0">2</span>
                    <span>Upload your pricing sheets for more accurate cost estimates</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-primary font-bold mt-0.5 flex-shrink-0">3</span>
                    <span>Add product catalogs to help identify sign types from work orders</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!fileToDelete}
        onOpenChange={(open) => !open && setFileToDelete(null)}
        onConfirm={() => {
          if (fileToDelete) {
            handleDeleteFile(fileToDelete.id);
            setFileToDelete(null);
          }
        }}
        title="Delete File?"
        description={`Are you sure you want to remove "${fileToDelete?.name}" from your assistant? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
      />

      <ConfirmDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        onConfirm={() => {
          setShowSaveConfirm(false);
          handleSaveInstructions();
        }}
        title="Save Instructions?"
        description="This will update your AI assistant's instructions. All future scheduling requests will use the new instructions."
        confirmLabel="Save"
      />
    </div>
  );
}
