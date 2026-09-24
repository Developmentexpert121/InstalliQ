import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, Link } from "wouter";
import { Building2, Loader2, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
const installiqLogo = "/installiq-logo.png";
import fastsignsLogo from "@assets/FASTSIGNS-MYS-Logo_1771624193112.jpg";

const resetPasswordSchema = z.object({
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*(),.?":{}|<>]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

function getPasswordStrength(password: string): { strength: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score++;

  if (score <= 2) return { strength: 25, label: "Weak", color: "bg-red-500" };
  if (score <= 3) return { strength: 50, label: "Fair", color: "bg-orange-500" };
  if (score <= 4) return { strength: 75, label: "Good", color: "bg-yellow-500" };
  return { strength: 100, label: "Strong", color: "bg-green-500" };
}

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isLoading, setIsLoading] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Get token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get("token");

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  const password = form.watch("password");
  const passwordStrength = getPasswordStrength(password);

  const passwordChecks = [
    { label: "At least 8 characters", valid: password.length >= 8 },
    { label: "At least one uppercase letter", valid: /[A-Z]/.test(password) },
    { label: "At least one number", valid: /[0-9]/.test(password) },
    { label: "At least one special character", valid: /[!@#$%^&*(),.?":{}|<>]/.test(password) },
  ];

  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setTokenError("No reset token provided");
        setIsValidating(false);
        return;
      }

      try {
        const response = await fetch(`/api/auth/validate-reset-token?token=${token}`);
        const data = await response.json();
        
        if (data.valid) {
          setTokenValid(true);
        } else {
          setTokenError(data.error || "Invalid or expired reset link");
        }
      } catch (error) {
        setTokenError("Failed to validate reset link");
      } finally {
        setIsValidating(false);
      }
    }

    validateToken();
  }, [token]);

  async function onSubmit(data: ResetPasswordFormData) {
    if (!token) return;
    
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", {
        token,
        password: data.password,
      });
      setResetSuccess(true);
      toast({
        title: "Password reset successful",
        description: "You can now sign in with your new password.",
      });
    } catch (error) {
      toast({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/20 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img 
            src={installiqLogo} 
            alt="InstalliQ.ai" 
            className="h-28 object-contain rounded-lg mb-3"
          />
          <img 
            src={fastsignsLogo} 
            alt="FASTSIGNS" 
            className="h-10 object-contain mb-2"
          />
          <p className="text-sm text-muted-foreground">Exclusively for FASTSIGNS of Waltham</p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">
              {resetSuccess ? "Password Reset" : "Create New Password"}
            </CardTitle>
            <CardDescription className="text-center">
              {resetSuccess 
                ? "Your password has been successfully updated" 
                : "Enter your new password below"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isValidating ? (
              <div className="flex flex-col items-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="mt-4 text-muted-foreground">Validating reset link...</p>
              </div>
            ) : tokenError ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                    <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="font-medium">Invalid Reset Link</p>
                    <p className="text-sm text-muted-foreground mt-1">{tokenError}</p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/forgot-password")}
                  data-testid="button-request-new"
                >
                  Request New Reset Link
                </Button>
              </div>
            ) : resetSuccess ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Password Updated!</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Your password has been successfully reset. You can now sign in with your new password.
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setLocation("/login")}
                  data-testid="button-go-to-login"
                >
                  Go to Login
                </Button>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showPassword ? "text" : "password"}
                              placeholder="Enter new password"
                              autoComplete="new-password"
                              data-testid="input-password"
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => setShowPassword(!showPassword)}
                              data-testid="button-toggle-password"
                            >
                              {showPassword ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {password && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Password strength</span>
                          <span className={`font-medium ${
                            passwordStrength.label === "Weak" ? "text-red-500" :
                            passwordStrength.label === "Fair" ? "text-orange-500" :
                            passwordStrength.label === "Good" ? "text-yellow-500" :
                            "text-green-500"
                          }`}>
                            {passwordStrength.label}
                          </span>
                        </div>
                        <Progress 
                          value={passwordStrength.strength} 
                          className="h-2"
                        />
                      </div>
                      
                      <div className="space-y-1">
                        {passwordChecks.map((check, index) => (
                          <div 
                            key={index} 
                            className={`flex items-center gap-2 text-sm ${
                              check.valid ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                            }`}
                          >
                            {check.valid ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <AlertCircle className="w-4 h-4" />
                            )}
                            {check.label}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Confirm New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              type={showConfirmPassword ? "text" : "password"}
                              placeholder="Confirm new password"
                              autoComplete="new-password"
                              data-testid="input-confirm-password"
                              {...field}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              data-testid="button-toggle-confirm-password"
                            >
                              {showConfirmPassword ? (
                                <EyeOff className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                    data-testid="button-reset-password"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Reset Password
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <div className="mt-8 flex flex-col items-center text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            <span>FASTSIGNS of Waltham</span>
          </div>
          <span className="text-xs mt-1">922 Main Street, Waltham, MA</span>
        </div>
      </div>
    </div>
  );
}
