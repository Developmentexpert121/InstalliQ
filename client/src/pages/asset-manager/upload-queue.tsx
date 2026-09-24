import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { X, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export interface QueueItem {
  id: string;
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  previewUrl: string;
}

interface UploadQueueProps {
  items: QueueItem[];
  onRemove: (id: string) => void;
}

export default function UploadQueue({ items, onRemove }: UploadQueueProps) {
  if (items.length === 0) return null;

  return (
    <div className="space-y-2" data-testid="upload-queue">
      {items.map((item) => (
        <Card key={item.id} className="p-3 flex items-center gap-3" data-testid={`upload-item-${item.id}`}>
          <img
            src={item.previewUrl}
            alt={item.file.name}
            className="h-12 w-12 object-cover rounded flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <p className="text-sm font-medium truncate" data-testid={`text-upload-filename-${item.id}`}>
                {item.file.name}
              </p>
              <span className="text-xs text-muted-foreground flex-shrink-0" data-testid={`text-upload-size-${item.id}`}>
                {item.file.size < 1024 * 1024
                  ? `${(item.file.size / 1024).toFixed(1)} KB`
                  : `${(item.file.size / (1024 * 1024)).toFixed(1)} MB`}
              </span>
            </div>
            {item.status === "uploading" && (
              <div className="mt-1">
                <Progress value={item.progress} className="h-1.5" data-testid={`progress-upload-${item.id}`} />
                <p className="text-xs text-muted-foreground mt-0.5">{item.progress}%</p>
              </div>
            )}
            {item.status === "done" && (
              <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                <CheckCircle2 className="h-3 w-3" /> Uploaded
              </p>
            )}
            {item.status === "error" && (
              <p className="text-xs text-destructive flex items-center gap-1 mt-0.5">
                <AlertCircle className="h-3 w-3" /> {item.error}
              </p>
            )}
            {item.status === "pending" && (
              <p className="text-xs text-muted-foreground mt-0.5">Waiting…</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {item.status === "uploading" && (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            )}
            {item.status === "done" && (
              <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">Done</Badge>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
              className="text-muted-foreground hover:text-destructive transition-colors"
              data-testid={`button-remove-upload-${item.id}`}
              disabled={item.status === "uploading"}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
