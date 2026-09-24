import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { 
  Sparkles, 
  Upload, 
  FileText, 
  X, 
  Loader2, 
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  CheckCircle,
  AlertCircle,
  Pencil,
  Save
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePickerSelect } from "@/components/ui/time-picker-select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { EVENT_STATUS_OPTIONS } from "@shared/schema";

interface AICalendarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedEventResponse {
  success: boolean;
  needsManualReview?: boolean;
  project: any;
  calendarEvent: any;
  workOrderData: {
    invoiceNumber: string | null;
    customerName: string | null;
    customerPhone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    signTypes: string[];
    dimensions: string[];
    quantity: number;
    installationNotes: string | null;
  };
  installTime: {
    estimatedHours: number;
    estimatedMinutes: number;
    reasoning: string;
    complexity: string;
    recommendedCrewSize: number;
  };
  message: string;
}

interface EditForm {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  address: string;
  customerName: string;
  customerPhone: string;
}

const BOOKING_TZ = "America/Chicago";

/** Format a UTC ISO string as a date in CST/CDT (YYYY-MM-DD). */
function formatDateForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Format a UTC ISO string as HH:MM in CST/CDT. */
function formatTimeForInput(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TZ, hour12: false, hour: "2-digit", minute: "2-digit",
  }).formatToParts(d);
  const hh = parts.find(p => p.type === "hour")!.value.padStart(2, "0");
  const mm = parts.find(p => p.type === "minute")!.value.padStart(2, "0");
  // Handle the edge case where Intl returns "24" for midnight
  return `${hh === "24" ? "00" : hh}:${mm}`;
}

/**
 * Treat dateStr (YYYY-MM-DD) + timeStr (HH:MM) as a wall-clock time in
 * America/Chicago and return the equivalent UTC ISO string.
 */
function chicagoDateTimeToISO(dateStr: string, timeStr: string): string {
  // Start with the date+time parsed as UTC so we have a stable reference point
  const ref = new Date(`${dateStr}T${timeStr}:00Z`);
  // Find out what Chicago time that UTC instant corresponds to
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BOOKING_TZ, hour12: false, hour: "2-digit", minute: "2-digit",
  });
  const fmtParts = fmt.formatToParts(ref);
  const chicagoHH = parseInt(fmtParts.find(p => p.type === "hour")!.value) % 24;
  const chicagoMM = parseInt(fmtParts.find(p => p.type === "minute")!.value);
  // How many minutes does our desired time differ from what Chicago shows?
  const desiredHH = parseInt(timeStr.split(":")[0]);
  const desiredMM = parseInt(timeStr.split(":")[1]);
  const shiftMs = ((desiredHH * 60 + desiredMM) - (chicagoHH * 60 + chicagoMM)) * 60_000;
  return new Date(ref.getTime() + shiftMs).toISOString();
}

