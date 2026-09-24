import { useState } from "react";
import { MessageSquarePlus, X, Bug, Lightbulb, Loader2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

type FeedbackType = "bug" | "enhancement";

export function FeedbackWidget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [notes, setNotes] = useState("");

  if (!user) return null;

  function handleOpen() {
    if (open) {
      closeWidget();
      return;
    }
    setOpen(true);
    setSubmitted(false);
    setNotes("");
    setFeedbackType("bug");
  }

  function closeWidget() {
    setOpen(false);
    setNotes("");
    setSubmitted(false);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await apiRequest("POST", "/api/feedback", {
        feedbackType,
        notes,
        screenshotDataUrl: null,
        pageUrl: window.location.pathname,
        pageTitle: document.title,
      });
      setSubmitted(true);
      toast({ title: "Feedback sent", description: "Thanks! We'll review it shortly." });
      setTimeout(() => closeWidget(), 1800);
    } catch {
      toast({ title: "Failed to send feedback", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={handleOpen}
        data-testid="button-feedback-widget"
        aria-label="Send feedback"
        className="fixed bottom-5 right-5 z-50 flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground shadow-lg px-3.5 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
        style={{ userSelect: "none" }}
      >
        <MessageSquarePlus className="h-4 w-4" />
        <span className="hidden sm:inline">Feedback</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={(e) => { if (e.target === e.currentTarget) closeWidget(); }}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-2xl w-full sm:w-[480px] max-h-[90vh] flex flex-col overflow-hidden mx-2 mb-2 sm:mx-0 sm:mb-0"
            data-testid="feedback-modal"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h2 className="font-semibold text-sm">Send Feedback</h2>
              <button onClick={closeWidget} data-testid="button-close-feedback" className="text-muted-foreground hover:text-foreground transition-colors rounded-md p-1">
                <X className="h-4 w-4" />
              </button>
            </div>

            {submitted ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Check className="h-10 w-10 text-green-500" />
                <p className="text-sm font-medium">Feedback received — thank you!</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Select <strong>Bug Report</strong> for something that isn't working, or <strong>Enhancement</strong> for an idea to improve the app, then describe it below.
                </p>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Type</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFeedbackType("bug")}
                      data-testid="button-type-bug"
                      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${feedbackType === "bug" ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:border-border/60"}`}
                    >
                      <Bug className="h-4 w-4" />
                      Bug Report
                    </button>
                    <button
                      onClick={() => setFeedbackType("enhancement")}
                      data-testid="button-type-enhancement"
                      className={`flex-1 flex items-center justify-center gap-2 rounded-lg border py-2.5 text-sm font-medium transition-colors ${feedbackType === "enhancement" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-border/60"}`}
                    >
                      <Lightbulb className="h-4 w-4" />
                      Enhancement
                    </button>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Notes</p>
                  <Textarea
                    placeholder={feedbackType === "bug" ? "Describe what went wrong..." : "Describe your idea or suggestion..."}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    data-testid="textarea-feedback-notes"
                    rows={4}
                    className="resize-none text-sm"
                  />
                </div>

                <div className="text-xs text-muted-foreground">
                  Page: <span className="font-mono">{window.location.pathname}</span>
                </div>
              </div>
            )}

            {!submitted && (
              <div className="px-4 py-3 border-t border-border">
                <Button
                  onClick={handleSubmit}
                  disabled={submitting || !notes.trim()}
                  data-testid="button-submit-feedback"
                  className="w-full"
                >
                  {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  {submitting ? "Sending..." : "Send Feedback"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
