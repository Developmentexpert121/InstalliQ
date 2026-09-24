import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
import { Loader2, Eye, EyeOff, ScanFace, ArrowLeft, Lock, Mail, CheckCircle, Zap, Shield, BarChart3, Calendar, Users, Camera, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ThemeToggle } from "@/components/theme-toggle";
const FaceCapture = lazy(() => import("@/components/face-capture"));
const installiqLogo = "/installiq-logo.png";

// Login is centralized at SignSuiteIQ. Unauthenticated visitors to the InstalliQ
// login page are redirected there to sign in (and then launch InstalliQ via the
// SignSuiteIQ dashboard). Overridable via env for non-prod environments.
const SIGNSUITE_LOGIN_URL =
  (import.meta.env.VITE_SIGNSUITE_LOGIN_URL as string | undefined)?.trim() ||
  "https://www.signsuiteiq.ai/login";


const loginSchema = z.object({
  username: z.string().min(1, "Email or phone number is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

type LoginFormData = z.infer<typeof loginSchema>;

const features = [
  { icon: Zap, title: "AI-Powered Scheduling", desc: "Extract work orders and auto-schedule installations" },
  { icon: Shield, title: "Secure & Reliable", desc: "Enterprise security with role-based access control" },
  { icon: BarChart3, title: "Complete Tracking", desc: "Photo docs, reports, and real-time visibility" },
  { icon: CheckCircle, title: "Streamlined Workflow", desc: "Work order to completion — one platform" },
];

const stats = [
  { icon: Calendar, value: "10K+", label: "Jobs Scheduled" },
  { icon: Users, value: "500+", label: "Active Users" },
  { icon: Camera, value: "50K+", label: "Photos Captured" },
];

function AnimatedCounter({ value }: { value: string }) {
  const numPart = value.replace(/\D/g, "");
  const suffix = value.replace(/\d/g, "");
  const [count, setCount] = useState(0);
  const target = parseInt(numPart, 10);

  useEffect(() => {
    let frame: number;
    const duration = 2000;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return <span className="login-stat-counter">{count.toLocaleString()}{suffix}</span>;
}

function Typewriter({ words, className }: { words: string[]; className?: string }) {
  const [wordIndex, setWordIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    const currentWord = words[wordIndex];
    const speed = isDeleting ? 40 : 80;

    const timeout = setTimeout(() => {
      if (!isDeleting) {
        setText(currentWord.slice(0, charIndex + 1));
        setCharIndex((c) => c + 1);
        if (charIndex + 1 === currentWord.length) {
          setTimeout(() => setIsDeleting(true), 2000);
        }
      } else {
        setText(currentWord.slice(0, charIndex - 1));
        setCharIndex((c) => c - 1);
        if (charIndex <= 1) {
          setIsDeleting(false);
          setWordIndex((w) => (w + 1) % words.length);
        }
      }
    }, speed);

    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, wordIndex, words]);

  return (
    <span className={className}>
      {text}
      <span className="login-typing-cursor" />
    </span>
  );
}

function Constellation() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<{ x: number; y: number; vx: number; vy: number; r: number }[]>([]);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();

    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    const count = 30;

    if (nodesRef.current.length === 0) {
      nodesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1 + Math.random() * 1.5,
      }));
    }

    const draw = () => {
      const cw = canvas.offsetWidth;
      const ch = canvas.offsetHeight;
      ctx.clearRect(0, 0, cw, ch);

      const nodes = nodesRef.current;
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > cw) n.vx *= -1;
        if (n.y < 0 || n.y > ch) n.vy *= -1;
      }

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 100) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,255,255,${0.12 * (1 - dist / 100)})`;
            ctx.lineWidth = 0.5;
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.25)";
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(draw);
    };

    draw();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState("");
  const [glare, setGlare] = useState({ x: 50, y: 50, opacity: 0 });

  const handleMove = useCallback((e: React.MouseEvent) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const tiltX = (0.5 - y) * 8;
    const tiltY = (x - 0.5) * 8;
    setTransform(`perspective(800px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) scale3d(1.02, 1.02, 1.02)`);
    setGlare({ x: x * 100, y: y * 100, opacity: 0.12 });
  }, []);

  const handleLeave = useCallback(() => {
    setTransform("perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)");
    setGlare({ x: 50, y: 50, opacity: 0 });
  }, []);

  return (
    <div
      ref={cardRef}
      className={className}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ transform, transition: "transform 0.15s ease-out", transformStyle: "preserve-3d", willChange: "transform" }}
    >
      {children}
      <div
        className="absolute inset-0 rounded-lg pointer-events-none z-10"
        style={{
          background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(255,255,255,${glare.opacity}), transparent 60%)`,
          transition: "background 0.15s ease-out",
        }}
      />
    </div>
  );
}

