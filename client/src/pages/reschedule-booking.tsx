import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, AlertCircle, Loader2, Calendar, Clock, MapPin, CalendarClock } from "lucide-react";

interface BookingEvent {
  id: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  address: string;
  workJobNumber: string;
  status: string;
}

export default function RescheduleBookingPage() {
  const params = useParams<{ token: string }>();
  const [status, setStatus] = useState<"loading" | "form" | "submitting" | "success" | "error">("loading");
  const [event, setEvent] = useState<BookingEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    const fetchBooking = async () => {
      try {
        const response = await fetch(`/api/reschedule-booking/${params.token}`);
        const data = await response.json();

        if (!response.ok) {
          setStatus("error");
          setErrorMessage(data.error || "Failed to load booking");
          return;
        }

        setEvent(data.event);
        setStatus("form");
      } catch {
        setStatus("error");
        setErrorMessage("Unable to connect. Please try again later.");
      }
    };

    if (params.token) {
      fetchBooking();
    }
  }, [params.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim() || !reason.trim()) return;

    setStatus("submitting");

    try {
      const response = await fetch(`/api/reschedule-booking/${params.token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: customerName.trim(),
          customerEmail: customerEmail.trim() || undefined,
          customerPhone: customerPhone.trim() || undefined,
          reason: reason.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("form");
        setErrorMessage(data.error || "Failed to submit reschedule request");
        return;
      }

      setStatus("success");
    } catch {
      setStatus("form");
      setErrorMessage("Unable to connect. Please try again later.");
    }
  };

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
              <div className="text-center py-8" data-testid="loading-reschedule">
                <Loader2 className="h-12 w-12 animate-spin text-orange-500 mx-auto mb-4" />
                <p className="text-lg font-medium text-foreground">Loading booking details...</p>
                <p className="text-sm text-muted-foreground mt-1">Please wait a moment.</p>
              </div>
            )}

            {(status === "form" || status === "submitting") && event && (
              <div data-testid="reschedule-form-container">
                <div className="text-center mb-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 mb-4">
                    <CalendarClock className="h-10 w-10 text-orange-600 dark:text-orange-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-reschedule-title">
                    Reschedule Booking
                  </h1>
                  <p className="text-muted-foreground text-sm">
                    Please fill in your details and let us know why you need to reschedule.
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2 mb-6">
                  <h3 className="font-semibold text-sm text-foreground" data-testid="text-event-title">
                    {event.title}
                  </h3>
                  {event.workJobNumber && (
                    <p className="text-xs text-muted-foreground" data-testid="text-work-job-number">
                      Job #{event.workJobNumber}
                    </p>
                  )}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span data-testid="text-event-date">{formatDate(event.date)}</span>
                  </div>
                  {event.startTime && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4 flex-shrink-0" />
                      <span data-testid="text-event-time">
                        {formatTime(event.startTime)}
                        {event.endTime && ` - ${formatTime(event.endTime)}`}
                      </span>
                    </div>
                  )}
                  {event.address && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 flex-shrink-0" />
                      <span data-testid="text-event-address">{event.address}</span>
                    </div>
                  )}
                </div>

                {errorMessage && (
                  <div className="bg-destructive/10 text-destructive rounded-lg p-3 mb-4 text-sm" data-testid="text-form-error">
                    {errorMessage}
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="customerName">Your Name *</Label>
                    <Input
                      id="customerName"
                      data-testid="input-reschedule-name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Enter your full name"
                      required
                      disabled={status === "submitting"}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customerEmail">Email</Label>
                    <Input
                      id="customerEmail"
                      type="email"
                      data-testid="input-reschedule-email"
                      value={customerEmail}
                      onChange={(e) => setCustomerEmail(e.target.value)}
                      placeholder="your@email.com"
                      disabled={status === "submitting"}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="customerPhone">Phone</Label>
                    <Input
                      id="customerPhone"
                      type="tel"
                      data-testid="input-reschedule-phone"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="(555) 123-4567"
                      disabled={status === "submitting"}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Rescheduling *</Label>
                    <Textarea
                      id="reason"
                      data-testid="input-reschedule-reason"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Please let us know why you need to reschedule and any preferred dates/times..."
                      rows={4}
                      required
                      disabled={status === "submitting"}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={status === "submitting" || !customerName.trim() || !reason.trim()}
                    data-testid="button-submit-reschedule"
                  >
                    {status === "submitting" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Reschedule Request"
                    )}
                  </Button>
                </form>
              </div>
            )}

            {status === "success" && (
              <div className="text-center" data-testid="reschedule-success">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
                  <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-reschedule-success-title">
                  Request Submitted
                </h1>
                <p className="text-muted-foreground mb-6" data-testid="text-reschedule-success-message">
                  Your reschedule request has been submitted successfully. Our team will review it and contact you to arrange a new date and time.
                </p>
                <p className="text-sm text-muted-foreground">
                  If you need immediate assistance, contact us at{" "}
                  <a href="mailto:waltham.install@fastsigns.com" className="text-orange-600 dark:text-orange-400 font-medium hover:underline">
                    waltham.install@fastsigns.com
                  </a>{" "}
                  or call <span className="font-medium">(781) 894-4000</span>.
                </p>
              </div>
            )}

            {status === "error" && (
              <div className="text-center" data-testid="reschedule-error">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
                  <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
                </div>
                <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-error-title">
                  Unable to Reschedule
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
