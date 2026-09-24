import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Mail,
  Save,
  RotateCcw,
  Eye,
  ChevronDown,
  ChevronRight,
  Building2,
  Phone,
  Globe,
  AtSign,
  MapPin,
  Loader2,
  Check,
  Info,
} from "lucide-react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

interface EmailTemplate {
  emailType: string;
  label: string;
  description: string;
  subject: string;
  bodyHtml: string;
  enabled: boolean;
  isCustomized: boolean;
  defaultSubject: string;
  defaultBodyHtml: string;
}

interface EmailSignature {
  adminId: number;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  website: string;
}

const quillModules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ["bold", "italic", "underline", "strike"],
    [{ list: "ordered" }, { list: "bullet" }],
    [{ color: [] }, { background: [] }],
    ["link"],
    ["clean"],
  ],
};

const quillFormats = [
  "header",
  "bold", "italic", "underline", "strike",
  "list",
  "color", "background",
  "link",
];

function TemplateEditor({
  template,
  onSave,
  onReset,
  onPreview,
  isSaving,
}: {
  template: EmailTemplate;
  onSave: (type: string, subject: string, bodyHtml: string, enabled: boolean) => void;
  onReset: (type: string) => void;
  onPreview: (type: string) => void;
  isSaving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subject, setSubject] = useState(template.subject);
  const [bodyHtml, setBodyHtml] = useState(template.bodyHtml);
  const [enabled, setEnabled] = useState(template.enabled);
  const [dirty, setDirty] = useState(false);

  const handleSubjectChange = (val: string) => {
    setSubject(val);
    setDirty(true);
  };

  const handleBodyChange = (val: string) => {
    setBodyHtml(val);
    setDirty(true);
  };

  const handleEnabledChange = (val: boolean) => {
    setEnabled(val);
    setDirty(true);
  };

  const handleSave = () => {
    onSave(template.emailType, subject, bodyHtml, enabled);
    setDirty(false);
  };

  const handleReset = () => {
    setSubject(template.defaultSubject);
    setBodyHtml(template.defaultBodyHtml);
    setEnabled(true);
    setDirty(true);
    onReset(template.emailType);
  };

  const variables = template.description.match(/\{\{(\w+)\}\}/g) || [];

  return (
    <Card className="overflow-hidden" data-testid={`card-template-${template.emailType}`}>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-toggle-${template.emailType}`}
      >
        <div className="flex items-center gap-3">
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{template.label}</span>
              {template.isCustomized && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Customized</Badge>}
              {dirty && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-orange-300 text-orange-600">Unsaved</Badge>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <Switch
            checked={enabled}
            onCheckedChange={handleEnabledChange}
            data-testid={`switch-enabled-${template.emailType}`}
          />
        </div>
      </div>

      {expanded && (
        <CardContent className="pt-0 pb-4 px-4 space-y-4 border-t">
          <p className="text-xs text-muted-foreground mt-3">{template.description.split(". Variables:")[0]}</p>

          {variables.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground flex items-center gap-1"><Info className="h-3 w-3" /> Variables:</span>
              {variables.map((v) => (
                <Badge key={v} variant="outline" className="text-[10px] font-mono px-1.5 py-0">{v}</Badge>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Subject Line</Label>
            <Input
              value={subject}
              onChange={(e) => handleSubjectChange(e.target.value)}
              placeholder="Email subject..."
              data-testid={`input-subject-${template.emailType}`}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Message Body</Label>
            <div className="border rounded-md overflow-hidden [&_.ql-toolbar]:border-0 [&_.ql-toolbar]:border-b [&_.ql-toolbar]:bg-muted/30 [&_.ql-container]:border-0 [&_.ql-editor]:min-h-[180px] [&_.ql-editor]:text-sm">
              <ReactQuill
                value={bodyHtml}
                onChange={handleBodyChange}
                modules={quillModules}
                formats={quillFormats}
                theme="snow"
                data-testid={`editor-body-${template.emailType}`}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !dirty}
              data-testid={`button-save-${template.emailType}`}
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onPreview(template.emailType)}
              data-testid={`button-preview-${template.emailType}`}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" />
              Preview
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleReset}
              data-testid={`button-reset-${template.emailType}`}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Reset to Default
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function EmailTemplatesPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewSubject, setPreviewSubject] = useState<string>("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: templates = [], isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates"],
  });

  const { data: signature, isLoading: signatureLoading } = useQuery<EmailSignature>({
    queryKey: ["/api/email-signature"],
  });

  const [sigForm, setSigForm] = useState<EmailSignature | null>(null);
  const [sigDirty, setSigDirty] = useState(false);

  if (signature && !sigForm) {
    setSigForm(signature);
  }

  const saveMutation = useMutation({
    mutationFn: async ({ type, subject, bodyHtml, enabled }: { type: string; subject: string; bodyHtml: string; enabled: boolean }) => {
      await apiRequest("PUT", `/api/email-templates/${type}`, { subject, bodyHtml, enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      toast({ title: "Template saved", description: "Your email template has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save template.", variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (type: string) => {
      await apiRequest("POST", `/api/email-templates/reset/${type}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      toast({ title: "Template reset", description: "Email template has been reset to default." });
    },
  });

  const previewMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await apiRequest("POST", `/api/email-templates/${type}/preview`);
      return res.json();
    },
    onSuccess: (data: { html: string; subject: string }) => {
      setPreviewHtml(data.html);
      setPreviewSubject(data.subject);
      setPreviewOpen(true);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate preview.", variant: "destructive" });
    },
  });

  const saveSigMutation = useMutation({
    mutationFn: async (data: Partial<EmailSignature>) => {
      await apiRequest("PUT", "/api/email-signature", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-signature"] });
      setSigDirty(false);
      toast({ title: "Signature saved", description: "Your business signature has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save signature.", variant: "destructive" });
    },
  });

  const handleSigChange = (field: keyof EmailSignature, value: string) => {
    if (sigForm) {
      setSigForm({ ...sigForm, [field]: value });
      setSigDirty(true);
    }
  };

  if (!user || (user.role !== "admin" && user.role !== "super_admin")) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <AppSidebar />
        <main className="flex-1 overflow-auto">
          <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/95 backdrop-blur px-4 py-3">
            <SidebarTrigger />
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-orange-600" />
              <h1 className="text-lg font-semibold" data-testid="text-page-title">Email Templates</h1>
            </div>
          </header>

          <div className="p-4 md:p-6 space-y-6">
            <Tabs defaultValue="templates">
              <TabsList className="w-full grid grid-cols-2" data-testid="tabs-email-config">
                <TabsTrigger value="templates" data-testid="tab-templates">
                  <Mail className="h-4 w-4 mr-1.5" />
                  Message Templates
                </TabsTrigger>
                <TabsTrigger value="signature" data-testid="tab-signature">
                  <Building2 className="h-4 w-4 mr-1.5" />
                  Business Signature
                </TabsTrigger>
              </TabsList>

              <TabsContent value="templates" className="mt-4 space-y-3">
                <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <Info className="h-4 w-4 mt-0.5 text-blue-600 shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-300">
                    Customize the message content for each email type. Use the variable placeholders (like {"{{customerName}}"}) in your message — they will be replaced with real values when the email is sent. Toggle emails on/off with the switch.
                  </p>
                </div>

                {templatesLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  templates.map((template) => (
                    <TemplateEditor
                      key={template.emailType}
                      template={template}
                      onSave={(type, subject, bodyHtml, enabled) =>
                        saveMutation.mutate({ type, subject, bodyHtml, enabled })
                      }
                      onReset={(type) => resetMutation.mutate(type)}
                      onPreview={(type) => previewMutation.mutate(type)}
                      isSaving={saveMutation.isPending}
                    />
                  ))
                )}
              </TabsContent>

              <TabsContent value="signature" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-orange-600" />
                      Business Signature
                    </CardTitle>
                    <CardDescription className="text-xs">
                      This information appears at the bottom of all your outgoing emails. It helps your customers identify your business.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {signatureLoading || !sigForm ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5" />
                              Company Name
                            </Label>
                            <Input
                              value={sigForm.companyName || ""}
                              onChange={(e) => handleSigChange("companyName", e.target.value)}
                              placeholder="Your Business Name"
                              data-testid="input-sig-company"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5" />
                              Phone
                            </Label>
                            <Input
                              value={sigForm.phone || ""}
                              onChange={(e) => handleSigChange("phone", e.target.value)}
                              placeholder="(555) 123-4567"
                              data-testid="input-sig-phone"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1.5">
                              <AtSign className="h-3.5 w-3.5" />
                              Email
                            </Label>
                            <Input
                              value={sigForm.email || ""}
                              onChange={(e) => handleSigChange("email", e.target.value)}
                              placeholder="contact@yourbusiness.com"
                              data-testid="input-sig-email"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1.5">
                              <Globe className="h-3.5 w-3.5" />
                              Website
                            </Label>
                            <Input
                              value={sigForm.website || ""}
                              onChange={(e) => handleSigChange("website", e.target.value)}
                              placeholder="https://yourbusiness.com"
                              data-testid="input-sig-website"
                            />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            Address
                          </Label>
                          <Input
                            value={sigForm.address || ""}
                            onChange={(e) => handleSigChange("address", e.target.value)}
                            placeholder="123 Main Street, Suite 100, City, ST 12345"
                            data-testid="input-sig-address"
                          />
                        </div>

                        {(sigForm.companyName || sigForm.address || sigForm.phone || sigForm.email) && (
                          <>
                            <Separator />
                            <div>
                              <Label className="text-xs text-muted-foreground mb-2 block">Preview</Label>
                              <div className="bg-muted/30 rounded-lg p-4 border">
                                {sigForm.companyName && <p className="font-semibold text-sm">{sigForm.companyName}</p>}
                                {sigForm.address && <p className="text-xs text-muted-foreground">{sigForm.address}</p>}
                                {sigForm.phone && <p className="text-xs text-muted-foreground">{sigForm.phone}</p>}
                                {sigForm.email && <p className="text-xs text-orange-600">{sigForm.email}</p>}
                                {sigForm.website && <p className="text-xs text-orange-600">{sigForm.website}</p>}
                              </div>
                            </div>
                          </>
                        )}

                        <Button
                          onClick={() => saveSigMutation.mutate(sigForm)}
                          disabled={saveSigMutation.isPending || !sigDirty}
                          data-testid="button-save-signature"
                        >
                          {saveSigMutation.isPending ? (
                            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                          ) : sigDirty ? (
                            <Save className="h-4 w-4 mr-1.5" />
                          ) : (
                            <Check className="h-4 w-4 mr-1.5" />
                          )}
                          {sigDirty ? "Save Signature" : "Saved"}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Email Preview: {previewSubject}
            </DialogTitle>
          </DialogHeader>
          <div className="border rounded-lg overflow-hidden bg-gray-100">
            <iframe
              srcDoc={previewHtml}
              sandbox=""
              className="w-full h-[500px] bg-white"
              title="Email Preview"
              data-testid="iframe-email-preview"
            />
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
