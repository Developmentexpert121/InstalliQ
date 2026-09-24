import { useState, useCallback, useRef, useEffect, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { AlertTriangle, ImagePlus, Sparkles, X } from "lucide-react";
import UploadQueue, { type QueueItem } from "./upload-queue";

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_CONCURRENT = 3;

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

interface Props {
  onGoToSearch?: () => void;
  ownerId?: number;
}

export default function TabUploadAssets({ onGoToSearch, ownerId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dropWarning, setDropWarning] = useState<string | null>(null);
  const [nudge, setNudge] = useState<{ uploadedCount: number } | null>(null);
  const uploadingCount = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasUploadingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (nudgeTimerRef.current !== null) clearTimeout(nudgeTimerRef.current);
    };
  }, []);

  const dismissNudge = useCallback(() => {
    if (nudgeTimerRef.current !== null) { clearTimeout(nudgeTimerRef.current); nudgeTimerRef.current = null; }
    setNudge(null);
  }, []);

  const doneCount = queue.filter((i) => i.status === "done").length;
  const pendingOrUploading = queue.filter(
    (i) => i.status === "pending" || i.status === "uploading"
  ).length;

  useEffect(() => {
    if (pendingOrUploading > 0) {
      wasUploadingRef.current = true;
      return;
    }
    if (wasUploadingRef.current && doneCount > 0) {
      wasUploadingRef.current = false;
      setNudge({ uploadedCount: doneCount });
      if (nudgeTimerRef.current !== null) clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = setTimeout(() => {
        setNudge(null);
        nudgeTimerRef.current = null;
      }, 10000);
    }
  }, [pendingOrUploading, doneCount]);

  const updateItem = useCallback(
    (id: string, patch: Partial<QueueItem>) =>
      setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item))),
    []
  );

  const uploadItem = useCallback(
    async (item: QueueItem) => {
      updateItem(item.id, { status: "uploading", progress: 0 });
      uploadingCount.current++;

      const formData = new FormData();
      formData.append("files", item.file);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", ownerId ? `/api/assets/upload?ownerId=${ownerId}` : "/api/assets/upload");
        xhr.withCredentials = true;

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            updateItem(item.id, { progress: pct });
          }
        };

        xhr.onload = () => {
          uploadingCount.current--;
          if (xhr.status >= 200 && xhr.status < 300) {
            updateItem(item.id, { status: "done", progress: 100 });
            queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
            queryClient.invalidateQueries({ queryKey: ["/api/assets/stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/asset-manager/setup"] });
            resolve();
          } else {
            let errorMsg = "Upload failed";
            try { errorMsg = JSON.parse(xhr.responseText)?.error || errorMsg; } catch (_) {}
            updateItem(item.id, { status: "error", error: errorMsg });
            reject(new Error(errorMsg));
          }
        };

        xhr.onerror = () => {
          uploadingCount.current--;
          updateItem(item.id, { status: "error", error: "Network error" });
          reject(new Error("Network error"));
        };

        xhr.send(formData);
      });
    },
    [updateItem, queryClient]
  );

  const processQueue = useCallback(
    async (items: QueueItem[]) => {
      const pending = items.filter((i) => i.status === "pending");
      const toProcess = pending.slice(0, MAX_CONCURRENT - uploadingCount.current);
      await Promise.allSettled(toProcess.map(uploadItem));
      const remaining = items.filter(
        (i) => i.status === "pending" && !toProcess.find((t) => t.id === i.id)
      );
      if (remaining.length > 0) await processQueue(remaining);
    },
    [uploadItem]
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const valid: QueueItem[] = [];
      const skipped: string[] = [];

      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          skipped.push(file.name);
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          toast({
            title: `Skipped "${file.name}"`,
            description: "File exceeds 20MB limit.",
            variant: "destructive",
          });
          continue;
        }
        valid.push({
          id: uid(),
          file,
          status: "pending",
          progress: 0,
          previewUrl: URL.createObjectURL(file),
        });
      }

      if (skipped.length > 0) {
        setDropWarning(
          skipped.length === 1
            ? `"${skipped[0]}" is not an image — only image files are accepted.`
            : `${skipped.length} files skipped — only image files are accepted.`
        );
        setTimeout(() => setDropWarning(null), 6000);
      } else {
        setDropWarning(null);
      }

      if (valid.length === 0) return;
      dismissNudge();
      setQueue((prev) => {
        const next = [...prev, ...valid];
        setTimeout(() => processQueue(next), 0);
        return next;
      });
    },
    [toast, processQueue, dismissNudge]
  );

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) addFiles(e.target.files);
      e.target.value = "";
    },
    [addFiles]
  );

  const openFileBrowser = () => fileInputRef.current?.click();

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);

  const removeItem = (id: string) =>
    setQueue((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });

  const clearDone = () =>
    setQueue((prev) => {
      prev
        .filter((i) => i.status === "done" || i.status === "error")
        .forEach((i) => URL.revokeObjectURL(i.previewUrl));
      return prev.filter((i) => i.status !== "done" && i.status !== "error");
    });

  const errorCount = queue.filter((i) => i.status === "error").length;

  return (
    <div className="space-y-5" data-testid="section-upload-assets">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="input-file-upload"
        onChange={handleFileInputChange}
      />

      <div
        className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer ${
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/30 hover:border-primary/50"
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFileBrowser}
        data-testid="dropzone-upload"
      >
        <ImagePlus className="h-12 w-12 text-muted-foreground" />
        <div className="text-center">
          <p className="font-medium">
            Drag &amp; drop images here, or{" "}
            <span className="text-primary underline underline-offset-2">browse files</span>
          </p>
          <p className="text-sm text-muted-foreground">JPG, PNG, WebP, GIF — up to 20MB each</p>
        </div>
      </div>

      {dropWarning && (
        <div
          className="flex items-start gap-2 rounded-md border border-orange-300 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 text-sm text-orange-700 dark:text-orange-400"
          data-testid="banner-drop-warning"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>{dropWarning}</span>
        </div>
      )}

      {/* Post-upload nudge */}
      {nudge && (
        <div
          className="flex items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-4 py-3"
          data-testid="banner-tag-nudge"
        >
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary flex-shrink-0" />
            <span>
              <span className="font-medium">{nudge.uploadedCount} image{nudge.uploadedCount !== 1 ? "s" : ""} uploaded.</span>
              {" "}Head to Search Assets to tag them with AI.
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onGoToSearch && (
              <Button
                size="sm"
                variant="outline"
                className="border-primary/40 text-primary hover:bg-primary/10"
                onClick={() => { dismissNudge(); onGoToSearch(); }}
                data-testid="button-nudge-go-search"
              >
                <Sparkles className="h-3 w-3 mr-1.5" />
                Tag them now
              </Button>
            )}
            <button
              onClick={dismissNudge}
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-nudge-dismiss"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex gap-2 text-sm text-muted-foreground">
              {pendingOrUploading > 0 && <span>{pendingOrUploading} uploading…</span>}
              {doneCount > 0 && <span className="text-green-600">{doneCount} done</span>}
              {errorCount > 0 && <span className="text-destructive">{errorCount} failed</span>}
            </div>
            {(doneCount > 0 || errorCount > 0) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDone}
                data-testid="button-clear-done"
              >
                Clear completed
              </Button>
            )}
          </div>
          <UploadQueue items={queue} onRemove={removeItem} />
        </div>
      )}
    </div>
  );
}