function AuroraEffect() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="login-aurora login-aurora-1" />
      <div className="login-aurora login-aurora-2" />
      <div className="login-aurora login-aurora-3" />
    </div>
  );
}

function FloatingParticles() {
  const particles = Array.from({ length: 10 }, (_, i) => ({
    id: i,
    left: `${8 + Math.random() * 84}%`,
    delay: `${Math.random() * 8}s`,
    duration: `${5 + Math.random() * 7}s`,
    size: `${2 + Math.random() * 3}px`,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <div
          key={p.id}
          className="login-particle"
          style={{
            left: p.left,
            bottom: "-10px",
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            animationDuration: p.duration,
          }}
        />
      ))}
    </div>
  );
}

function MouseSpotlight() {
  const [pos, setPos] = useState({ x: 50, y: 50 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setPos({
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      });
    };
    const el = containerRef.current?.parentElement;
    el?.addEventListener("mousemove", handler);
    return () => el?.removeEventListener("mousemove", handler);
  }, []);

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      <div
        className="absolute w-[500px] h-[500px] rounded-full transition-all duration-700 ease-out"
        style={{
          left: `${pos.x}%`,
          top: `${pos.y}%`,
          transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, hsl(var(--primary) / 0.06), transparent 70%)",
        }}
      />
    </div>
  );
}

function RippleButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const ripple = document.createElement("span");
    ripple.className = "login-ripple-effect";
    ripple.style.left = `${e.clientX - rect.left - 10}px`;
    ripple.style.top = `${e.clientY - rect.top - 10}px`;
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
    props.onClick?.(e as any);
  }, [props.onClick]);

  return (
    <Button ref={btnRef} className={`login-ripple-btn ${className || ""}`} {...props} onClick={handleClick}>
      {children}
    </Button>
  );
}

