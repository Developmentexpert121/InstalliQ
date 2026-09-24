import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import { Building2, Loader2, User, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
const installiqLogo = "/installiq-logo.png";
import fastsignsLogo from "@assets/FASTSIGNS-MYS-Logo_1771624193112.jpg";

const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, "Please enter your email or username"),
});

type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      identifier: "",
    },
  });

  const identifierValue = form.watch("identifier");
  const isValidInput = identifierValue.trim().length > 0;

  async function onSubmit(data: ForgotPasswordFormData) {
    setIsLoading(true);
    try {
      await apiRequest("POST", "/api/auth/request-password-reset", data);
      setEmailSent(true);
      toast({
        title: "Reset link sent",
        description: "If an account exists, you will receive a password reset link at your registered email.",
      });
    } catch (error) {
      toast({
        title: "Request failed",
        description: error instanceof Error ? error.message : "Please try again later.",
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
            <CardTitle className="text-2xl text-center">Reset Password</CardTitle>
            <CardDescription className="text-center">
              {emailSent 
                ? "Check your email for the reset link" 
                : "Enter your email or username to receive a password reset link"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emailSent ? (
              <div className="space-y-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Email sent!</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      If an account exists with the email you provided, you will receive a password reset link shortly.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground text-center">
                    Didn't receive the email? Check your spam folder or try again.
                  </p>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setEmailSent(false)}
                    data-testid="button-try-again"
                  >
                    Try again
                  </Button>
                </div>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="identifier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email or Username</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                              placeholder="Enter your email or username"
                              type="text"
                              autoComplete="username"
                              className="pl-10"
                              data-testid="input-identifier"
                              {...field}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading || !isValidInput}
                    data-testid="button-send-reset"
                  >
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Send Reset Link
                  </Button>
                </form>
              </Form>
            )}

            <div className="mt-4 text-center">
              <Link 
                href="/login" 
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                data-testid="link-back-to-login"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to login
              </Link>
            </div>
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
