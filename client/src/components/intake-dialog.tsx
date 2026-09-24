import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { 
  Upload, 
  FileText, 
  X, 
  Loader2, 
  Calendar,
  Clock,
  MapPin,
  User,
  Phone,
  Mail,
  Building2,
  CheckCircle,
  AlertCircle,
  Edit,
  Save,
  Send
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TimePickerSelect } from "@/components/ui/time-picker-select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";

interface IntakeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface IntakeResponse {
  success: boolean;
  jobDraft: {
    workOrderNumber: string | null;
    invoiceNumber: string | null;
    jobName: string | null;
    description: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    formattedAddress: string | null;
    latitude: string | null;
    longitude: string | null;
    customerName: string | null;
    pocName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    salesName: string | null;
    salesPhone: string | null;
    salesEmail: string | null;
    notes: string | null;
    status: string;
  };
  eventDraft: {
    startTime: string | null;
    endTime: string | null;
    status: string;
    gptEstimateMinutes: number;
    estimateConfidence: string;
    estimateSummary: string;
  };
  attachmentDrafts: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    category: string;
  }[];
  gptEstimate: {
    estimatedMinutes: number;
    estimatedHours: number;
    remainingMinutes: number;
    confidence: string;
    shortSummary: string;
    recommendedCrewSize: number;
  };
  dateTimeFromPrompt: {
    preferredDate: string | null;
    preferredTime: string | null;
  };
}

type Step = "upload" | "processing" | "review" | "saving";

