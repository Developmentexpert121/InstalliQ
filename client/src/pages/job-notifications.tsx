import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { splitContactPhone } from "@/lib/utils";
import {
  Bell,
  MapPin,
  Clock,
  Navigation,
  Camera,
  CheckCircle2,
  Loader2,
  Calendar,
  Phone,
  Mail,
  ExternalLink,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { usePageHeader } from "@/lib/page-header";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MapLinkPicker } from "@/components/map-link-picker";
import type { CalendarEvent, InstallerNotification } from "@shared/schema";

type NotificationWithEvent = InstallerNotification & { calendarEvent: CalendarEvent };

function parseEventDescription(description: string | null) {
  if (!description) return {};
  const lines = description.split("\n");
  const data: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^(\w[\w\s]*?):\s*(.+)/);
    if (match) {
      data[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }
  return data;
}

function formatTime(dateStr: string | Date | null) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDate(dateStr: string | Date | null) {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getTimeRemaining(expiresAt: string | Date) {
  const now = new Date();
  const expires = new Date(expiresAt);
  const diff = expires.getTime() - now.getTime();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
}

function getMapEmbedUrl(address: string) {
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(address)}&layer=mapnik&marker=true`;
}

export default function JobNotificationsPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { setHeaderInfo } = usePageHeader();
  const [selectedNotification, setSelectedNotification] = useState<NotificationWithEvent | null>(null);

  useEffect(() => {
    setHeaderInfo({
      title: "My Jobs",
      description: "Your assigned installation jobs",
      icon: <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />,
    });
    return () => setHeaderInfo(null);
  }, [setHeaderInfo]);

  const { data: notifications = [], isLoading } = useQuery<NotificationWithEvent[]>({
    queryKey: ["/api/installer-notifications"],
    refetchInterval: 30000,
  });

  const onMyWayMutation = useMutation({
    mutationFn: async ({ id, calendarEventId }: { id: number; calendarEventId: number }) => {
      await apiRequest("PATCH", `/api/installer-notifications/${id}`, {
        status: "on_my_way",
        onMyWayAt: new Date().toISOString(),
      });
      // Also start the job timer so the Install Calendar reflects the status change
      try {
        await fetch(`/api/job-timers/${calendarEventId}/start`, {
          method: "POST",
          credentials: "include",
        });
      } catch {
        // Timer may already be running; non-fatal
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/installer-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/job-timers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/job-timers", variables.calendarEventId] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "On My Way!", description: "Customer notified. Drive safe!" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("PATCH", `/api/installer-notifications/${id}`, {
        readAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/installer-notifications"] });
    },
  });

  const handleCardClick = (notification: NotificationWithEvent) => {
    if (!notification.readAt) {
      markReadMutation.mutate(notification.id);
    }
    setSelectedNotification({ ...notification, readAt: notification.readAt || new Date() });
  };

  const handleOnMyWay = (notification: NotificationWithEvent) => {
    onMyWayMutation.mutate({ id: notification.id, calendarEventId: notification.calendarEvent.id });
    setSelectedNotification({ ...notification, status: "on_my_way", onMyWayAt: new Date() });
  };

  const handleCompletedPhotos = (notification: NotificationWithEvent) => {
    const event = notification.calendarEvent;
    const parsed = parseEventDescription(event.description);
    const params = new URLSearchParams();
    if (event.description) params.set("description", event.description);
    if (event.workJobNumber) params.set("jobLabel", event.workJobNumber);
    if (parsed.customer) params.set("customerName", parsed.customer);
    if (parsed.phone) params.set("customerPhone", parsed.phone);
    if (event.address) params.set("address", event.address);
    if (parsed.address) {
      const addressParts = parsed.address.split(",");
      if (addressParts.length >= 1) params.set("address", addressParts[0].trim());
      if (addressParts.length >= 2) params.set("city", addressParts[1].trim());
      if (addressParts.length >= 3) params.set("state", addressParts[2].trim());
      if (addressParts.length >= 4) params.set("postalCode", addressParts[3].trim());
    }
    setSelectedNotification(null);
    navigate(`/projects/new?${params.toString()}`);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200" data-testid="badge-status-pending">New Job</Badge>;
      case "on_my_way":
        return <Badge className="bg-green-500/10 text-green-600 border-green-200" data-testid="badge-status-onmyway">On My Way</Badge>;
      default:
        return <Badge variant="secondary" data-testid="badge-status-default">{status}</Badge>;
    }
  };

  const unreadCount = notifications.filter(n => n.status === "pending" && !n.readAt).length;
  const pendingCount = notifications.filter(n => n.status === "pending").length;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-4">
      {notifications.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <Bell className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-1" data-testid="text-empty-title">No Job Notifications</h3>
            <p className="text-muted-foreground text-sm max-w-md" data-testid="text-empty-description">
              When your admin assigns you to an installation job, you'll see the notification here. Notifications stay for 24 hours.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {unreadCount > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800" data-testid="banner-new-jobs">
              <Bell className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                You have {unreadCount} new job{unreadCount > 1 ? "s" : ""} assigned
              </span>
            </div>
          )}

          {notifications.map((notification) => {
            const event = notification.calendarEvent;
            const parsed = parseEventDescription(event.description);
            const fullAddress = parsed.address || event.address || "";

            return (
              <Card
                key={notification.id}
                className={`cursor-pointer transition-all hover:shadow-md ${
                  notification.status === "pending" && !notification.readAt ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20" : ""
                }`}
                onClick={() => handleCardClick(notification)}
                data-testid={`card-notification-${notification.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        {getStatusBadge(notification.status)}
                        <span className="text-xs text-muted-foreground" data-testid={`text-time-remaining-${notification.id}`}>
                          {getTimeRemaining(notification.expiresAt)}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm truncate" data-testid={`text-event-title-${notification.id}`}>
                        {event.title}
                      </h3>
                      {fullAddress && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 flex-shrink-0" />
                          <span className="truncate" data-testid={`text-address-${notification.id}`}>{fullAddress}</span>
                        </div>
                      )}
                      {(event.startTime || event.date) && (
                        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          <span data-testid={`text-time-${notification.id}`}>
                            {formatDate(event.startTime || event.date)}
                            {event.startTime && ` at ${formatTime(event.startTime)}`}
                            {event.endTime && ` - ${formatTime(event.endTime)}`}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 items-end flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {fullAddress && (
                        <MapLinkPicker
                          address={fullAddress}
                          align="end"
                          testIdPrefix={`map-${notification.id}`}
                        >
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 px-3 gap-1"
                            data-testid={`link-map-${notification.id}`}
                          >
                            <MapPin className="h-3 w-3" />
                            Map
                          </Button>
                        </MapLinkPicker>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7 px-3 gap-1"
                        onClick={() => handleCompletedPhotos(notification)}
                        data-testid={`button-completed-photos-${notification.id}`}
                      >
                        <Camera className="h-3 w-3" />
                        Complete Photos
                      </Button>
                      {notification.status === "pending" && (
                        <Button
                          size="sm"
                          className="text-xs h-7 px-3 gap-1 bg-green-600 hover:bg-green-700 text-white"
                          onClick={() => handleOnMyWay(notification)}
                          disabled={onMyWayMutation.isPending}
                          data-testid={`button-on-my-way-${notification.id}`}
                        >
                          {onMyWayMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Navigation className="h-3 w-3" />
                          )}
                          On My Way
                        </Button>
                      )}
                      {notification.status === "on_my_way" && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle2 className="h-3 w-3" />
                          <span>On My Way</span>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selectedNotification} onOpenChange={(open) => !open && setSelectedNotification(null)}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="dialog-job-detail">
          {selectedNotification && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  {getStatusBadge(selectedNotification.status)}
                  <span className="text-xs text-muted-foreground">
                    {getTimeRemaining(selectedNotification.expiresAt)}
                  </span>
                </div>
                <DialogTitle className="text-lg" data-testid="text-dialog-title">
                  {selectedNotification.calendarEvent.title}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Schedule */}
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Calendar className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium" data-testid="text-detail-date">
                      {formatDate(selectedNotification.calendarEvent.startTime || selectedNotification.calendarEvent.date)}
                    </p>
                    {selectedNotification.calendarEvent.startTime && (
                      <p className="text-xs text-muted-foreground" data-testid="text-detail-time">
                        {formatTime(selectedNotification.calendarEvent.startTime)}
                        {selectedNotification.calendarEvent.endTime && ` - ${formatTime(selectedNotification.calendarEvent.endTime)}`}
                      </p>
                    )}
                  </div>
                </div>

                {/* Address & Map */}
                {(() => {
                  const event = selectedNotification.calendarEvent;
                  const parsed = parseEventDescription(event.description);
                  const fullAddress = parsed.address || event.address || "";
                  if (!fullAddress) return null;
                  return (
                    <div className="space-y-2">
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                        <MapPin className="h-4 w-4 mt-0.5 text-primary flex-shrink-0" />
                        <div className="flex-1">
                          <MapLinkPicker address={fullAddress} testIdPrefix="detail-address">
                            <button
                              type="button"
                              className="text-sm font-medium text-left hover:underline cursor-pointer"
                              data-testid="text-detail-address"
                            >
                              {fullAddress}
                            </button>
                          </MapLinkPicker>
                          <MapLinkPicker address={fullAddress} testIdPrefix="view-map">
                            <button
                              type="button"
                              className="text-xs text-primary hover:underline inline-flex items-center gap-1 mt-1"
                              data-testid="link-view-map"
                            >
                              Open in Maps <ExternalLink className="h-3 w-3" />
                            </button>
                          </MapLinkPicker>
                        </div>
                      </div>
                      <div className="rounded-lg overflow-hidden border h-[200px]">
                        <iframe
                          title="Job Location"
                          width="100%"
                          height="200"
                          style={{ border: 0 }}
                          loading="lazy"
                          referrerPolicy="no-referrer-when-downgrade"
                          src={`https://maps.google.com/maps?q=${encodeURIComponent(fullAddress)}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
                          data-testid="map-embed"
                        />
                      </div>
                    </div>
                  );
                })()}

                {/* Contact Info */}
                {(() => {
                  const parsed = parseEventDescription(selectedNotification.calendarEvent.description);
                  const customer = parsed.customer;
                  const phone = parsed.phone;
                  if (!customer && !phone) return null;
                  return (
                    <div className="space-y-2">
                      {customer && (
                        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                          <Mail className="h-4 w-4 text-primary flex-shrink-0" />
                          <span className="text-sm" data-testid="text-detail-customer">{customer}</span>
                        </div>
                      )}
                      {phone && (() => {
                        const { display, tel } = splitContactPhone(phone);
                        return (
                          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                            <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                            <a href={`tel:${tel}`} className="text-sm text-primary hover:underline" data-testid="text-detail-phone">{display}</a>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}

                {/* Job Description */}
                {selectedNotification.calendarEvent.description && (
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Job Details</p>
                    <p className="text-sm whitespace-pre-wrap leading-relaxed" data-testid="text-detail-description">
                      {selectedNotification.calendarEvent.description}
                    </p>
                  </div>
                )}

                {/* On My Way status */}
                {selectedNotification.status === "on_my_way" && selectedNotification.onMyWayAt && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800" data-testid="banner-on-my-way">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-700 dark:text-green-300">
                      Marked as On My Way at {formatTime(selectedNotification.onMyWayAt)}
                    </span>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col gap-2 pt-2">
                  {selectedNotification.status === "pending" && (
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      size="lg"
                      onClick={() => handleOnMyWay(selectedNotification)}
                      disabled={onMyWayMutation.isPending}
                      data-testid="button-on-my-way"
                    >
                      {onMyWayMutation.isPending ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Navigation className="h-4 w-4 mr-2" />
                      )}
                      On My Way
                    </Button>
                  )}

                  {selectedNotification.status === "on_my_way" && (() => {
                    const parsed = parseEventDescription(selectedNotification.calendarEvent.description);
                    const fullAddress = parsed.address || selectedNotification.calendarEvent.address || "";
                    if (!fullAddress) return null;
                    return (
                      <MapLinkPicker
                        address={fullAddress}
                        mode="directions"
                        align="center"
                        testIdPrefix="directions"
                      >
                        <Button
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                          size="lg"
                          data-testid="button-get-directions"
                        >
                          <Navigation className="h-4 w-4 mr-2" />
                          Get Directions
                        </Button>
                      </MapLinkPicker>
                    );
                  })()}

                  <Button
                    variant="outline"
                    className="w-full"
                    size="lg"
                    onClick={() => handleCompletedPhotos(selectedNotification)}
                    data-testid="button-completed-photos"
                  >
                    <Camera className="h-4 w-4 mr-2" />
                    Completed Photos
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
