import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths, isToday } from "date-fns";
import { 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Calendar as CalendarIcon,
  Clock,
  X,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { JobCardDrawer } from "@/components/job-card-drawer";
import { AICalendarDialog } from "@/components/ai-calendar-dialog";
import type { CalendarEvent } from "@shared/schema";

export default function CalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isAddEventOpen, setIsAddEventOpen] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState("");
  const [newEventDescription, setNewEventDescription] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAIDialogOpen, setIsAIDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: events, isLoading } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events"],
  });

  const addEventMutation = useMutation({
    mutationFn: async (data: { title: string; description: string; date: string }) => {
      return apiRequest("POST", "/api/calendar-events", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      setIsAddEventOpen(false);
      setNewEventTitle("");
      setNewEventDescription("");
      setSelectedDate(null);
      toast({
        title: "Event added",
        description: "Your calendar event has been created.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add event.",
        variant: "destructive",
      });
    },
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get padding days for the start of the month
  const startPadding = monthStart.getDay();
  const paddingDays = Array.from({ length: startPadding }, (_, i) => {
    const date = new Date(monthStart);
    date.setDate(date.getDate() - (startPadding - i));
    return date;
  });

  const allDays = [...paddingDays, ...daysInMonth];

  const getEventsForDay = (date: Date) => {
    return events?.filter((event) => isSameDay(new Date(event.date), date)) || [];
  };

  const handleAddEvent = () => {
    if (!selectedDate || !newEventTitle.trim()) return;
    addEventMutation.mutate({
      title: newEventTitle,
      description: newEventDescription,
      date: selectedDate.toISOString(),
    });
  };

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              data-testid="button-prev-month"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-bold">
              {format(currentDate, "MMMM yyyy")}
            </h1>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              data-testid="button-next-month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setCurrentDate(new Date())}
              data-testid="button-today"
            >
              Today
            </Button>
            <Button
              onClick={() => setIsAIDialogOpen(true)}
              data-testid="button-ai-scheduler"
            >
              <Plus className="h-4 w-4 mr-2" />
              AI Schedule
            </Button>
          </div>
        </div>

        {/* Calendar Grid */}
        <Card>
          <CardContent className="p-0">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div
                  key={day}
                  className="p-3 text-center text-sm font-medium text-muted-foreground border-r last:border-r-0"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days */}
            <div className="grid grid-cols-7">
              {allDays.map((date, index) => {
                const dayEvents = getEventsForDay(date);
                const isCurrentMonth = isSameMonth(date, currentDate);
                const isSelected = selectedDate && isSameDay(date, selectedDate);

                return (
                  <div
                    key={index}
                    className={`min-h-[100px] p-2 border-r border-b last:border-r-0 cursor-pointer transition-colors ${
                      !isCurrentMonth ? "bg-muted/30" : "hover:bg-muted/50"
                    } ${isSelected ? "bg-primary/10 ring-2 ring-primary ring-inset" : ""}`}
                    onClick={() => setSelectedDate(date)}
                    data-testid={`calendar-day-${format(date, "yyyy-MM-dd")}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span
                        className={`text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                          isToday(date)
                            ? "bg-primary text-primary-foreground"
                            : !isCurrentMonth
                            ? "text-muted-foreground"
                            : ""
                        }`}
                      >
                        {format(date, "d")}
                      </span>
                      {isCurrentMonth && (
                        <Dialog open={isAddEventOpen && !!isSelected} onOpenChange={setIsAddEventOpen}>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedDate(date);
                                setIsAddEventOpen(true);
                              }}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="w-[95vw] sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Add Event</DialogTitle>
                              <DialogDescription>
                                Add an event for {selectedDate ? format(selectedDate, "MMMM d, yyyy") : ""}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="eventTitle">Event Title</Label>
                                <Input
                                  id="eventTitle"
                                  placeholder="Enter event title"
                                  value={newEventTitle}
                                  onChange={(e) => setNewEventTitle(e.target.value)}
                                  data-testid="input-event-title"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="eventDescription">Description (optional)</Label>
                                <Textarea
                                  id="eventDescription"
                                  placeholder="Add a description"
                                  value={newEventDescription}
                                  onChange={(e) => setNewEventDescription(e.target.value)}
                                  data-testid="input-event-description"
                                />
                              </div>
                            </div>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsAddEventOpen(false)}>
                                Cancel
                              </Button>
                              <Button
                                onClick={handleAddEvent}
                                disabled={!newEventTitle.trim() || addEventMutation.isPending}
                                data-testid="button-save-event"
                              >
                                {addEventMutation.isPending && (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                Add Event
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      )}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, 2).map((event) => (
                        <button
                          key={event.id}
                          className="w-full text-left text-xs p-1 rounded bg-primary/10 text-primary truncate hover:bg-primary/20 transition-colors"
                          title={event.title}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                            setIsDrawerOpen(true);
                          }}
                          data-testid={`event-${event.id}`}
                        >
                          {event.title}
                        </button>
                      ))}
                      {dayEvents.length > 2 && (
                        <div className="text-xs text-muted-foreground pl-1">
                          +{dayEvents.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Selected Date Events */}
        {selectedDate && (
          <Card className="mt-6">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-lg">
                {format(selectedDate, "EEEE, MMMM d, yyyy")}
              </CardTitle>
              <Button onClick={() => setIsAddEventOpen(true)} data-testid="button-add-event">
                <Plus className="h-4 w-4 mr-2" />
                Add Event
              </Button>
            </CardHeader>
            <CardContent>
              {getEventsForDay(selectedDate).length > 0 ? (
                <div className="space-y-3">
                  {getEventsForDay(selectedDate).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
                    >
                      <CalendarIcon className="h-5 w-5 text-primary mt-0.5" />
                      <div className="flex-1">
                        <h4 className="font-medium">{event.title}</h4>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No events scheduled for this day
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Job Card Drawer */}
      <JobCardDrawer
        event={selectedEvent}
        open={isDrawerOpen}
        onOpenChange={(open) => {
          setIsDrawerOpen(open);
          if (!open) setSelectedEvent(null);
        }}
      />

      {/* AI Calendar Dialog */}
      <AICalendarDialog
        open={isAIDialogOpen}
        onOpenChange={setIsAIDialogOpen}
      />
    </div>
  );
}
