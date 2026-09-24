import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { usePageHeader } from "@/lib/page-header";
import { useEffect } from "react";
import { Clock, Upload, FileText, X, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface UploadedFile {
  file: File;
  id: string;
}

export default function TimeEstimatorPage() {
  const { user } = useAuth();
  const { setHeaderInfo } = usePageHeader();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    setHeaderInfo({
      title: "Install Time Estimator",
      description: "Upload work orders and proofs to estimate installation time",
      icon: <Clock className="h-5 w-5 text-primary" />,
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles) return;

    const newFiles: UploadedFile[] = [];
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      const validTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
      ];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a supported file type. Please upload PDF or image files.`,
          variant: "destructive",
        });
        continue;
      }
      if (file.size > 20 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: `${file.name} exceeds the 20MB limit.`,
          variant: "destructive",
        });
        continue;
      }
      newFiles.push({ file, id: crypto.randomUUID() });
    }

    setFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleEstimate = async () => {
    if (files.length === 0) {
      toast({
        title: "No files uploaded",
        description: "Please upload at least one work order or proof file.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setResult(null);

    try {
      const formData = new FormData();
      files.forEach((f) => {
        formData.append("files", f.file);
      });
      formData.append("additionalNotes", additionalNotes);

      const res = await fetch("/api/time-estimator", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Failed to get estimate" }));
        throw new Error(err.message || "Failed to get estimate");
      }

      const data = await res.json();
      setResult(data.estimate);
    } catch (error: any) {
      toast({
        title: "Estimation Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClear = () => {
    setFiles([]);
    setAdditionalNotes("");
    setResult(null);
  };

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-6 w-full">
      <Card data-testid="card-file-upload">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Upload Files
          </CardTitle>
          <CardDescription>
            Upload work order PDFs and installation proof images. The AI assistant will analyze them to estimate installation time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone-file-upload"
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Click to upload files</p>
            <p className="text-xs text-muted-foreground mt-1">
              PDF work orders, JPG/PNG proof images (max 20MB each)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              onChange={handleFileSelect}
              className="hidden"
              data-testid="input-file-upload"
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-2" data-testid="list-uploaded-files">
              <Label className="text-sm font-medium">
                Uploaded Files ({files.length})
              </Label>
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border"
                  data-testid={`file-item-${f.id}`}
                >
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(f.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {f.file.type.includes("pdf") ? "PDF" : "Image"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 flex-shrink-0"
                    onClick={() => removeFile(f.id)}
                    data-testid={`button-remove-file-${f.id}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="additional-notes">Additional Notes (optional)</Label>
            <Textarea
              id="additional-notes"
              placeholder="Add any additional context about the installation, such as site conditions, access requirements, or special instructions..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={3}
              data-testid="input-additional-notes"
            />
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleEstimate}
              disabled={isProcessing || files.length === 0}
              className="flex-1"
              data-testid="button-estimate"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4 mr-2" />
                  Estimate Install Time
                </>
              )}
            </Button>
            {(files.length > 0 || result) && (
              <Button
                variant="outline"
                onClick={handleClear}
                disabled={isProcessing}
                data-testid="button-clear"
              >
                Clear All
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card data-testid="card-estimate-result">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Installation Time Estimate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap rounded-lg bg-muted/50 p-4 border"
              data-testid="text-estimate-result"
            >
              {result}
            </div>
          </CardContent>
        </Card>
      )}

      {!result && !isProcessing && (
        <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
          <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How it works</p>
            <ul className="mt-2 space-y-1 list-disc list-inside">
              <li>Upload work order PDFs and/or installation proof images</li>
              <li>Add any relevant notes about the installation site</li>
              <li>Your InstalliQ Assistant will analyze the files and provide a time estimate</li>
              <li>The estimate includes hours, complexity, crew size, and reasoning</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
