import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { usePageHeader } from "@/lib/page-header";
import { PaymentSection } from "@/pages/payment";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  CreditCard, Plus, Pencil, Trash2, Power, CheckCircle2, AlertTriangle,
  XCircle, Crown, Zap, Star, TrendingUp, TrendingDown, Users, Calendar, RefreshCw, ShieldCheck,
  Bell, X, UserCheck, Clock, ArrowUp, ArrowDown
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

declare global {
  interface Window { Razorpay: any; }
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

interface Plan {
  id: number;
  name: string;
  price: string;
  original_price: string | null;
  event_limit: number;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

interface Subscription {
  subscription: {
    id: number;
    admin_id: number;
    plan_id: number;
    plan_name: string;
    price: string;
    event_limit: number;
    status: string;
    started_at: string;
  } | null;
  eventsUsed: number;
  eventsCompleted: number;
  eventsRemaining: number | null;
  planName: string | null;
  eventLimit: number | null;
  price: string | null;
  status: "active" | "blocked" | "no_plan";
  planNotification: string | null;
}

interface AdminSubRow {
  id: number;
  name: string;
  email: string;
  plan_name: string | null;
  price: string | null;
  event_limit: number | null;
  status: string | null;
  started_at: string | null;
  events_used: number;
}

const PLAN_ICONS = [Zap, Star, Crown];
const PLAN_GRADIENTS = [
  "from-blue-500 to-cyan-500",
  "from-violet-500 to-purple-500",
  "from-orange-500 to-amber-500",
];
const PLAN_FEATURE_COLORS = [
  "text-blue-500 dark:text-blue-400",
  "text-violet-500 dark:text-violet-400",
  "text-orange-500 dark:text-orange-400",
];
const PLAN_ACCENT_COLORS = [
  "bg-gradient-to-r from-blue-500 to-cyan-500",
  "bg-gradient-to-r from-violet-500 to-purple-500",
  "bg-gradient-to-r from-orange-500 to-amber-500",
];
const PLAN_BUTTON_STYLES = [
  "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0",
  "bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white border-0",
  "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white border-0",
];
const PLAN_RING_COLORS = [
  "ring-blue-500",
  "ring-violet-500",
  "ring-orange-500",
];

const PLAN_ORIGINAL_PRICES: Record<string, string> = {
  "Basic": "99",
  "Standard": "120",
  "Premium": "150",
  "Basic Plan": "99",
  "Standard Plan": "120",
  "Premium Plan": "150",
};

function PlanCard({
  plan,
  index,
  currentPlan,
  onSubscribe,
  isSubscribing,
  subscribingId,
  payingForPlanId,
}: {
  plan: Plan;
  index: number;
  currentPlan: Plan | null;
  onSubscribe: (planId: number) => void;
  isSubscribing: boolean;
  subscribingId: number | null;
  payingForPlanId: number | null;
}) {
  const isCurrentPlan = currentPlan?.id === plan.id;
  const isUpgrade = !isCurrentPlan && currentPlan !== null && plan.sort_order > currentPlan.sort_order;
  const isDowngrade = !isCurrentPlan && currentPlan !== null && plan.sort_order < currentPlan.sort_order;
  const isThisSubscribing = subscribingId === plan.id;
  const isThisPaying = payingForPlanId === plan.id;
  const isBusy = isThisSubscribing || isThisPaying;
  const Icon = PLAN_ICONS[index % PLAN_ICONS.length];
  const gradient = PLAN_GRADIENTS[index % PLAN_GRADIENTS.length];
  const featureColor = PLAN_FEATURE_COLORS[index % PLAN_FEATURE_COLORS.length];
  const accentColor = PLAN_ACCENT_COLORS[index % PLAN_ACCENT_COLORS.length];
  const buttonStyle = PLAN_BUTTON_STYLES[index % PLAN_BUTTON_STYLES.length];
  const ringColor = PLAN_RING_COLORS[index % PLAN_RING_COLORS.length];
  const isPopular = index === 1;
  const origPrice = plan.original_price || PLAN_ORIGINAL_PRICES[plan.name];
  const savings = origPrice ? (parseFloat(origPrice) - parseFloat(plan.price)).toFixed(2).replace(/\.00$/, "") : null;

  function getButtonLabel() {
    if (isThisSubscribing) return <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Updating Plan...</>;
    if (isThisPaying) return <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opening Payment...</>;
    if (isCurrentPlan) return <><CheckCircle2 className="h-4 w-4 mr-2" /> Active Plan</>;
    if (isUpgrade) return <><ArrowUp className="h-4 w-4 mr-2" /> Upgrade Plan</>;
    if (isDowngrade) return <><ArrowDown className="h-4 w-4 mr-2" /> Downgrade Plan</>;
    return <><ArrowUp className="h-4 w-4 mr-2" /> Get Started</>;
  }

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-card transition-all duration-200 overflow-hidden
        ${isCurrentPlan ? `ring-2 ${ringColor} shadow-xl` : "hover:shadow-lg hover:-translate-y-0.5"}
        ${isPopular && !isCurrentPlan ? "shadow-md" : ""}`}
      data-testid={`card-plan-${plan.id}`}
    >
      {/* Colored top accent bar */}
      <div className={`h-1.5 w-full ${accentColor}`} />

      {/* Popular / Current badge */}
      {(isPopular || isCurrentPlan) && (
        <div className="absolute top-4 right-4 z-10">
          {isCurrentPlan ? (
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full text-white ${accentColor}`}>
              <CheckCircle2 className="h-3 w-3" /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
              ⭐ Most Popular
            </span>
          )}
        </div>
      )}

      <div className="p-6 flex flex-col flex-1 gap-5">
        {/* Icon + Plan name */}
        <div className="flex items-center gap-3">
          <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm shrink-0`}>
            <Icon className="h-5 w-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-lg leading-tight">{plan.name}</h3>
            {savings && (
              <span className="inline-block text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full mt-0.5">
                Save ${savings}
              </span>
            )}
          </div>
        </div>

        {/* Pricing */}
        <div>
          {origPrice ? (
            <>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-sm text-muted-foreground line-through">${origPrice}</span>
                <span className="text-muted-foreground text-sm">→</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-4xl font-extrabold tracking-tight">${plan.price}</span>
                <span className="text-muted-foreground text-sm font-medium">/ month</span>
              </div>
            </>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-extrabold tracking-tight">${plan.price}</span>
              <span className="text-muted-foreground text-sm font-medium">/ month</span>
            </div>
          )}
        </div>

        {/* Divider */}
        <div className="border-t" />

        {/* Features */}
        <ul className="space-y-2.5 flex-1">
          {[
            { label: `${plan.event_limit} events included`, sub: "per month" },
            { label: "Real-time usage tracking" },
            { label: "Limit warnings & alerts" },
            { label: "Priority support" },
          ].map((f, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <CheckCircle2 className={`h-4 w-4 mt-0.5 shrink-0 ${featureColor}`} />
              <span className="text-sm text-foreground leading-snug">
                <span className="font-medium">{f.label}</span>
                {f.sub && <span className="text-muted-foreground"> · {f.sub}</span>}
              </span>
            </li>
          ))}
        </ul>

        {/* CTA Button */}
        <Button
          className={`w-full h-11 rounded-xl font-semibold text-sm transition-all duration-150 ${
            isCurrentPlan
              ? "bg-muted text-muted-foreground hover:bg-muted cursor-default border"
              : isDowngrade
              ? "bg-muted/60 hover:bg-muted text-foreground border"
              : buttonStyle
          }`}
          disabled={isCurrentPlan || isBusy || (isSubscribing && !isThisSubscribing) || (payingForPlanId !== null && !isThisPaying)}
          onClick={() => !isCurrentPlan && !isBusy && onSubscribe(plan.id)}
          data-testid={`button-subscribe-${plan.id}`}
        >
          {getButtonLabel()}
        </Button>
      </div>
    </div>
  );
}

function CountdownTimer({ startedAt }: { startedAt: string }) {
  const expiresAt = new Date(startedAt).getTime() + 30 * 24 * 60 * 60 * 1000;

  const [remaining, setRemaining] = useState(() => Math.max(0, expiresAt - Date.now()));

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, expiresAt - Date.now()));
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((remaining % (1000 * 60)) / 1000);

  const expired = remaining === 0;

  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {expired ? "Plan Expired" : "Plan Expires In"}
        </span>
      </div>
      {expired ? (
        <p className="text-sm font-semibold text-destructive">Renew your plan to continue.</p>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Days", value: days },
            { label: "Hours", value: hours },
            { label: "Mins", value: minutes },
            { label: "Secs", value: seconds },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col items-center bg-primary/10 rounded-md py-1.5 px-1">
              <span className="text-lg font-bold tabular-nums leading-tight">
                {String(value).padStart(2, "0")}
              </span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  const isBlocked = used >= limit;
  const color = isBlocked ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-primary";

  return (
    <div className="space-y-2">
      <div className="relative h-3 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{used} used</span>
        <span>{limit} total</span>
      </div>
    </div>
  );
}

export default function SubscriptionPlansPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { setHeaderInfo } = usePageHeader();
  const isSuperAdmin = user?.role === "super_admin";
  const isAdmin = user?.role === "admin";

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<Plan | null>(null);
  const [subscribingId, setSubscribingId] = useState<number | null>(null);
  const [changingPlanFor, setChangingPlanFor] = useState<AdminSubRow | null>(null);
  const [selectedAssignPlanId, setSelectedAssignPlanId] = useState<string>("");
  const [payingForPlanId, setPayingForPlanId] = useState<number | null>(null);

  const { data: gateStatus } = useQuery<{ enabled: boolean }>({
    queryKey: ["/api/settings/subscription-gate"],
    enabled: isSuperAdmin,
  });

  const gateToggleMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      apiRequest("POST", "/api/settings/subscription-gate", { enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings/subscription-gate"] });
      toast({ title: gateStatus?.enabled ? "Subscription gate disabled" : "Subscription gate enabled" });
    },
    onError: () => toast({ title: "Failed to update setting", variant: "destructive" }),
  });

  const [form, setForm] = useState({
    name: "", price: "", originalPrice: "", eventLimit: "", isActive: true, isDefault: false, sortOrder: "0",
  });

  useEffect(() => {
    setHeaderInfo({
      title: "Subscription Plans",
      description: isSuperAdmin ? "Manage plans and view owner subscriptions" : "View and manage your subscription",
      icon: <CreditCard className="h-5 w-5 text-primary" />,
    });
    return () => setHeaderInfo(null);
  }, [isSuperAdmin]);

  const { data: activePlans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/subscription/plans"],
  });

  const { data: allPlans = [], isLoading: allPlansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/subscription/plans/all"],
    enabled: isSuperAdmin,
  });

  const { data: mySubscription, isLoading: subLoading } = useQuery<Subscription>({
    queryKey: ["/api/subscription/my-subscription"],
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  const { data: adminSubs = [], isLoading: adminSubsLoading } = useQuery<AdminSubRow[]>({
    queryKey: ["/api/subscription/admin-subscriptions"],
    enabled: isSuperAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("POST", "/api/subscription/plans", {
        name: data.name, price: data.price,
        originalPrice: data.originalPrice || null,
        eventLimit: parseInt(data.eventLimit),
        isActive: data.isActive, isDefault: data.isDefault, sortOrder: parseInt(data.sortOrder),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/plans/all"] });
      setShowCreateDialog(false);
      resetForm();
      toast({ title: "Plan created successfully" });
    },
    onError: () => toast({ title: "Failed to create plan", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: typeof form & { id: number }) =>
      apiRequest("PUT", `/api/subscription/plans/${data.id}`, {
        name: data.name, price: data.price,
        originalPrice: data.originalPrice || null,
        eventLimit: parseInt(data.eventLimit),
        isActive: data.isActive, isDefault: data.isDefault, sortOrder: parseInt(data.sortOrder),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/plans/all"] });
      setEditingPlan(null);
      resetForm();
      toast({ title: "Plan updated successfully" });
    },
    onError: () => toast({ title: "Failed to update plan", variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: (planId: number) => apiRequest("PATCH", `/api/subscription/plans/${planId}/toggle`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/plans/all"] });
      toast({ title: "Plan status updated" });
    },
    onError: () => toast({ title: "Failed to toggle plan", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (planId: number) => apiRequest("DELETE", `/api/subscription/plans/${planId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/plans"] });
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/plans/all"] });
      setDeletingPlan(null);
      toast({ title: "Plan deleted" });
    },
    onError: (err: any) => {
      setDeletingPlan(null);
      toast({ title: err?.message || "Failed to delete plan", variant: "destructive" });
    },
  });


  const dismissNotificationMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/subscription/dismiss-notification", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/my-subscription"] });
    },
  });

  const assignPlanMutation = useMutation({
    mutationFn: ({ adminId, planId }: { adminId: number; planId: number }) =>
      apiRequest("POST", "/api/subscription/assign-plan", { adminId, planId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscription/admin-all"] });
      setChangingPlanFor(null);
      setSelectedAssignPlanId("");
      toast({ title: "Plan assigned successfully and admin has been notified." });
    },
    onError: (err: any) => {
      toast({ title: err?.message || "Failed to assign plan", variant: "destructive" });
    },
  });

  function resetForm() {
    setForm({ name: "", price: "", originalPrice: "", eventLimit: "", isActive: true, isDefault: false, sortOrder: "0" });
  }

  function openEdit(plan: Plan) {
    setEditingPlan(plan);
    setForm({
      name: plan.name, price: plan.price,
      originalPrice: plan.original_price ?? "",
      eventLimit: String(plan.event_limit),
      isActive: plan.is_active, isDefault: plan.is_default, sortOrder: String(plan.sort_order),
    });
  }

  async function handleSubscribe(planId: number) {
    setSubscribingId(planId);
    setPayingForPlanId(planId);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) {
        toast({ title: "Failed to load payment gateway. Please refresh and try again.", variant: "destructive" });
        setSubscribingId(null);
        setPayingForPlanId(null);
        return;
      }

      const orderRes = await apiRequest("POST", "/api/payment/create-plan-order", { planId });
      const order = await orderRes.json();

      const options = {
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "InstalliQ.ai",
        description: `${order.planName} - Subscription Payment`,
        order_id: order.orderId,
        handler: async (response: any) => {
          try {
            const verifyRes = await apiRequest("POST", "/api/payment/verify-plan", {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              planId,
            });
            if (verifyRes.ok) {
              toast({ title: "Payment successful! Your plan is now active." });
              await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
              await queryClient.invalidateQueries({ queryKey: ["/api/subscription/my-subscription"] });
            } else {
              toast({ title: "Payment verification failed. Your plan was not changed. Contact support.", variant: "destructive" });
            }
          } catch {
            toast({ title: "Payment verification error. Your plan was not changed. Contact support.", variant: "destructive" });
          } finally {
            setPayingForPlanId(null);
            setSubscribingId(null);
          }
        },
        modal: {
          ondismiss: () => {
            setPayingForPlanId(null);
            setSubscribingId(null);
            toast({ title: "Payment cancelled. Your current plan remains unchanged." });
          },
        },
        theme: { color: "#f97316" },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch {
      setSubscribingId(null);
      setPayingForPlanId(null);
      toast({ title: "Failed to initiate payment. Please try again.", variant: "destructive" });
    }
  }

  const currentPlanId = mySubscription?.subscription?.plan_id ?? null;
  const currentPlan = currentPlanId && activePlans ? (activePlans.find(p => p.id === currentPlanId) ?? null) : null;
  const sub = mySubscription;
  const statusIcon = sub?.status === "blocked" ? <XCircle className="h-4 w-4 text-red-500" /> :
    sub?.status === "active" ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : null;

  const PlanForm = ({ onSave, saving }: { onSave: () => void; saving: boolean }) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="plan-name">Plan Name *</Label>
          <Input id="plan-name" placeholder="e.g. Basic Plan" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-plan-name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-original-price">Original Price ($)</Label>
          <Input id="plan-original-price" placeholder="e.g. 99" value={form.originalPrice}
            onChange={e => setForm(f => ({ ...f, originalPrice: e.target.value }))} data-testid="input-plan-original-price" />
          <p className="text-xs text-muted-foreground">Shown crossed out as the "before" price</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-price">Offer Price ($) *</Label>
          <Input id="plan-price" placeholder="e.g. 89.99" value={form.price}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))} data-testid="input-plan-price" />
          <p className="text-xs text-muted-foreground">Discounted price shown to admins</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="plan-event-limit">Event Limit *</Label>
          <Input id="plan-event-limit" type="number" placeholder="e.g. 100" value={form.eventLimit}
            onChange={e => setForm(f => ({ ...f, eventLimit: e.target.value }))} data-testid="input-plan-event-limit" />
          <p className="text-xs text-muted-foreground">Included events per month</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-2">
          <Switch id="plan-active" checked={form.isActive}
            onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} data-testid="switch-plan-active" />
          <Label htmlFor="plan-active" className="cursor-pointer">Active</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="plan-default" checked={form.isDefault}
            onCheckedChange={v => setForm(f => ({ ...f, isDefault: v }))} data-testid="switch-plan-default" />
          <Label htmlFor="plan-default" className="cursor-pointer">Default Plan</Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => { setShowCreateDialog(false); setEditingPlan(null); resetForm(); }}>
          Cancel
        </Button>
        <Button onClick={onSave} disabled={saving || !form.name || !form.price || !form.eventLimit}
          data-testid="button-save-plan">
          {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : "Save Plan"}
        </Button>
      </DialogFooter>
    </div>
  );

  if (!isSuperAdmin && !isAdmin) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center text-muted-foreground">
          <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Subscription management is for admins only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-6 space-y-6">
      {/* ── ADMIN VIEW ──────────────────────────────────────────── */}
      {isAdmin && (
        <>
          {/* Payment Required Section — shown at top when admin has not paid yet */}
          {user?.paymentRequired && !user?.paymentCompleted && (
            <PaymentSection />
          )}

          {/* Plan Change Notification Banner */}
          {sub?.planNotification && (
            <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30" data-testid="plan-notification-banner">
              <Bell className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-sm mb-1">Plan Update Notification</p>
                <p className="text-sm text-amber-700 dark:text-amber-400">{sub.planNotification}</p>
              </div>
              <Button
                size="sm" variant="ghost"
                className="shrink-0 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40 h-7 w-7 p-0"
                onClick={() => dismissNotificationMutation.mutate()}
                disabled={dismissNotificationMutation.isPending}
                data-testid="button-dismiss-notification"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Current Plan Banner */}
          <div>
            {subLoading ? (
              <Card className="p-6 flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="text-muted-foreground">Loading your subscription...</span>
              </Card>
            ) : sub?.status === "no_plan" ? (
              <Card className="border-dashed p-6 text-center">
                <CreditCard className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-50" />
                <p className="font-semibold mb-1">No active subscription</p>
                <p className="text-sm text-muted-foreground">Choose a plan below to get started.</p>
              </Card>
            ) : sub ? (
              <Card className={`${sub.status === "blocked" ? "border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20" : "border-primary/30 bg-primary/5"}`}>
                <CardHeader className="pb-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{sub.planName}</CardTitle>
                        <Badge variant={sub.status === "blocked" ? "destructive" : "secondary"}>
                          {statusIcon}
                          <span className="ml-1 capitalize">{sub.status === "active" ? "Active" : sub.status === "blocked" ? "Blocked" : ""}</span>
                        </Badge>
                      </div>
                      <CardDescription>${sub.price}/month · {sub.eventLimit} events per month</CardDescription>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-2xl font-bold">{sub.eventsUsed}</div>
                      <div className="text-xs text-muted-foreground">events this month</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <UsageBar used={sub.eventsUsed} limit={sub.eventLimit!} />
                  {sub.status === "blocked" && (
                    <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg p-3">
                      <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>You've reached the maximum event limit of {sub.eventLimit}. New bookings are blocked until the next billing cycle or you upgrade your plan.</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3 pt-1">
                    {[
                      { label: "Used", value: sub.eventsUsed, icon: Calendar },
                      { label: "Remaining", value: Math.max(0, sub.eventLimit! - sub.eventsUsed), icon: TrendingUp },
                      { label: "Completed", value: sub.eventsCompleted, icon: CheckCircle2 },
                    ].map(({ label, value, icon: Icon }) => (
                      <div key={label} className="text-center p-2 rounded-lg bg-background/60">
                        <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
                        <div className="font-bold text-lg">{value}</div>
                        <div className="text-xs text-muted-foreground">{label}</div>
                      </div>
                    ))}
                  </div>
                  {sub.subscription?.started_at && (
                    <CountdownTimer startedAt={sub.subscription.started_at} />
                  )}
                </CardContent>
              </Card>
            ) : null}
          </div>

          {/* Plan Comparison */}
          <div>
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" /> Available Plans
            </h2>
            {plansLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activePlans.length === 0 ? (
              <Card className="p-8 text-center">
                <CreditCard className="h-10 w-10 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-muted-foreground">No plans available at this time.</p>
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {activePlans.map((plan, i) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    index={i}
                    currentPlan={currentPlan}
                    onSubscribe={handleSubscribe}
                    isSubscribing={subscribingId !== null}
                    subscribingId={subscribingId}
                    payingForPlanId={payingForPlanId}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ── SUPER ADMIN VIEW ─────────────────────────────────────── */}
      {isSuperAdmin && (
        <>
        <Card className="border-primary/20 bg-primary/5" data-testid="card-subscription-gate">
          <CardContent className="flex items-center justify-between py-4 px-5">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">Subscription Gate</p>
                <p className="text-xs text-muted-foreground">
                  When enabled, admins must subscribe and pay before accessing any feature
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${gateStatus?.enabled ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                {gateStatus?.enabled ? "Active" : "Inactive"}
              </span>
              <Switch
                checked={gateStatus?.enabled ?? false}
                onCheckedChange={(checked) => gateToggleMutation.mutate(checked)}
                disabled={gateToggleMutation.isPending}
                data-testid="switch-subscription-gate"
              />
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="plans" className="space-y-4">
          <div className="flex flex-col gap-3">
            <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
              <TabsList className="w-max sm:w-auto" data-testid="tabs-subscription">
                <TabsTrigger value="plans" className="text-xs sm:text-sm px-2.5 sm:px-3 gap-1 sm:gap-1.5" data-testid="tab-plans">
                  <CreditCard className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Manage</span> Plans
                </TabsTrigger>
                <TabsTrigger value="admins" className="text-xs sm:text-sm px-2.5 sm:px-3 gap-1 sm:gap-1.5" data-testid="tab-admins">
                  <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Owner</span> Subs
                </TabsTrigger>
                <TabsTrigger value="preview" className="text-xs sm:text-sm px-2.5 sm:px-3 gap-1 sm:gap-1.5" data-testid="tab-preview">
                  <Star className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                  <span className="hidden sm:inline">Pricing</span> Preview
                </TabsTrigger>
              </TabsList>
            </div>
            <Button className="w-full sm:w-auto sm:self-end" onClick={() => { resetForm(); setShowCreateDialog(true); }} data-testid="button-create-plan">
              <Plus className="h-4 w-4 mr-1.5" /> New Plan
            </Button>
          </div>

          {/* Plans Management Tab */}
          <TabsContent value="plans" className="space-y-4">
            {allPlansLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">All Plans ({allPlans.length})</CardTitle>
                  <CardDescription>Create, edit, and manage subscription plans available to admins.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="sm:hidden divide-y divide-border">
                    {allPlans.length === 0 ? (
                      <div className="text-center text-muted-foreground py-12 px-4">
                        No plans yet. Click "New Plan" to create one.
                      </div>
                    ) : allPlans.map((plan) => (
                      <div key={plan.id} className="p-4" data-testid={`row-plan-${plan.id}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-sm">{plan.name}</span>
                              {plan.is_default && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Default</Badge>}
                              <Badge variant={plan.is_active ? "default" : "secondary"}
                                className={`text-[10px] px-1.5 py-0 ${plan.is_active ? "bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/15" : ""}`}>
                                {plan.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </div>
                            <div className="flex items-baseline gap-3 text-sm">
                              <span className="font-bold text-base">${plan.price}<span className="text-muted-foreground text-xs font-normal">/mo</span></span>
                              <span className="text-muted-foreground text-xs">{plan.event_limit.toLocaleString()} events</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Button size="icon" variant="ghost" className="h-8 w-8"
                              onClick={() => openEdit(plan)} data-testid={`button-edit-plan-${plan.id}`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8"
                              onClick={() => toggleMutation.mutate(plan.id)} data-testid={`button-toggle-plan-${plan.id}`}
                              disabled={toggleMutation.isPending}>
                              <Power className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeletingPlan(plan)} data-testid={`button-delete-plan-${plan.id}`}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden sm:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Plan Name</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead className="text-right">Event Limit</TableHead>
                          <TableHead className="text-right">Sort Order</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allPlans.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                              No plans yet. Click "New Plan" to create one.
                            </TableCell>
                          </TableRow>
                        ) : allPlans.map((plan) => (
                          <TableRow key={plan.id} data-testid={`row-plan-${plan.id}`}>
                            <TableCell>
                              <div className="font-medium">{plan.name}</div>
                              {plan.is_default && <Badge variant="outline" className="text-xs mt-0.5">Default</Badge>}
                            </TableCell>
                            <TableCell className="font-medium">${plan.price}<span className="text-muted-foreground text-xs">/mo</span></TableCell>
                            <TableCell className="text-right">{plan.event_limit.toLocaleString()}</TableCell>
                            <TableCell className="text-right">{plan.sort_order}</TableCell>
                            <TableCell>
                              <Badge variant={plan.is_active ? "default" : "secondary"}
                                className={plan.is_active ? "bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-green-500/15" : ""}>
                                {plan.is_active ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button size="icon" variant="ghost" className="h-8 w-8"
                                  onClick={() => openEdit(plan)} data-testid={`button-edit-plan-${plan.id}`}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8"
                                  onClick={() => toggleMutation.mutate(plan.id)} data-testid={`button-toggle-plan-${plan.id}`}
                                  disabled={toggleMutation.isPending}>
                                  <Power className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeletingPlan(plan)} data-testid={`button-delete-plan-${plan.id}`}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Admin Subscriptions Tab */}
          <TabsContent value="admins">
            {adminSubsLoading ? (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Owner Subscriptions</CardTitle>
                  <CardDescription>Track subscription status and event usage for all owners.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="sm:hidden divide-y divide-border">
                    {adminSubs.length === 0 ? (
                      <div className="text-center text-muted-foreground py-12 px-4">No admins found.</div>
                    ) : adminSubs.map((row) => {
                      const usedPct = row.event_limit ? Math.min(100, Math.round((row.events_used / row.event_limit) * 100)) : 0;
                      const isBlocked = row.event_limit && row.events_used >= row.event_limit;
                      return (
                        <div key={row.id} className="p-4 space-y-3" data-testid={`row-admin-sub-${row.id}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-semibold text-sm truncate">{row.name}</div>
                              <div className="text-xs text-muted-foreground truncate">{row.email}</div>
                            </div>
                            {!row.plan_name ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0">No Sub</Badge>
                            ) : isBlocked ? (
                              <Badge variant="destructive" className="text-[10px] px-1.5 py-0 flex-shrink-0"><XCircle className="h-3 w-3 mr-0.5" />Blocked</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-400 text-green-600 dark:text-green-400 flex-shrink-0">
                                <CheckCircle2 className="h-3 w-3 mr-0.5" />Healthy
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 text-xs">
                              {row.plan_name ? (
                                <span className="font-medium">{row.plan_name} <span className="text-muted-foreground">${row.price}/mo</span></span>
                              ) : (
                                <span className="text-muted-foreground">No plan</span>
                              )}
                              <span className="text-muted-foreground">
                                {row.events_used}{row.event_limit ? ` / ${row.event_limit}` : ""} events
                              </span>
                            </div>
                          </div>
                          {row.event_limit ? (
                            <div className="space-y-1">
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                <div className={`h-full rounded-full transition-all ${isBlocked ? "bg-red-500" : usedPct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                                  style={{ width: `${usedPct}%` }} />
                              </div>
                              <div className="text-[11px] text-muted-foreground">{usedPct}% used</div>
                            </div>
                          ) : null}
                          <Button
                            size="sm" variant="outline"
                            className="h-8 text-xs gap-1 w-full"
                            onClick={() => { setChangingPlanFor(row); setSelectedAssignPlanId(String(row.events_used > 0 ? "" : "")); }}
                            data-testid={`button-change-plan-${row.id}`}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Change Plan
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                  <div className="hidden sm:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Owner</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead className="text-right">Events Used</TableHead>
                          <TableHead>Usage</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adminSubs.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                              No admins found.
                            </TableCell>
                          </TableRow>
                        ) : adminSubs.map((row) => {
                          const usedPct = row.event_limit ? Math.min(100, Math.round((row.events_used / row.event_limit) * 100)) : 0;
                          const isBlocked = row.event_limit && row.events_used >= row.event_limit;
                          return (
                            <TableRow key={row.id} data-testid={`row-admin-sub-${row.id}`}>
                              <TableCell>
                                <div className="font-medium">{row.name}</div>
                                <div className="text-xs text-muted-foreground">{row.email}</div>
                              </TableCell>
                              <TableCell>
                                {row.plan_name ? (
                                  <div>
                                    <div className="font-medium text-sm">{row.plan_name}</div>
                                    <div className="text-xs text-muted-foreground">${row.price}/mo</div>
                                  </div>
                                ) : (
                                  <Badge variant="outline" className="text-xs text-muted-foreground">No Plan</Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {row.events_used}
                                {row.event_limit && <span className="text-muted-foreground text-xs"> / {row.event_limit}</span>}
                              </TableCell>
                              <TableCell className="min-w-[120px]">
                                {row.event_limit ? (
                                  <div className="space-y-1">
                                    <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full ${isBlocked ? "bg-red-500" : usedPct >= 80 ? "bg-amber-500" : "bg-primary"}`}
                                        style={{ width: `${usedPct}%` }} />
                                    </div>
                                    <div className="text-xs text-muted-foreground">{usedPct}%</div>
                                  </div>
                                ) : <span className="text-muted-foreground text-xs">—</span>}
                              </TableCell>
                              <TableCell>
                                {!row.plan_name ? (
                                  <Badge variant="outline" className="text-xs">No Subscription</Badge>
                                ) : isBlocked ? (
                                  <Badge variant="destructive" className="text-xs"><XCircle className="h-3 w-3 mr-1" />Blocked</Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs border-green-400 text-green-600 dark:text-green-400">
                                    <CheckCircle2 className="h-3 w-3 mr-1" />Healthy
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm" variant="outline"
                                  className="h-7 text-xs gap-1"
                                  onClick={() => { setChangingPlanFor(row); setSelectedAssignPlanId(String(row.events_used > 0 ? "" : "")); }}
                                  data-testid={`button-change-plan-${row.id}`}
                                >
                                  <UserCheck className="h-3 w-3" />
                                  Change Plan
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Pricing Preview Tab */}
          <TabsContent value="preview">
            <div className="space-y-4">
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span>This is a preview of what admins see on their subscription page.</span>
              </div>
              {plansLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                  {activePlans.map((plan, i) => (
                    <PlanCard
                      key={plan.id} plan={plan} index={i}
                      currentPlan={null} onSubscribe={() => {}}
                      isSubscribing={false} subscribingId={null}
                      payingForPlanId={null}
                    />
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
        </>
      )}

      {/* Create Plan Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={v => { if (!v) { setShowCreateDialog(false); resetForm(); } }}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Create New Plan
            </DialogTitle>
            <DialogDescription>Add a new subscription plan for admins to subscribe to.</DialogDescription>
          </DialogHeader>
          <PlanForm
            onSave={() => createMutation.mutate(form)}
            saving={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit Plan Dialog */}
      <Dialog open={!!editingPlan} onOpenChange={v => { if (!v) { setEditingPlan(null); resetForm(); } }}>
        <DialogContent className="w-[95vw] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" /> Edit Plan
            </DialogTitle>
            <DialogDescription>Update the details for this subscription plan.</DialogDescription>
          </DialogHeader>
          <PlanForm
            onSave={() => editingPlan && updateMutation.mutate({ ...form, id: editingPlan.id })}
            saving={updateMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingPlan} onOpenChange={v => { if (!v) setDeletingPlan(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deletingPlan?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This plan will be permanently deleted. Admins currently subscribed to this plan cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deletingPlan && deleteMutation.mutate(deletingPlan.id)}
              data-testid="button-confirm-delete-plan"
            >
              {deleteMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</> : "Delete Plan"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Plan Dialog (Super Admin) */}
      <Dialog open={!!changingPlanFor} onOpenChange={v => { if (!v) { setChangingPlanFor(null); setSelectedAssignPlanId(""); } }}>
        <DialogContent className="max-w-md" data-testid="dialog-assign-plan">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" /> Change Plan for {changingPlanFor?.name}
            </DialogTitle>
            <DialogDescription>
              Select a new subscription plan for this admin. They will receive a notification about the change.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {changingPlanFor?.plan_name && (
              <div className="text-sm text-muted-foreground p-3 bg-muted/50 rounded-lg">
                <span className="font-medium">Current plan:</span> {changingPlanFor.plan_name}
                {changingPlanFor.price && <span> · ${changingPlanFor.price}/month</span>}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>New Plan</Label>
              <Select value={selectedAssignPlanId} onValueChange={setSelectedAssignPlanId} data-testid="select-assign-plan">
                <SelectTrigger data-testid="select-trigger-assign-plan">
                  <SelectValue placeholder="Select a plan..." />
                </SelectTrigger>
                <SelectContent>
                  {allPlans.filter(p => p.is_active).map(plan => (
                    <SelectItem key={plan.id} value={String(plan.id)} data-testid={`option-plan-${plan.id}`}>
                      {plan.name} — ${plan.price}/mo · {plan.event_limit} events
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setChangingPlanFor(null); setSelectedAssignPlanId(""); }}>
              Cancel
            </Button>
            <Button
              disabled={!selectedAssignPlanId || assignPlanMutation.isPending}
              onClick={() => changingPlanFor && selectedAssignPlanId && assignPlanMutation.mutate({ adminId: changingPlanFor.id, planId: parseInt(selectedAssignPlanId) })}
              data-testid="button-confirm-assign-plan"
            >
              {assignPlanMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Assigning...</> : "Assign Plan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
