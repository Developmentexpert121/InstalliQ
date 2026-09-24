import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Shield, ArrowRight, Loader2, Zap, Lock } from "lucide-react";

declare global {
  interface Window {
    Razorpay: any;
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function PaymentSection() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [paying, setPaying] = useState(false);

  const { mutate: createOrder, isPending: creatingOrder } = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to create payment order");
      }
      return res.json();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setPaying(false);
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async (data: { orderId: string; paymentId: string; signature: string }) => {
      const res = await fetch("/api/payment/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Payment verification failed");
      }
      return res.json();
    },
    onSuccess: async () => {
      toast({ title: "Payment Successful!", description: "Your account is now fully activated. Welcome!" });
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
    onError: (error: any) => {
      toast({ title: "Verification Failed", description: error.message, variant: "destructive" });
      setPaying(false);
    },
  });

  async function handlePayment() {
    const scriptLoaded = await loadRazorpayScript();
    if (!scriptLoaded) {
      toast({ title: "Error", description: "Failed to load payment gateway. Please try again.", variant: "destructive" });
      return;
    }
    setPaying(true);
    createOrder(undefined, {
      onSuccess: (order: any) => {
        const options = {
          key: order.keyId,
          amount: order.amount,
          currency: order.currency,
          name: "InstalliQ.ai",
          description: order.planName || "Account Activation",
          order_id: order.orderId,
          handler: (response: any) => {
            verifyMutation.mutate({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
          },
          prefill: { name: user?.name || "", email: user?.email || "" },
          theme: { color: "#f97316" },
          modal: { ondismiss: () => setPaying(false) },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      },
      onError: () => setPaying(false),
    });
  }

  const isProcessing = paying || creatingOrder || verifyMutation.isPending;

  return (
    <div className="rounded-xl border-2 border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/20 p-6" data-testid="payment-section">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="h-11 w-11 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center shrink-0">
            <Lock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-orange-900 dark:text-orange-200 text-sm">
              Payment Required to Access Features
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
              Complete your payment for the selected plan below to activate your account.
            </p>
          </div>
        </div>
        <Button
          onClick={handlePayment}
          disabled={isProcessing}
          className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white font-semibold gap-2"
          data-testid="button-complete-payment"
        >
          {isProcessing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Processing...</>
          ) : (
            <><Zap className="h-4 w-4" /> Pay &amp; Activate Account</>
          )}
        </Button>
      </div>
      <p className="text-xs text-orange-600/70 dark:text-orange-500/70 mt-3 flex items-center gap-1">
        <Shield className="h-3 w-3" /> Secured by Razorpay. Your payment information is encrypted.
      </p>
    </div>
  );
}

export default function PaymentModal() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const features = [
    "Full calendar & scheduling access",
    "AI-powered work order processing",
    "Project management & photo uploads",
    "Team management & notifications",
  ];

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(8px)" }}
      data-testid="payment-modal-overlay"
    >
      <div className="absolute inset-0 bg-black/80" aria-hidden="true" />

      <div
        className="relative z-10 w-full max-w-md rounded-3xl overflow-hidden shadow-[0_32px_64px_rgba(0,0,0,0.6)]"
        data-testid="payment-modal-card"
        style={{ background: "#0d0f17", border: "1px solid rgba(255,255,255,0.07)" }}
      >
        {/* Gradient header band */}
        <div
          className="h-1.5 w-full"
          style={{ background: "linear-gradient(90deg, #ea580c, #f97316, #fb923c)" }}
        />

        <div className="px-8 pt-8 pb-3 text-center">
          {/* Icon */}
          <div
            className="inline-flex items-center justify-center h-14 w-14 rounded-2xl mb-5"
            style={{ background: "rgba(249,115,22,0.12)", border: "1px solid rgba(249,115,22,0.25)" }}
          >
            <Shield className="h-7 w-7" style={{ color: "#f97316" }} />
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight mb-1.5">Activate Your Account</h1>
          <p className="text-sm leading-relaxed" style={{ color: "#6b7280" }}>
            Select a subscription plan to unlock all features for{" "}
            <span style={{ color: "#d1d5db" }}>{user?.name}</span>
          </p>
        </div>

        {/* Feature list */}
        <div className="px-8 py-5">
          <div
            className="rounded-2xl p-4 space-y-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            {features.map((f) => (
              <div key={f} className="flex items-center gap-3">
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(34,197,94,0.12)" }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
                </div>
                <span className="text-sm" style={{ color: "#9ca3af" }}>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div className="px-8 pb-8">
          <button
            className="w-full h-12 rounded-xl font-semibold text-white text-sm flex items-center justify-center gap-2 transition-all duration-150 hover:brightness-110 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, #ea580c, #f97316)" }}
            onClick={() => setLocation("/subscription-plans")}
            data-testid="button-view-plans"
          >
            View Plans &amp; Pay
            <ArrowRight className="h-4 w-4" />
          </button>

          <div className="flex items-center justify-center gap-1.5 mt-4">
            <Shield className="h-3 w-3" style={{ color: "#4b5563" }} />
            <p className="text-xs" style={{ color: "#4b5563" }}>
              Secured by Razorpay · Payments are encrypted
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
