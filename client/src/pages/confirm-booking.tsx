import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, AlertCircle, Loader2, Calendar, Clock, MapPin, CalendarPlus } from "lucide-react";

interface ConfirmationResult {
  success: boolean;
  alreadyConfirmed: boolean;
  event: {
    title: string;
    date: string;
    startTime: string;
    endTime: string;
    workJobNumber: string;
    address?: string;
  };
  message: string;
}

export default function ConfirmBookingPage() {
  const params = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");
  const [result, setResult] = useState<ConfirmationResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const confirmBooking = async () => {
      try {
        const response = await fetch(`/api/confirm-booking/${params.token}`);
        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setErrorMessage(data.error || "Failed to confirm booking");
          return;
        }

        setResult(data);
        setStatus(data.alreadyConfirmed ? "already" : "success");
      } catch {
        setStatus("error");
        setErrorMessage("Unable to connect. Please try again later.");
      }
    };

    if (params.token) {
      confirmBooking();
    }
  }, [params.token]);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  const buildGoogleCalendarUrl = (event: ConfirmationResult["event"]) => {
    const toGCalFormat = (dateStr: string) => {
      const d = new Date(dateStr);
      return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    };
    const startStr = event.startTime ? toGCalFormat(event.startTime) : toGCalFormat(event.date);
    const endStr = event.endTime ? toGCalFormat(event.endTime) : startStr;
    const details: string[] = [];
    if (event.workJobNumber) details.push(`Job #${event.workJobNumber}`);
    details.push("FASTSIGNS of Waltham Installation");
    details.push("Contact: waltham.install@fastsigns.com | (781) 894-4000");

    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: event.title,
      dates: `${startStr}/${endStr}`,
      details: details.join("\n"),
    });
    if (event.address) params.set("location", event.address);
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white dark:from-stone-950 dark:to-stone-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 mb-4">
            <span className="text-white font-bold text-lg">iQ</span>
          </div>
          <h2 className="text-sm font-semibold text-orange-600 dark:text-orange-400 tracking-wide uppercase" data-testid="text-brand">
            FASTSIGNS of Waltham
          </h2>
        </div>

        <Card>
          <CardContent className="pt-6 pb-8 px-6">
            {status === "loading" && (
              <div className="text-center py-8" data-testid="loading-confirmation">
                <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground">Confirming your booking...</p>
                <p className="text-sm text-muted-foreground mt-1">Please wait a moment.</p>
              </div>
            )}

            {status === "success" && result && (
              <div className="text-center" data-testid="confirmation-success">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                  <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-confirmation-title">
                  Booking Confirmed
                </h1>
                <p className="text-muted-foreground mb-6" data-testid="text-confirmation-message">
                  {result.message}
                </p>

                <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3 mb-6">
                  <h3 className="font-semibold text-sm text-foreground" data-testid="text-event-title">
                    {result.event.title}
                  </h3>
                  {result.event.workJobNumber && (
                    <p className="text-xs text-muted-foreground" data-testid="text-work-job-number">
                      Job #{result.event.workJobNumber}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span data-testid="text-event-date">{formatDate(result.event.date)}</span>
                  </div>
                  {result.event.startTime && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 flex-shrink-0" />
                      <span data-testid="text-event-time">
                        {formatTime(result.event.startTime)}
                        {result.event.endTime && ` - ${formatTime(result.event.endTime)}`}
                      </span>
                    </div>
                  )}
                  {result.event.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span data-testid="text-event-address">{result.event.address}</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full mb-6 border-green-600 text-green-600 dark:border-green-400 dark:text-green-400"
                  data-testid="button-save-to-calendar"
                  onClick={() => {
                    window.open(buildGoogleCalendarUrl(result.event), "_blank");
                  }}
                >
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Save to Calendar
                </Button>

                <p className="text-sm text-muted-foreground">
                  Our team will arrive at the scheduled time. If you need to make changes, please contact us at{" "}
                  <a href="mailto:waltham.install@fastsigns.com" className="text-orange-600 dark:text-orange-400 font-medium hover:underline">
                    waltham.install@fastsigns.com
                  </a>{" "}
                  or call <span className="font-medium">(781) 894-4000</span>.
                </p>
              </div>
            )}

            {status === "already" && result && (
              <div className="text-center" data-testid="confirmation-already">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                  <CheckCircle className="h-10 w-10 text-blue-600 dark:text-blue-400" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-already-confirmed-title">
                  Already Confirmed
                </h1>
                <p className="text-muted-foreground mb-6" data-testid="text-already-confirmed-message">
                  This booking has already been confirmed. No further action is needed.
                </p>

                <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3 mb-6">
                  <h3 className="font-semibold text-sm text-foreground">
                    {result.event.title}
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>{formatDate(result.event.date)}</span>
                  </div>
                  {result.event.startTime && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 flex-shrink-0" />
                      <span>
                        {formatTime(result.event.startTime)}
                        {result.event.endTime && ` - ${formatTime(result.event.endTime)}`}
                      </span>
                    </div>
                  )}
                  {result.event.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span>{result.event.address}</span>
                    </div>
                  )}
                </div>

                <Button
                  variant="outline"
                  className="w-full mb-6 border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  data-testid="button-save-to-calendar-already"
                  onClick={() => {
                    window.open(buildGoogleCalendarUrl(result.event), "_blank");
                  }}
                >
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Save to Calendar
                </Button>
              </div>
            )}

            {status === "error" && (
              <div className="text-center" data-testid="confirmation-error">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                  <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-error-title">
                  Confirmation Failed
                </h1>
                <p className="text-muted-foreground mb-6" data-testid="text-error-message">
                  {errorMessage}
                </p>
                <p className="text-sm text-muted-foreground">
                  Please contact us at{" "}
                  <a href="mailto:waltham.install@fastsigns.com" className="text-orange-600 dark:text-orange-400 font-medium hover:underline">
                    waltham.install@fastsigns.com
                  </a>{" "}
                  or call <span className="font-medium">(781) 894-4000</span> for assistance.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by <span className="text-orange-600 dark:text-orange-400 font-semibold">InstalliQ.ai</span>
        </p>
      </div>
    </div>
  );
}