export function AICalendarDialog({ open, onOpenChange }: AICalendarDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ParsedEventResponse | null>(null);
  const [step, setStep] = useState<"input" | "processing" | "result" | "edit">("input");
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    status: "SCHEDULED",
    address: "",
    customerName: "",
    customerPhone: "",
  });

  const createEventMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/calendar-events/from-pdf", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        const err: any = new Error(error.error || "Failed to process PDF");
        err.isDuplicate = res.status === 409;
        err.existingEventId = error.existingEventId;
        throw err;
      }
      return res.json() as Promise<ParsedEventResponse>;
    },
    onSuccess: (data: any) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });

      // Multi-job upload: backend created N separate bookings, one per job number.
      // Skip the single-event edit screen, show a summary toast, and close the dialog.
      if (data?.multiple && Array.isArray(data?.events) && data.events.length > 1) {
        toast({
          title: `${data.count} install events created`,
          description: data.message || "Each PDF was scheduled as its own booking. Set dates from the calendar.",
        });
        setFiles([]);
        setResult(null);
        setStep("input");
        onOpenChange(false);
        return;
      }

      const hasNoDate = !data.calendarEvent?.startTime;
      if (hasNoDate) {
        const ev = data.calendarEvent;
        const wo = data.workOrderData;
        setEditForm({
          title: ev?.title || "",
          description: ev?.description || "",
          date: "",
          startTime: "",
          endTime: "",
          status: ev?.status || "DRAFT",
          address: [wo?.address, wo?.city, wo?.state, wo?.postalCode].filter(Boolean).join(", ") || ev?.address || "",
          customerName: wo?.customerName || "",
          customerPhone: wo?.customerPhone || "",
        });
        setStep("edit");
        toast({
          title: "Work order processed",
          description: "Please set the date, start time, and end time to schedule the install.",
        });
      } else {
        setStep("result");
        toast({
          title: data.needsManualReview ? "Install scheduled (needs review)" : "Install scheduled!",
          description: data.message,
          variant: data.needsManualReview ? "destructive" : "default",
        });
      }
    },
    onError: (error: any) => {
      setStep("input");
      toast({
        title: error?.isDuplicate ? "Duplicate Work Order" : "Error",
        description: error instanceof Error ? error.message : "Failed to process work order",
        variant: "destructive",
      });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async () => {
      if (!result?.calendarEvent?.id) throw new Error("No event to update");

      if (!editForm.date || !editForm.startTime) {
        throw new Error("Please set a date and start time before saving");
      }

      const startDateTime = chicagoDateTimeToISO(editForm.date, editForm.startTime);
      const endDateTime = editForm.endTime
        ? chicagoDateTimeToISO(editForm.date, editForm.endTime)
        : undefined;

      const eventUpdate: any = {
        title: editForm.title,
        description: editForm.description,
        date: startDateTime,
        status: editForm.status === "DRAFT" ? "SCHEDULED" : editForm.status,
        address: editForm.address,
        startTime: startDateTime,
      };
      if (endDateTime) eventUpdate.endTime = endDateTime;

      await apiRequest("PATCH", `/api/calendar-events/${result.calendarEvent.id}`, eventUpdate);

      if (result.project?.id) {
        await apiRequest("PATCH", `/api/projects/${result.project.id}/location`, {
          customerName: editForm.customerName,
          customerPhone: editForm.customerPhone,
          address: editForm.address,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Booking updated",
        description: "Your changes have been saved.",
      });
      setStep("result");
      if (result) {
        const newStartTime = editForm.date && editForm.startTime
          ? chicagoDateTimeToISO(editForm.date, editForm.startTime)
          : result.calendarEvent.startTime;
        const newEndTime = editForm.date && editForm.endTime
          ? chicagoDateTimeToISO(editForm.date, editForm.endTime)
          : result.calendarEvent.endTime;
        const newDate = newStartTime || (editForm.date
          ? chicagoDateTimeToISO(editForm.date, "00:00")
          : result.calendarEvent.date);

        setResult({
          ...result,
          calendarEvent: {
            ...result.calendarEvent,
            title: editForm.title,
            description: editForm.description,
            status: editForm.status,
            address: editForm.address,
            date: newDate,
            startTime: newStartTime,
            endTime: newEndTime,
          },
          workOrderData: {
            ...result.workOrderData,
            customerName: editForm.customerName,
            customerPhone: editForm.customerPhone,
            address: editForm.address,
          },
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update booking",
        variant: "destructive",
      });
    },
  });

  const handleEditClick = () => {
    if (!result) return;
    const ev = result.calendarEvent;
    const wo = result.workOrderData;
    setEditForm({
      title: ev.title || "",
      description: ev.description || "",
      date: formatDateForInput(ev.startTime || ev.date),
      startTime: formatTimeForInput(ev.startTime || ev.date),
      endTime: formatTimeForInput(ev.endTime),
      status: ev.status || "SCHEDULED",
      address: [wo.address, wo.city, wo.state, wo.postalCode].filter(Boolean).join(", ") || ev.address || "",
      customerName: wo.customerName || "",
      customerPhone: wo.customerPhone || "",
    });
    setStep("edit");
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    const pdfFiles = selectedFiles.filter(f => f.type === "application/pdf");
    
    if (pdfFiles.length === 0) {
      toast({
        title: "Invalid file",
        description: "Please select PDF files only",
        variant: "destructive",
      });
      return;
    }
    
    setFiles(prev => [...prev, ...pdfFiles].slice(0, 5));
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (files.length === 0) {
      toast({
        title: "No files",
        description: "Please upload at least one work order PDF",
        variant: "destructive",
      });
      return;
    }

    setStep("processing");
    
    const formData = new FormData();
    files.forEach(file => formData.append("pdfs", file));
    formData.append("prompt", prompt);
    
    createEventMutation.mutate(formData);
  };

  const handleClose = () => {
    setPrompt("");
    setFiles([]);
    setResult(null);
    setStep("input");
    onOpenChange(false);
  };

  const handleNewEvent = () => {
    setPrompt("");
    setFiles([]);
    setResult(null);
    setStep("input");
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI Install Scheduler
          </DialogTitle>
          <DialogDescription>
            {step === "edit"
              ? "Review and edit the booking details"
              : "Upload your work order PDF and I'll extract the details and calculate install time"}
          </DialogDescription>
        </DialogHeader>

        {step === "input" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label>Your Request</Label>
              <Textarea
                placeholder="e.g., Schedule install for invoice #12345 for next Tuesday morning..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={3}
                data-testid="input-ai-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Include preferred date, time, or any special instructions
              </p>
            </div>

            <div className="space-y-3">
              <Label>Work Order PDF(s)</Label>
              <div 
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Click to upload PDFs</p>
                <p className="text-xs text-muted-foreground">
                  Work order, proof files (max 5 files)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-pdf-files"
              />

              {files.length > 0 && (
                <div className="space-y-2">
                  {files.map((file, index) => (
                    <div 
                      key={index} 
                      className="flex items-center justify-between p-2 bg-muted rounded-md"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {(file.size / 1024).toFixed(0)} KB
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(index)}
                        data-testid={`button-remove-pdf-${index}`}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={handleSubmit}
              disabled={files.length === 0}
              className="w-full"
              size="lg"
              data-testid="button-process-pdf"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Process & Schedule Install
            </Button>
          </div>
        )}

        {step === "processing" && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <div>
              <p className="font-medium">Processing your work order...</p>
              <p className="text-sm text-muted-foreground">
                AI is extracting details and calculating install time
              </p>
            </div>
          </div>
        )}

        {step === "result" && result && (
          <div className="space-y-4">
            {result.needsManualReview ? (
              <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <div>
                  <span className="font-medium text-amber-700 dark:text-amber-400">
                    Event Created - Manual Review Needed
                  </span>
                  <p className="text-sm text-amber-600 dark:text-amber-500">
                    Some details couldn't be extracted from the PDF. Please review and update the project information.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-700 dark:text-green-400">
                  Install Successfully Scheduled!
                </span>
              </div>
            )}

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {result.calendarEvent.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {result.calendarEvent.startTime ? (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span>
                        {new Date(result.calendarEvent.startTime).toLocaleDateString()} at{" "}
                        {new Date(result.calendarEvent.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground italic">Date/time not set</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>
                      Duration: {result.installTime.estimatedHours}h {result.installTime.estimatedMinutes}m
                    </span>
                  </div>
                </div>

                {result.workOrderData.customerName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{result.workOrderData.customerName}</span>
                  </div>
                )}

                {result.workOrderData.customerPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{result.workOrderData.customerPhone}</span>
                  </div>
                )}

                {result.workOrderData.address && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {[
                        result.workOrderData.address,
                        result.workOrderData.city,
                        result.workOrderData.state,
                        result.workOrderData.postalCode
                      ].filter(Boolean).join(", ")}
                    </span>
                  </div>
                )}

                {result.workOrderData.signTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-2">
                    {result.workOrderData.signTypes.map((type, i) => (
                      <Badge key={i} variant="secondary">{type}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  AI Install Time Estimate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span>Complexity:</span>
                  <Badge variant={
                    result.installTime.complexity === "simple" ? "secondary" :
                    result.installTime.complexity === "moderate" ? "default" : "destructive"
                  }>
                    {result.installTime.complexity}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span>Recommended Crew:</span>
                  <span>{result.installTime.recommendedCrewSize} person(s)</span>
                </div>
                <p className="text-muted-foreground pt-2 border-t">
                  {result.installTime.reasoning}
                </p>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={handleNewEvent} data-testid="button-schedule-another">
                Schedule Another
              </Button>
              <Button variant="outline" onClick={handleEditClick} data-testid="button-edit-booking">
                <Pencil className="h-4 w-4 mr-2" />
                Edit Booking
              </Button>
              <Button className="flex-1" onClick={handleClose} data-testid="button-done">
                Done
              </Button>
            </div>
          </div>
        )}

        {step === "edit" && result && (
          <div className="space-y-4">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editForm.title}
                  onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                  data-testid="input-edit-title"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-description">Description</Label>
                <Textarea
                  id="edit-description"
                  value={editForm.description}
                  onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  data-testid="input-edit-description"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-date">Date</Label>
                  <Input
                    id="edit-date"
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                    data-testid="input-edit-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <TimePickerSelect
                    value={editForm.startTime}
                    onChange={(startTime) => setEditForm(prev => ({ ...prev, startTime }))}
                    data-testid="input-edit-start-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <TimePickerSelect
                    value={editForm.endTime}
                    onChange={(endTime) => setEditForm(prev => ({ ...prev, endTime }))}
                    data-testid="input-edit-end-time"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select value={editForm.status} onValueChange={(val) => setEditForm(prev => ({ ...prev, status: val }))}>
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_STATUS_OPTIONS.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-address">Address</Label>
                <Input
                  id="edit-address"
                  value={editForm.address}
                  onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                  data-testid="input-edit-address"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-name">Customer Name</Label>
                  <Input
                    id="edit-customer-name"
                    value={editForm.customerName}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customerName: e.target.value }))}
                    data-testid="input-edit-customer-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-customer-phone">Customer Phone</Label>
                  <Input
                    id="edit-customer-phone"
                    value={editForm.customerPhone}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customerPhone: e.target.value }))}
                    data-testid="input-edit-customer-phone"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("result")} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={() => setShowSaveConfirm(true)}
                disabled={updateEventMutation.isPending || !editForm.title.trim()}
                data-testid="button-save-edit"
              >
                {updateEventMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      <ConfirmDialog
        open={showSaveConfirm}
        onOpenChange={setShowSaveConfirm}
        onConfirm={() => {
          updateEventMutation.mutate();
          setShowSaveConfirm(false);
        }}
        title="Are you sure?"
        description="This will update the event details."
        confirmLabel="Yes"
      />
    </Dialog>
  );
}