export function IntakeDialog({ open, onOpenChange }: IntakeDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [step, setStep] = useState<Step>("upload");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [intakeResult, setIntakeResult] = useState<IntakeResponse | null>(null);
  
  // Editable form state
  const [editedJob, setEditedJob] = useState<IntakeResponse["jobDraft"] | null>(null);
  const [editedEvent, setEditedEvent] = useState<{
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    status: string;
  } | null>(null);

  const intakeMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const res = await fetch("/api/intake/create-from-prompt", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to process files");
      }
      return res.json() as Promise<IntakeResponse>;
    },
    onSuccess: (data) => {
      setIntakeResult(data);
      setEditedJob(data.jobDraft);
      
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const defaultDate = tomorrow.toISOString().split('T')[0];
      const defaultStartTime = "09:00";
      const defaultEndTime = "10:00";

      let parsedStartDate = defaultDate;
      let parsedStartTime = defaultStartTime;
      let parsedEndDate = defaultDate;
      let parsedEndTime = defaultEndTime;

      if (data.eventDraft.startTime) {
        const start = new Date(data.eventDraft.startTime);
        if (!isNaN(start.getTime())) {
          parsedStartDate = start.toISOString().split('T')[0];
          parsedStartTime = start.toTimeString().slice(0, 5);
        }
      }
      if (data.eventDraft.endTime) {
        const end = new Date(data.eventDraft.endTime);
        if (!isNaN(end.getTime())) {
          parsedEndDate = end.toISOString().split('T')[0];
          parsedEndTime = end.toTimeString().slice(0, 5);
        }
      }

      setEditedEvent({
        startDate: parsedStartDate,
        startTime: parsedStartTime,
        endDate: parsedEndDate,
        endTime: parsedEndTime,
        status: data.eventDraft.status,
      });
      
      setStep("review");
    },
    onError: (error) => {
      setStep("upload");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process files",
        variant: "destructive",
      });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      if (!editedJob || !editedEvent) throw new Error("No data to save");
      
      // Create job
      const job = await apiRequest("POST", "/api/jobs", {
        ...editedJob,
        status: "DRAFT",
      });
      const jobData = await job.json();
      
      // Create install event (dates optional for drafts)
      const hasStartDate = editedEvent.startDate && editedEvent.startTime;
      const hasEndDate = editedEvent.endDate && editedEvent.endTime;
      const startDateTime = hasStartDate ? new Date(`${editedEvent.startDate}T${editedEvent.startTime}:00`) : null;
      const endDateTime = hasEndDate ? new Date(`${editedEvent.endDate}T${editedEvent.endTime}:00`) : null;
      
      await apiRequest("POST", "/api/install-events", {
        jobId: jobData.id,
        startTime: startDateTime ? startDateTime.toISOString() : undefined,
        endTime: endDateTime ? endDateTime.toISOString() : undefined,
        status: "DRAFT",
        gptEstimateMinutes: intakeResult?.gptEstimate.estimatedMinutes,
        estimateConfidence: intakeResult?.gptEstimate.confidence,
        estimateSummary: intakeResult?.gptEstimate.shortSummary,
      });
      
      // Create attachments
      if (intakeResult?.attachmentDrafts) {
        for (const attachment of intakeResult.attachmentDrafts) {
          await apiRequest("POST", `/api/jobs/${jobData.id}/attachments`, attachment);
        }
      }
      
      return jobData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      toast({
        title: "Draft Saved",
        description: "Job saved as draft. You can schedule it later.",
      });
      handleClose();
    },
    onError: (error) => {
      setStep("review");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save draft",
        variant: "destructive",
      });
    },
  });

  const scheduleAndSendMutation = useMutation({
    mutationFn: async () => {
      if (!editedJob || !editedEvent) throw new Error("No data to save");
      
      // Validate required fields
      if (!editedJob.workOrderNumber && !editedJob.invoiceNumber) {
        throw new Error("Work Order # or Invoice # is required to schedule");
      }
      if (!editedJob.address) {
        throw new Error("Address is required to schedule");
      }
      if (!editedEvent.startDate || !editedEvent.startTime) {
        throw new Error("Start date and time are required to schedule");
      }
      if (!editedEvent.endDate || !editedEvent.endTime) {
        throw new Error("End date and time are required to schedule");
      }
      
      // Create job as SCHEDULED
      const job = await apiRequest("POST", "/api/jobs", {
        ...editedJob,
        status: "SCHEDULED",
      });
      const jobData = await job.json();
      
      // Create install event
      const startDateTime = new Date(`${editedEvent.startDate}T${editedEvent.startTime}:00`);
      const endDateTime = new Date(`${editedEvent.endDate}T${editedEvent.endTime}:00`);
      
      // Create calendar event with WO# in title
      const eventTitle = editedJob.workOrderNumber 
        ? `WO ${editedJob.workOrderNumber} – ${editedJob.address}`
        : `INSTALL – ${editedJob.address}`;
        
      const calendarEvent = await apiRequest("POST", "/api/calendar-events", {
        title: eventTitle,
        description: [
          `Customer: ${editedJob.customerName || "N/A"}`,
          `Contact: ${editedJob.pocName || "N/A"}`,
          `Phone: ${editedJob.customerPhone || "N/A"}`,
          `Email: ${editedJob.customerEmail || "N/A"}`,
          "",
          `WO#: ${editedJob.workOrderNumber || "N/A"}`,
          `Invoice: ${editedJob.invoiceNumber || "N/A"}`,
          "",
          `Estimated: ${intakeResult?.gptEstimate.estimatedHours}h ${intakeResult?.gptEstimate.remainingMinutes}m`,
          `Crew: ${intakeResult?.gptEstimate.recommendedCrewSize} person(s)`,
        ].join("\n"),
        date: startDateTime.toISOString(),
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        status: "SCHEDULED",
        workJobNumber: editedJob.workOrderNumber || editedJob.invoiceNumber || undefined,
      });
      const calendarData = await calendarEvent.json();
      
      // Create install event linked to calendar
      await apiRequest("POST", "/api/install-events", {
        jobId: jobData.id,
        calendarEventId: calendarData.id,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        status: "SCHEDULED",
        gptEstimateMinutes: intakeResult?.gptEstimate.estimatedMinutes,
        estimateConfidence: intakeResult?.gptEstimate.confidence,
        estimateSummary: intakeResult?.gptEstimate.shortSummary,
      });
      
      // Create attachments
      if (intakeResult?.attachmentDrafts) {
        for (const attachment of intakeResult.attachmentDrafts) {
          await apiRequest("POST", `/api/jobs/${jobData.id}/attachments`, attachment);
        }
      }
      
      // Send confirmation email to customer if email is provided
      let emailSent = false;
      if (editedJob.customerEmail) {
        const startDateTime = new Date(`${editedEvent.startDate}T${editedEvent.startTime}:00`);
        try {
          await apiRequest("POST", "/api/notifications/send-schedule-confirmation", {
            jobId: jobData.id,
            calendarEventId: calendarData.id,
            customerEmail: editedJob.customerEmail,
            customerName: editedJob.customerName,
            scheduledDate: startDateTime.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            }),
            scheduledTime: startDateTime.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit'
            }),
            address: editedJob.formattedAddress || editedJob.address,
          });
          emailSent = true;
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
        }
      }
      
      return { jobData, calendarData, emailSent };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({
        title: "Install Scheduled!",
        description: data.emailSent 
          ? `Event added and confirmation email sent to customer`
          : `Event added to calendar for ${editedEvent?.startDate}`,
      });
      handleClose();
    },
    onError: (error) => {
      setStep("review");
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to schedule",
        variant: "destructive",
      });
    },
  });

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
    
    setFiles(prev => [...prev, ...pdfFiles].slice(0, 10));
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
    files.forEach(file => formData.append("files", file));
    formData.append("promptText", prompt);
    
    intakeMutation.mutate(formData);
  };

  const handleSaveDraft = () => {
    setStep("saving");
    saveDraftMutation.mutate();
  };

  const handleSchedule = () => {
    setStep("saving");
    scheduleAndSendMutation.mutate();
  };

  const handleClose = () => {
    setPrompt("");
    setFiles([]);
    setIntakeResult(null);
    setEditedJob(null);
    setEditedEvent(null);
    setStep("upload");
    onOpenChange(false);
  };

  const updateJob = (field: keyof IntakeResponse["jobDraft"], value: string | null) => {
    if (editedJob) {
      setEditedJob({ ...editedJob, [field]: value });
    }
  };

  const updateEvent = (field: keyof NonNullable<typeof editedEvent>, value: string) => {
    if (editedEvent) {
      setEditedEvent({ ...editedEvent, [field]: value });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Create from Prompt + Upload
          </DialogTitle>
          <DialogDescription>
            Upload work order and proof PDFs, then review and schedule the install
          </DialogDescription>
        </DialogHeader>

        {step === "upload" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label>Scheduling Request</Label>
              <Textarea
                placeholder="e.g., I need this job installed on Feb 2nd at 10 am"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                data-testid="input-intake-prompt"
              />
              <p className="text-xs text-muted-foreground">
                Include preferred date and time for the installation
              </p>
            </div>

            <div className="space-y-3">
              <Label>Work Order PDF (required) + Proof PDFs (optional)</Label>
              <div 
                className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm font-medium">Click to upload PDFs</p>
                <p className="text-xs text-muted-foreground">
                  First file should be Work Order, rest are Proofs
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                data-testid="input-intake-files"
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
                        <span className="text-sm truncate max-w-[250px]">{file.name}</span>
                        <Badge variant={index === 0 ? "default" : "outline"} className="text-xs">
                          {index === 0 ? "Work Order" : "Proof"}
                        </Badge>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => removeFile(index)}
                        data-testid={`button-remove-file-${index}`}
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
              data-testid="button-process-intake"
            >
              <Upload className="h-4 w-4 mr-2" />
              Process Files
            </Button>
          </div>
        )}

        {step === "processing" && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <div>
              <p className="font-medium">Processing your documents...</p>
              <p className="text-sm text-muted-foreground">
                Extracting details, calculating install time, and geocoding address
              </p>
            </div>
          </div>
        )}

        {step === "saving" && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 mx-auto animate-spin text-primary" />
            <div>
              <p className="font-medium">Saving...</p>
            </div>
          </div>
        )}

        {step === "review" && editedJob && editedEvent && intakeResult && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
              <Edit className="h-5 w-5 text-blue-600" />
              <span className="font-medium text-blue-700 dark:text-blue-400">
                Review & Edit - Make any corrections before saving
              </span>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Job Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="workOrderNumber">Work Order #</Label>
                    <Input
                      id="workOrderNumber"
                      value={editedJob.workOrderNumber || ""}
                      onChange={(e) => updateJob("workOrderNumber", e.target.value || null)}
                      placeholder="e.g., 401-50752"
                      data-testid="input-wo-number"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceNumber">Invoice/Estimate #</Label>
                    <Input
                      id="invoiceNumber"
                      value={editedJob.invoiceNumber || ""}
                      onChange={(e) => updateJob("invoiceNumber", e.target.value || null)}
                      placeholder="e.g., EST-50752"
                      data-testid="input-invoice-number"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="jobName">Job Name / Description</Label>
                  <Input
                    id="jobName"
                    value={editedJob.jobName || ""}
                    onChange={(e) => updateJob("jobName", e.target.value || null)}
                    placeholder="e.g., 268 Summer Street Lobby"
                    data-testid="input-job-name"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Install Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="address">Street Address</Label>
                  <Input
                    id="address"
                    value={editedJob.address || ""}
                    onChange={(e) => updateJob("address", e.target.value || null)}
                    placeholder="e.g., 268 Summer Street"
                    data-testid="input-address"
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={editedJob.city || ""}
                      onChange={(e) => updateJob("city", e.target.value || null)}
                      placeholder="Boston"
                      data-testid="input-city"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={editedJob.state || ""}
                      onChange={(e) => updateJob("state", e.target.value || null)}
                      placeholder="MA"
                      data-testid="input-state"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="postalCode">Zip Code</Label>
                    <Input
                      id="postalCode"
                      value={editedJob.postalCode || ""}
                      onChange={(e) => updateJob("postalCode", e.target.value || null)}
                      placeholder="02210"
                      data-testid="input-zip"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Customer Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerName">Company Name</Label>
                    <Input
                      id="customerName"
                      value={editedJob.customerName || ""}
                      onChange={(e) => updateJob("customerName", e.target.value || null)}
                      data-testid="input-customer-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="pocName">Contact Name</Label>
                    <Input
                      id="pocName"
                      value={editedJob.pocName || ""}
                      onChange={(e) => updateJob("pocName", e.target.value || null)}
                      data-testid="input-poc-name"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerPhone">Phone</Label>
                    <Input
                      id="customerPhone"
                      value={editedJob.customerPhone || ""}
                      onChange={(e) => updateJob("customerPhone", e.target.value || null)}
                      data-testid="input-customer-phone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="customerEmail">Email</Label>
                    <Input
                      id="customerEmail"
                      value={editedJob.customerEmail || ""}
                      onChange={(e) => updateJob("customerEmail", e.target.value || null)}
                      data-testid="input-customer-email"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Salesperson
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="salesName">Name</Label>
                    <Input
                      id="salesName"
                      value={editedJob.salesName || ""}
                      onChange={(e) => updateJob("salesName", e.target.value || null)}
                      data-testid="input-sales-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="salesEmail">Email</Label>
                    <Input
                      id="salesEmail"
                      value={editedJob.salesEmail || ""}
                      onChange={(e) => updateJob("salesEmail", e.target.value || null)}
                      data-testid="input-sales-email"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Schedule
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={editedEvent.startDate}
                      onChange={(e) => updateEvent("startDate", e.target.value)}
                      data-testid="input-start-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <TimePickerSelect
                      value={editedEvent.startTime}
                      onChange={(v) => updateEvent("startTime", v)}
                      data-testid="input-start-time"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="endDate">End Date</Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={editedEvent.endDate}
                      onChange={(e) => updateEvent("endDate", e.target.value)}
                      data-testid="input-end-date"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <TimePickerSelect
                      value={editedEvent.endTime}
                      onChange={(v) => updateEvent("endTime", v)}
                      data-testid="input-end-time"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  AI Install Time Estimate
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Duration:</span>
                    <Badge variant="secondary">
                      {intakeResult.gptEstimate.estimatedHours}h {intakeResult.gptEstimate.remainingMinutes}m
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Complexity:</span>
                    <Badge variant={
                      intakeResult.gptEstimate.confidence === "simple" ? "secondary" :
                      intakeResult.gptEstimate.confidence === "moderate" ? "default" : "destructive"
                    }>
                      {intakeResult.gptEstimate.confidence}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Crew:</span>
                    <span>{intakeResult.gptEstimate.recommendedCrewSize} person(s)</span>
                  </div>
                </div>
                <p className="text-muted-foreground pt-2 border-t">
                  {intakeResult.gptEstimate.shortSummary}
                </p>
              </CardContent>
            </Card>

            {intakeResult.attachmentDrafts.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Attachments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {intakeResult.attachmentDrafts.map((att, i) => (
                      <Badge key={i} variant="outline" className="py-1">
                        <FileText className="h-3 w-3 mr-1" />
                        {att.fileName}
                        <span className="ml-1 text-xs opacity-70">({att.category})</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex gap-3 pt-2">
              <Button 
                variant="outline" 
                className="flex-1" 
                onClick={handleSaveDraft}
                disabled={saveDraftMutation.isPending || scheduleAndSendMutation.isPending}
                data-testid="button-save-draft"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button 
                className="flex-1" 
                onClick={handleSchedule}
                disabled={saveDraftMutation.isPending || scheduleAndSendMutation.isPending}
                data-testid="button-schedule"
              >
                <Send className="h-4 w-4 mr-2" />
                Schedule
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
