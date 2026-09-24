import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { splitContactPhone } from "@/lib/utils";
import { format } from "date-fns";
import { X, MapPin, Clock, User, Phone, Tag, AlertTriangle, Check, Image as ImageIcon, Pencil, Save, Loader2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimePickerSelect } from "@/components/ui/time-picker-select";
import { Separator } from "@/components/ui/separator";
import { WeatherPanel } from "./weather-panel";
import { MapPanel } from "./map-panel";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getImageUrl } from "@/lib/image-url";
import { useToast } from "@/hooks/use-toast";
import type { Project, CalendarEvent, EventStatus } from "@shared/schema";
import { EVENT_STATUS_OPTIONS } from "@shared/schema";

interface JobCardDrawerProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusColors: Record<string, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  CONFIRMED: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  NEEDS_RESCHEDULE: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  COMPLETED: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  ISSUE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

interface EditForm {
  title: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  status: string;
  address: string;
}

function formatDateForInput(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toISOString().split("T")[0];
}

function formatTimeForInput(dateStr: string | Date | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toTimeString().slice(0, 5);
}

export function JobCardDrawer({ event, open, onOpenChange }: JobCardDrawerProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(event?.status || "SCHEDULED");
  const [isEditing, setIsEditing] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string>("");
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({
    title: "",
    description: "",
    date: "",
    startTime: "",
    endTime: "",
    status: "SCHEDULED",
    address: "",
  });
  const { toast } = useToast();

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", event?.projectId],
    enabled: !!event?.projectId,
  });

  useEffect(() => {
    if (event) {
      setSelectedStatus(event.status || "SCHEDULED");
      setIsEditing(false);
    }
  }, [event?.id]);

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/calendar-events/${event?.id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: async () => {
      if (!event?.id) throw new Error("No event");

      const startDateTime = editForm.date && editForm.startTime
        ? new Date(`${editForm.date}T${editForm.startTime}:00`).toISOString()
        : undefined;
      const endDateTime = editForm.date && editForm.endTime
        ? new Date(`${editForm.date}T${editForm.endTime}:00`).toISOString()
        : undefined;

      const eventUpdate: any = {
        title: editForm.title,
        description: editForm.description,
        date: startDateTime || new Date(`${editForm.date}T00:00:00`).toISOString(),
        status: editForm.status,
        address: editForm.address,
      };
      if (startDateTime) eventUpdate.startTime = startDateTime;
      if (endDateTime) eventUpdate.endTime = endDateTime;

      await apiRequest("PATCH", `/api/calendar-events/${event.id}`, eventUpdate);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({
        title: "Booking updated",
        description: "Your changes have been saved.",
      });
      setIsEditing(false);
      onOpenChange(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update booking",
        variant: "destructive",
      });
    },
  });

  const handleStatusChange = (status: string) => {
    setPendingStatus(status);
    setShowStatusConfirm(true);
  };

  const handleEditClick = () => {
    if (!event) return;
    setEditForm({
      title: event.title || "",
      description: event.description || "",
      date: formatDateForInput(event.startTime || event.date),
      startTime: formatTimeForInput(event.startTime || event.date),
      endTime: formatTimeForInput(event.endTime),
      status: event.status || "SCHEDULED",
      address: event.address || project?.address || "",
    });
    setIsEditing(true);
  };

  if (!event) return null;

  const installTime = event.startTime ? new Date(event.startTime) : new Date(event.date);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto" data-testid="job-card-drawer">
        <SheetHeader className="space-y-4">
          <div className="flex items-start justify-between gap-4">
            <SheetTitle className="text-xl">{event.title}</SheetTitle>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!isEditing && (
                <Button variant="outline" size="icon" onClick={handleEditClick} data-testid="button-edit-event">
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              <Badge className={statusColors[selectedStatus] || statusColors.SCHEDULED}>
                {selectedStatus.replace(/_/g, " ")}
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {isEditing ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Pencil className="h-4 w-4" />
                  Edit Booking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="drawer-edit-title">Title</Label>
                  <Input
                    id="drawer-edit-title"
                    value={editForm.title}
                    onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                    data-testid="input-drawer-edit-title"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drawer-edit-description">Description</Label>
                  <Textarea
                    id="drawer-edit-description"
                    value={editForm.description}
                    onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    data-testid="input-drawer-edit-description"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drawer-edit-date">Date</Label>
                  <Input
                    id="drawer-edit-date"
                    type="date"
                    value={editForm.date}
                    onChange={(e) => setEditForm(prev => ({ ...prev, date: e.target.value }))}
                    data-testid="input-drawer-edit-date"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Start Time</Label>
                    <TimePickerSelect
                      value={editForm.startTime}
                      onChange={(startTime) => setEditForm(prev => ({ ...prev, startTime }))}
                      data-testid="input-drawer-edit-start-time"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>End Time</Label>
                    <TimePickerSelect
                      value={editForm.endTime}
                      onChange={(endTime) => setEditForm(prev => ({ ...prev, endTime }))}
                      data-testid="input-drawer-edit-end-time"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="drawer-edit-status">Status</Label>
                  <Select value={editForm.status} onValueChange={(val) => setEditForm(prev => ({ ...prev, status: val }))}>
                    <SelectTrigger data-testid="select-drawer-edit-status">
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
                  <Label htmlFor="drawer-edit-address">Address</Label>
                  <Input
                    id="drawer-edit-address"
                    value={editForm.address}
                    onChange={(e) => setEditForm(prev => ({ ...prev, address: e.target.value }))}
                    data-testid="input-drawer-edit-address"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <Button variant="outline" className="flex-1" onClick={() => setIsEditing(false)} data-testid="button-cancel-drawer-edit">
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => setShowSaveConfirm(true)}
                    disabled={updateEventMutation.isPending || !editForm.title.trim()}
                    data-testid="button-save-drawer-edit"
                  >
                    {updateEventMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Schedule
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Date</span>
                    <span className="text-sm font-medium">
                      {format(new Date(event.date), "EEEE, MMMM d, yyyy")}
                    </span>
                  </div>
                  {event.startTime && event.endTime && (
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Time</span>
                      <span className="text-sm font-medium">
                        {format(new Date(event.startTime), "h:mm a")} - {format(new Date(event.endTime), "h:mm a")}
                      </span>
                    </div>
                  )}
                  <div className="pt-2">
                    <label className="text-sm text-muted-foreground mb-1 block">Status</label>
                    <Select value={selectedStatus} onValueChange={handleStatusChange}>
                      <SelectTrigger data-testid="select-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {EVENT_STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            <div className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full ${statusColors[status]?.split(" ")[0] || "bg-gray-400"}`} />
                              {status.replace(/_/g, " ")}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {event.description && (
                <Card>
                  <CardContent className="pt-4">
                    <p className="text-sm">{event.description}</p>
                  </CardContent>
                </Card>
              )}

              {project && (
                <>
                  <Separator />
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Tag className="h-4 w-4" />
                        Job Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {project.jobLabel && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground">Job #</span>
                          <span className="text-sm font-medium">{project.jobLabel}</span>
                        </div>
                      )}
                      
                      {project.customerName && (
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" /> Customer
                          </span>
                          <span className="text-sm font-medium">{project.customerName}</span>
                        </div>
                      )}
                      
                      {project.customerPhone && (() => {
                        const { display, tel } = splitContactPhone(project.customerPhone);
                        return (
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" /> Phone
                            </span>
                            <a href={`tel:${tel}`} className="text-sm font-medium text-primary">
                              {display}
                            </a>
                          </div>
                        );
                      })()}
                      
                      {project.description && (
                        <div>
                          <span className="text-sm text-muted-foreground block mb-1">Notes</span>
                          <p className="text-sm">{project.description}</p>
                        </div>
                      )}
                      
                      {project.tags && project.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {project.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      {project.hasIssue && (
                        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-md">
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <span className="text-sm text-red-700 dark:text-red-400">Issue reported</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {project.imageUrls && project.imageUrls.length > 0 && (
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Photos ({project.imageUrls.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {project.imageUrls.slice(0, 6).map((url, index) => (
                            <div key={index} className="aspect-square rounded-md overflow-hidden bg-muted">
                              <img 
                                src={getImageUrl(url)} 
                                alt={`Project photo ${index + 1}`}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ))}
                        </div>
                        {project.imageUrls.length > 6 && (
                          <p className="text-xs text-muted-foreground mt-2">
                            +{project.imageUrls.length - 6} more photos
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              <Separator />

              {project && (project.latitude && project.longitude) ? (
                <WeatherPanel 
                  lat={project.latitude} 
                  lng={project.longitude} 
                  targetTime={installTime}
                />
              ) : project ? (
                <WeatherPanel projectId={project.id} targetTime={installTime} />
              ) : null}

              {project && (
                <MapPanel
                  address={project.address}
                  city={project.city}
                  state={project.state}
                  postalCode={project.postalCode}
                  lat={project.latitude}
                  lng={project.longitude}
                />
              )}
            </>
          )}
        </div>
      </SheetContent>

      <ConfirmDialog
        open={showStatusConfirm}
        onOpenChange={setShowStatusConfirm}
        onConfirm={() => {
          setSelectedStatus(pendingStatus);
          updateStatusMutation.mutate(pendingStatus);
          setShowStatusConfirm(false);
        }}
        title="Are you sure?"
        description="This will update the booking status."
        confirmLabel="Yes"
      />

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
    </Sheet>
  );
}