export default function LoginPage() {
  const { login, faceLogin, user, setUser, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showFaceLogin, setShowFaceLogin] = useState(false);
  const [faceProcessing, setFaceProcessing] = useState(false);
  const [faceLoginFailed, setFaceLoginFailed] = useState(false);
  const [googleLoginAvailable, setGoogleLoginAvailable] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [, setLocation] = useLocation();

  // The SignSuiteIQ bounce is for the LIVE production site only. On the demo
  // environment (demo.installiq.ai) we keep the local login form so the demo
  // can be signed into directly instead of being kicked out to SignSuiteIQ.
  const isDemoHost =
    typeof window !== "undefined" && window.location.hostname.startsWith("demo.");

  useEffect(() => {
    // Wait for the session check to resolve before deciding where to send the
    // visitor — otherwise we'd bounce an already-authenticated user (e.g. one
    // arriving via SSO) to SignSuiteIQ before their session is restored.
    if (authLoading) return;
    if (user) {
      setLocation("/calendar");
      return;
    }
    // Demo host: don't redirect — render the local login form instead.
    if (isDemoHost) return;
    // Resolved and unauthenticated → send to the SignSuiteIQ login page.
    window.location.replace(SIGNSUITE_LOGIN_URL);
  }, [authLoading, user, isDemoHost, setLocation]);

  useEffect(() => {
    const t = setTimeout(() => {
      import("@/components/face-capture").then((m) => m.preloadFaceModels().catch(() => {}));
    }, 4000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    fetch("/api/auth/google/available")
      .then(r => r.json())
      .then(data => setGoogleLoginAvailable(data.available))
      .catch(() => setGoogleLoginAvailable(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error") === "google_auth_failed") {
      const message = params.get("message") || "Google login failed. Please try again.";
      toast({ title: "Google login failed", description: decodeURIComponent(message.replace(/\+/g, " ")), variant: "destructive" });
      window.history.replaceState({}, "", "/");
    }
  }, []);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "", rememberMe: false },
  });

  async function onSubmit(data: LoginFormData) {
    setIsLoading(true);
    try {
      await login(data.username, data.password, data.rememberMe);
      toast({ title: "Welcome back!", description: "You have been logged in successfully." });
    } catch (error) {
      toast({ title: "Login failed", description: error instanceof Error ? error.message : "Please check your credentials and try again.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }

  async function handleFaceLogin(descriptor: Float32Array) {
    setFaceProcessing(true);
    setFaceLoginFailed(false);
    try {
      await faceLogin(Array.from(descriptor));
      toast({ title: "Welcome back!", description: "Face recognized. You have been logged in successfully." });
    } catch (error) {
      toast({ title: "Face login failed", description: error instanceof Error ? error.message : "Please try again or use email and password.", variant: "destructive" });
      setFaceProcessing(false);
      setFaceLoginFailed(true);
    }
  }

  function handleFaceRetry() {
    setFaceLoginFailed(false);
    setFaceProcessing(false);
    setShowFaceLogin(false);
    setTimeout(() => setShowFaceLogin(true), 100);
  }

  const renderLoginForm = () => (
    <TiltCard className="relative">
      <Card className="border-0 shadow-2xl login-animate-scale-in login-card-glow-enhanced" style={{ animationDelay: "0.2s" }}>
        <CardHeader className="space-y-1 pb-2 pt-5">
          <div className="flex justify-center items-center gap-2 mb-1 login-form-field-1">
            <div className="relative">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 cursor-default select-none"
                onClick={(e) => { if (e.ctrlKey || e.metaKey) { setShowVersion(true); setTimeout(() => setShowVersion(false), 10000); } }}
                data-testid="icon-logo"
              >
                <Lock className="h-5 w-5 text-primary" />
              </div>
            </div>
            {showVersion && (
              <span className="text-[10px] text-muted-foreground font-mono whitespace-nowrap animate-in fade-in duration-200">
                v3.3.0 &middot; 2026-03-18
              </span>
            )}
          </div>
          <CardTitle className="text-xl text-center font-bold tracking-tight login-form-field-1">Welcome back</CardTitle>
          <CardDescription className="text-center text-xs login-form-field-1">Sign in to your account to continue</CardDescription>
        </CardHeader>
        <CardContent className="pb-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <div className="login-form-field-2">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Email or Phone Number</FormLabel>
                      <FormControl>
                        <div className={`relative login-input-glow rounded-md transition-all duration-300 ${focusedField === "username" ? "scale-[1.01]" : ""}`}>
                          <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-300 ${focusedField === "username" ? "text-primary" : "text-muted-foreground"}`} />
                          <Input
                            placeholder="Enter your email or phone number"
                            type="text"
                            autoComplete="email"
                            data-testid="input-username"
                            className="pl-10 h-10 border-2 focus:border-primary transition-all duration-300"
                            onFocus={() => setFocusedField("username")}
                            onBlur={() => setFocusedField(null)}
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="login-form-field-3">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Password</FormLabel>
                      <FormControl>
                        <div className={`relative login-input-glow rounded-md transition-all duration-300 ${focusedField === "password" ? "scale-[1.01]" : ""}`}>
                          <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors duration-300 ${focusedField === "password" ? "text-primary" : "text-muted-foreground"}`} />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="Enter your password"
                            autoComplete="current-password"
                            data-testid="input-password"
                            className="pl-10 pr-10 h-10 border-2 focus:border-primary transition-all duration-300"
                            onFocus={() => setFocusedField("password")}
                            onBlur={() => setFocusedField(null)}
                            {...field}
                          />
                          <button
                            type="button"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={() => setShowPassword(!showPassword)}
                            data-testid="button-toggle-password"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="flex items-center justify-between login-form-field-4">
                <FormField
                  control={form.control}
                  name="rememberMe"
                  render={({ field }) => (
                    <FormItem className="flex items-center space-x-2 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          data-testid="checkbox-remember-me"
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal cursor-pointer">Remember me</FormLabel>
                    </FormItem>
                  )}
                />
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                  data-testid="link-forgot-password"
                >
                  Forgot password?
                </Link>
              </div>

              <div className="login-form-field-4">
                <RippleButton
                  type="submit"
                  className="w-full h-10 font-semibold shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 login-btn-shimmer group"
                  disabled={isLoading}
                  data-testid="button-login"
                >
                  {isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                  )}
                  Sign In
                </RippleButton>
              </div>
            </form>
          </Form>

          <div className="my-4 login-form-field-5">
            <div className="flex items-center gap-3">
              <div className="flex-1 login-separator-animated" />
              <span className="text-xs text-muted-foreground uppercase font-medium tracking-wider">or</span>
              <div className="flex-1 login-separator-animated" />
            </div>
          </div>

          <div className="flex gap-3 login-form-field-5">
            {googleLoginAvailable && (
              <Button
                variant="outline"
                className="flex-1 h-10 border-2 hover:bg-muted/50 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 gap-2 font-medium login-trust-item"
                onClick={() => { window.location.href = "/api/auth/google?mode=login"; }}
                data-testid="button-google-login"
              >
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </Button>
            )}
            <Button
              variant="outline"
              className={`h-10 border-2 hover:bg-muted/50 hover:border-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 gap-2 font-medium login-trust-item ${googleLoginAvailable ? "flex-1" : "w-full"}`}
              onClick={() => setShowFaceLogin(true)}
              data-testid="button-face-login"
            >
              <ScanFace className="h-[18px] w-[18px]" />
              Face ID
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-center gap-4 text-[10px] text-muted-foreground/50 login-form-field-5">
            <div className="flex items-center gap-1 login-trust-item cursor-default">
              <svg className="h-3 w-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" className="login-check-icon" />
              </svg>
              <span>256-bit SSL</span>
            </div>
            <div className="login-dot-separator flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center gap-1 login-trust-item cursor-default">
              <svg className="h-3 w-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" className="login-check-icon" style={{ animationDelay: "0.3s" }} />
              </svg>
              <span>SOC 2 Ready</span>
            </div>
            <div className="login-dot-separator flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
              <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            <div className="flex items-center gap-1 login-trust-item cursor-default">
              <svg className="h-3 w-3 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" className="login-check-icon" style={{ animationDelay: "0.6s" }} />
              </svg>
              <span>99.9% Uptime</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </TiltCard>
  );

  const renderFaceLogin = () => (
    <TiltCard className="relative">
      <Card className="border-0 shadow-2xl login-animate-scale-in login-card-glow-enhanced" style={{ animationDelay: "0.1s" }}>
        <CardContent className="pt-8 pb-6 px-8">
          <Suspense fallback={<div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
            <FaceCapture
              mode="verify"
              isProcessing={faceProcessing}
              verifyFailed={faceLoginFailed}
              onRetry={handleFaceRetry}
              onDescriptorCaptured={handleFaceLogin}
              onCancel={() => {
                setShowFaceLogin(false);
                setFaceProcessing(false);
                setFaceLoginFailed(false);
              }}
            />
          </Suspense>
          <div className="relative mt-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/50" />
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full mt-4 text-muted-foreground hover:text-foreground transition-colors text-sm"
            onClick={() => { setShowFaceLogin(false); setFaceProcessing(false); }}
            data-testid="button-back-to-login"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Use email and password instead
          </Button>
        </CardContent>
      </Card>
    </TiltCard>
  );

  // Login is centralized at SignSuiteIQ: don't render the InstalliQ login form.
  // Two cases land here, both transient:
  //   • SSO arrival — session is being restored (authLoading), then we go to
  //     /calendar. Showing a neutral spinner avoids implying we're leaving.
  //   • Genuine unauthenticated visit — the effect above is redirecting them
  //     out to the SignSuiteIQ login page.
  // A neutral "Signing you in…" reads correctly for both and ensures the old
  // login UI never flashes. On the demo host we never redirect, so fall through
  // and render the real login form for unauthenticated visitors.
  if (!user && !isDemoHost) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Signing you in…</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col lg:flex-row overflow-hidden">
      <div className="hidden lg:flex lg:w-[440px] xl:w-[480px] flex-col justify-between p-8 bg-gradient-to-br from-primary via-primary/90 to-orange-600 text-white relative overflow-hidden login-animate-gradient">
        <div className="absolute inset-0 opacity-[0.07]">
          <div className="absolute top-10 -left-10 w-60 h-60 rounded-full bg-white/30 blur-3xl login-orb-1" />
          <div className="absolute bottom-20 right-0 w-80 h-80 rounded-full bg-white/20 blur-3xl login-orb-2" />
          <div className="absolute top-1/2 left-1/3 w-40 h-40 rounded-full bg-white/25 blur-2xl login-orb-3" />
        </div>

        <AuroraEffect />
        <Constellation />
        <FloatingParticles />

        <div className="relative z-10">
          <div className="login-animate-fade-up" style={{ animationDelay: "0.1s" }}>
            <img
              src={installiqLogo}
              alt="InstalliQ.ai"
              className="h-14 object-contain rounded-lg mb-3 login-logo-glow"
            />
          </div>
          <h1 className="text-2xl xl:text-3xl font-bold leading-tight mb-2 login-animate-fade-up login-gradient-text" style={{ animationDelay: "0.2s" }}>
            AI-Powered<br />
            <Typewriter words={["Field Proof", "Scheduling", "Tracking", "Automation"]} />
          </h1>
          <p className="text-white/70 text-sm login-animate-fade-up" style={{ animationDelay: "0.3s" }}>
            Streamline your signage installation workflow from scheduling to completion.
          </p>
        </div>

        <div className="relative z-10 space-y-1.5 my-4">
          {features.map((f, i) => (
            <div
              key={f.title}
              className="flex items-start gap-3 login-animate-slide-right login-feature-item"
              style={{ animationDelay: `${0.4 + i * 0.1}s` }}
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 backdrop-blur-sm flex-shrink-0">
                <f.icon className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-semibold text-xs">{f.title}</h3>
                <p className="text-white/50 text-[11px] leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative z-10 login-animate-fade-in" style={{ animationDelay: "0.85s" }}>
          <div className="flex items-center justify-between gap-1 bg-white/10 backdrop-blur-sm rounded-xl p-2.5 mb-3">
            {stats.map((s, i) => (
              <div key={s.label} className={`flex-1 text-center login-stat-item cursor-default ${i < stats.length - 1 ? "border-r border-white/10" : ""}`}>
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <s.icon className="h-3 w-3 text-white/60" />
                  <span className="text-sm font-bold"><AnimatedCounter value={s.value} /></span>
                </div>
                <p className="text-[9px] text-white/40 uppercase tracking-wider">{s.label}</p>
              </div>
            ))}
          </div>

        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-gradient-to-br from-background via-background to-accent/20 relative overflow-y-auto">
        <div className="absolute top-4 right-4 z-20 login-animate-fade-in" style={{ animationDelay: "0.8s" }}>
          <ThemeToggle />
        </div>

        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-primary/5 blur-3xl login-bg-orb-1" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-primary/3 blur-3xl login-bg-orb-2" />
        </div>

        <MouseSpotlight />

        <div className="w-full max-w-md relative z-10">
          <div className="lg:hidden flex flex-col items-center mb-5">
            <div className="login-animate-fade-up">
              <img
                src={installiqLogo}
                alt="InstalliQ.ai"
                className="h-20 sm:h-24 object-contain rounded-lg mb-2 login-animate-float"
              />
            </div>
          </div>

          {!showFaceLogin
            ? renderLoginForm()
            : renderFaceLogin()
          }

          <div className="flex items-center justify-center gap-3 mt-4 text-xs text-muted-foreground login-animate-fade-in" style={{ animationDelay: "0.6s" }}>
            <a href="/privacy-policy.html" className="hover:text-primary transition-colors" data-testid="link-privacy-policy">Privacy Policy</a>
            <span>·</span>
            <a href="/terms-and-conditions.html" className="hover:text-primary transition-colors" data-testid="link-terms-conditions">Terms & Conditions</a>
          </div>

          <p className="hidden lg:block text-center text-xs text-muted-foreground mt-2 login-animate-fade-in" style={{ animationDelay: "0.7s" }}>
            Powered by InstalliQ.ai — AI-Powered Field Proof
          </p>
        </div>
      </div>
    </div>
  );
}
