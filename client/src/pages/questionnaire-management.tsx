import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import {
  ClipboardList, Plus, Trash2, Edit, GripVertical, ChevronDown, ChevronRight,
  Loader2, Sparkles, Building2, Users, Wrench, Package, Clock, HelpCircle,
  Save, X, AlertTriangle, ArrowLeft, Eye, FileText, CheckCircle2
} from "lucide-react";

interface OnboardingQuestion {
  id: number;
  stepName: string;
  stepTitle: string;
  stepIcon: string;
  stepDescription: string | null;
  questionLabel: string;
  questionKey: string;
  questionType: string;
  options: string | null;
  placeholder: string | null;
  required: boolean | null;
  sortOrder: number;
  stepOrder: number;
  isActive: boolean | null;
}

const ICON_MAP: Record<string, any> = {
  Building2, Users, Wrench, Package, Clock, HelpCircle, ClipboardList
};

const QUESTION_TYPES = [
  { value: "text", label: "Text Input" },
  { value: "textarea", label: "Text Area" },
  { value: "radio", label: "Radio Buttons" },
  { value: "checkbox", label: "Checkboxes" },
  { value: "select", label: "Dropdown Select" },
  { value: "number", label: "Number Input" },
  { value: "file", label: "File Upload" },
];

const defaultQuestion = {
  stepName: "",
  stepTitle: "",
  stepIcon: "HelpCircle",
  stepDescription: "",
  questionLabel: "",
  questionKey: "",
  questionType: "text",
  options: "",
  placeholder: "",
  required: false,
  sortOrder: 0,
  stepOrder: 0,
  isActive: true,
};

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

export default function QuestionnaireManagementPage() {
  const { user } = useAuth();
  const params = useParams<{ ownerId?: string }>();
  const [, navigate] = useLocation();
  const isSuperAdmin = user?.role === "super_admin";
  const isOwner = user?.role === "admin";
  const viewingOwnerId = params?.ownerId ? parseInt(params.ownerId) : null;
  const isViewingOwnerAnswers = isSuperAdmin && viewingOwnerId !== null;
  const isOwnerSelfView = isOwner && !viewingOwnerId;
  const isManagementMode = isSuperAdmin && !viewingOwnerId;

  if (isManagementMode) {
    return <QuestionManagementView />;
  }

  if (isViewingOwnerAnswers) {
    return <OwnerAnswersView ownerId={viewingOwnerId} onBack={() => navigate("/admin")} />;
  }

  if (isOwnerSelfView) {
    return <OwnerAnswersView ownerId={user!.id} isSelf />;
  }

  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-muted-foreground">Access denied</p>
    </div>
  );
}

function OwnerAnswersView({ ownerId, onBack, isSelf }: { ownerId: number; onBack?: () => void; isSelf?: boolean }) {
  const { toast } = useToast();
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [initialExpanded, setInitialExpanded] = useState(false);
  const [editingAnswer, setEditingAnswer] = useState<{ key: string; value: string } | null>(null);
  const [editValue, setEditValue] = useState("");

  const { data: questions = [], isLoading: questionsLoading } = useQuery<OnboardingQuestion[]>({
    queryKey: ["/api/admin/onboarding-questions"],
  });

  const formQueryKey = isSelf ? ["/api/onboarding"] : ["/api/admin/onboarding-form", ownerId];
  const formQueryUrl = isSelf ? "/api/onboarding" : `/api/admin/onboarding-form/${ownerId}`;

  const { data: formData, isLoading: formLoading } = useQuery<any>({
    queryKey: formQueryKey,
    queryFn: async () => {
      const res = await fetch(formQueryUrl, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const form = formData?.form || null;
  const ownerName = isSelf ? "Your" : (formData?.user?.name || "Owner");

  const updateAnswerMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await apiRequest("POST", "/api/onboarding", { [key]: value });
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: formQueryKey });
      setEditingAnswer(null);
      toast({ title: "Answer Updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update answer", variant: "destructive" }),
  });

  useEffect(() => {
    if (!initialExpanded && questions.length > 0) {
      const allStepNames = new Set(questions.map(q => q.stepName));
      setExpandedSteps(allStepNames);
      setInitialExpanded(true);
    }
  }, [questions, initialExpanded]);

  const groupedSteps = useMemo(() => {
    const activeQuestions = questions.filter(q => q.isActive !== false);
    const groups: Record<string, { stepName: string; stepTitle: string; stepIcon: string; stepDescription: string; stepOrder: number; questions: OnboardingQuestion[] }> = {};
    activeQuestions.forEach(q => {
      if (!groups[q.stepName]) {
        groups[q.stepName] = {
          stepName: q.stepName,
          stepTitle: q.stepTitle,
          stepIcon: q.stepIcon,
          stepDescription: q.stepDescription || "",
          stepOrder: q.stepOrder,
          questions: [],
        };
      }
      groups[q.stepName].questions.push(q);
    });
    return Object.values(groups).sort((a, b) => a.stepOrder - b.stepOrder);
  }, [questions]);

  const getAnswer = (questionKey: string): string => {
    if (!form) return "";
    const snakeKey = camelToSnake(questionKey);
    const val = form[questionKey] ?? form[snakeKey] ?? "";
    if (Array.isArray(val)) return val.join(", ");
    return String(val || "");
  };

  const toggleStep = (stepName: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepName)) next.delete(stepName);
      else next.add(stepName);
      return next;
    });
  };

  if (questionsLoading || formLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={onBack} data-testid="button-back">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">
              {isSelf ? "My Questionnaire" : `${ownerName}'s Questionnaire`}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isSelf ? "View and edit your onboarding answers" : "View owner's onboarding questions and answers"}
            </p>
          </div>
        </div>
        {form?.completedAt && (
          <Badge variant="outline" className="text-xs gap-1">
            <CheckCircle2 className="h-3 w-3 text-green-500" />
            Completed
          </Badge>
        )}
      </div>

      {!form ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">No Questionnaire Submitted</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {isSelf ? "You haven't completed the onboarding questionnaire yet." : "This owner hasn't completed the onboarding questionnaire yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedSteps.map((step) => {
            const isExpanded = expandedSteps.has(step.stepName);
            const StepIcon = ICON_MAP[step.stepIcon] || HelpCircle;
            const answeredCount = step.questions.filter(q => {
              const ans = getAnswer(q.questionKey);
              return ans && ans.trim().length > 0;
            }).length;
            return (
              <Card key={step.stepName} data-testid={`card-step-${step.stepName}`}>
                <button
                  onClick={() => toggleStep(step.stepName)}
                  className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 sm:py-4 text-left hover:bg-muted/30 transition-colors"
                  data-testid={`button-toggle-step-${step.stepName}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <StepIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-semibold text-sm">{step.stepTitle}</h3>
                      <Badge variant="secondary" className="text-xs">{answeredCount}/{step.questions.length} answered</Badge>
                      <Badge variant="outline" className="text-xs">Step {step.stepOrder + 1}</Badge>
                    </div>
                    {step.stepDescription && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.stepDescription}</p>
                    )}
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 px-3 sm:px-5">
                    <div className="border-t pt-3 space-y-2">
                      {step.questions.sort((a, b) => a.sortOrder - b.sortOrder).map((q) => {
                        const answer = getAnswer(q.questionKey);
                        const isEditing = editingAnswer?.key === q.questionKey;
                        return (
                          <div
                            key={q.id}
                            className="p-3 rounded-lg border bg-background"
                            data-testid={`answer-row-${q.id}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-sm font-medium">{q.questionLabel}</span>
                                  {q.required && <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>}
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">{q.questionType}</Badge>
                                </div>
                                {isEditing ? (
                                  <div className="mt-2 space-y-2">
                                    {q.questionType === "textarea" ? (
                                      <Textarea
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        className="text-sm"
                                        rows={3}
                                        data-testid={`textarea-edit-${q.questionKey}`}
                                      />
                                    ) : q.questionType === "radio" || q.questionType === "select" ? (
                                      <Select value={editValue} onValueChange={setEditValue}>
                                        <SelectTrigger data-testid={`select-edit-${q.questionKey}`}>
                                          <SelectValue placeholder="Select..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {(q.options || "").split(",").map(opt => opt.trim()).filter(Boolean).map(opt => (
                                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    ) : (
                                      <Input
                                        value={editValue}
                                        onChange={(e) => setEditValue(e.target.value)}
                                        type={q.questionType === "number" ? "number" : "text"}
                                        className="text-sm"
                                        data-testid={`input-edit-${q.questionKey}`}
                                      />
                                    )}
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => updateAnswerMutation.mutate({ key: q.questionKey, value: editValue })}
                                        disabled={updateAnswerMutation.isPending}
                                        data-testid={`button-save-answer-${q.questionKey}`}
                                      >
                                        {updateAnswerMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                                        Save
                                      </Button>
                                      <Button size="sm" variant="outline" onClick={() => setEditingAnswer(null)} data-testid={`button-cancel-edit-${q.questionKey}`}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className={`text-sm mt-1 ${answer ? "text-foreground" : "text-muted-foreground italic"}`} data-testid={`text-answer-${q.questionKey}`}>
                                    {answer || "No answer provided"}
                                  </p>
                                )}
                              </div>
                              {isSelf && !isEditing && q.questionType !== "file" && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0"
                                  onClick={() => { setEditingAnswer({ key: q.questionKey, value: answer }); setEditValue(answer); }}
                                  data-testid={`button-edit-answer-${q.questionKey}`}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuestionManagementView() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editingQuestion, setEditingQuestion] = useState<OnboardingQuestion | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ ...defaultQuestion });
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [initialExpanded, setInitialExpanded] = useState(false);

  const { data: questions = [], isLoading } = useQuery<OnboardingQuestion[]>({
    queryKey: ["/api/admin/onboarding-questions"],
  });

  useEffect(() => {
    if (!initialExpanded && questions.length > 0) {
      const allStepNames = new Set(questions.map(q => q.stepName));
      setExpandedSteps(allStepNames);
      setInitialExpanded(true);
    }
  }, [questions, initialExpanded]);

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/onboarding-questions/seed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-questions"] });
      toast({ title: "Questions Seeded", description: `${data.seeded} default questions have been added.` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to seed questions", variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof defaultQuestion) => {
      const res = await apiRequest("POST", "/api/admin/onboarding-questions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-questions"] });
      setIsAddDialogOpen(false);
      setNewQuestion({ ...defaultQuestion });
      toast({ title: "Question Added" });
    },
    onError: () => toast({ title: "Error", description: "Failed to add question", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<OnboardingQuestion> }) => {
      const res = await apiRequest("PATCH", `/api/admin/onboarding-questions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-questions"] });
      setEditingQuestion(null);
      toast({ title: "Question Updated" });
    },
    onError: () => toast({ title: "Error", description: "Failed to update question", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/onboarding-questions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/onboarding-questions"] });
      toast({ title: "Question Deleted" });
    },
    onError: () => toast({ title: "Error", description: "Failed to delete question", variant: "destructive" }),
  });

  const groupedSteps = useMemo(() => {
    const groups: Record<string, { stepName: string; stepTitle: string; stepIcon: string; stepDescription: string; stepOrder: number; questions: OnboardingQuestion[] }> = {};
    questions.forEach(q => {
      if (!groups[q.stepName]) {
        groups[q.stepName] = {
          stepName: q.stepName,
          stepTitle: q.stepTitle,
          stepIcon: q.stepIcon,
          stepDescription: q.stepDescription || "",
          stepOrder: q.stepOrder,
          questions: [],
        };
      }
      groups[q.stepName].questions.push(q);
    });
    return Object.values(groups).sort((a, b) => a.stepOrder - b.stepOrder);
  }, [questions]);

  const toggleStep = (stepName: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(stepName)) next.delete(stepName);
      else next.add(stepName);
      return next;
    });
  };

  const handleAddFromStep = (step: typeof groupedSteps[0]) => {
    setNewQuestion({
      ...defaultQuestion,
      stepName: step.stepName,
      stepTitle: step.stepTitle,
      stepIcon: step.stepIcon,
      stepDescription: step.stepDescription,
      stepOrder: step.stepOrder,
      sortOrder: step.questions.length,
    });
    setIsAddDialogOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold" data-testid="text-page-title">Questionnaire Setup</h1>
            <p className="text-sm text-muted-foreground">Manage onboarding questions for new owners</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {questions.length === 0 && (
            <Button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              variant="outline"
              data-testid="button-seed-questions"
            >
              {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              Load Default Questions
            </Button>
          )}
          <Button onClick={() => { setNewQuestion({ ...defaultQuestion }); setIsAddDialogOpen(true); }} data-testid="button-add-question">
            <Plus className="h-4 w-4 mr-1.5" />
            Add Question
          </Button>
        </div>
      </div>

      {questions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">No Questions Configured</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md mb-4">
              No onboarding questions have been set up yet. Click "Load Default Questions" to populate the questionnaire with the standard set of questions, or add questions manually.
            </p>
            <Button onClick={() => seedMutation.mutate()} disabled={seedMutation.isPending} data-testid="button-seed-empty">
              {seedMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
              Load Default Questions
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupedSteps.map((step) => {
            const isExpanded = expandedSteps.has(step.stepName);
            const StepIcon = ICON_MAP[step.stepIcon] || HelpCircle;
            const activeCount = step.questions.filter(q => q.isActive).length;
            return (
              <Card key={step.stepName} data-testid={`card-step-${step.stepName}`}>
                <button
                  onClick={() => toggleStep(step.stepName)}
                  className="w-full flex items-center gap-3 px-3 sm:px-5 py-3 sm:py-4 text-left hover:bg-muted/30 transition-colors"
                  data-testid={`button-toggle-step-${step.stepName}`}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 shrink-0">
                    <StepIcon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="font-semibold text-sm">{step.stepTitle}</h3>
                      <Badge variant="secondary" className="text-xs">{activeCount} question{activeCount !== 1 ? "s" : ""}</Badge>
                      <Badge variant="outline" className="text-xs">Step {step.stepOrder + 1}</Badge>
                    </div>
                    {step.stepDescription && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{step.stepDescription}</p>
                    )}
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                </button>

                {isExpanded && (
                  <CardContent className="pt-0 pb-4 px-3 sm:px-5">
                    <div className="border-t pt-3 space-y-2">
                      {step.questions.sort((a, b) => a.sortOrder - b.sortOrder).map((q) => (
                        <div
                          key={q.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border ${q.isActive ? "bg-background" : "bg-muted/30 opacity-60"}`}
                          data-testid={`question-row-${q.id}`}
                        >
                          <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{q.questionLabel}</span>
                              {q.required && <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>}
                              {!q.isActive && <Badge variant="secondary" className="text-[10px] px-1 py-0">Inactive</Badge>}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{q.questionType}</Badge>
                              <span className="text-xs text-muted-foreground">Key: {q.questionKey}</span>
                              {q.options && <span className="text-xs text-muted-foreground truncate max-w-48">Options: {q.options}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => setEditingQuestion(q)}
                              data-testid={`button-edit-question-${q.id}`}
                            >
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Delete this question?")) deleteMutation.mutate(q.id);
                              }}
                              data-testid={`button-delete-question-${q.id}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full mt-2 border border-dashed"
                        onClick={() => handleAddFromStep(step)}
                        data-testid={`button-add-to-step-${step.stepName}`}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                        Add Question to {step.stepTitle}
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Question</DialogTitle>
          </DialogHeader>
          <QuestionForm
            question={newQuestion}
            onChange={setNewQuestion}
            existingSteps={groupedSteps}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(newQuestion)}
              disabled={createMutation.isPending || !newQuestion.questionLabel || !newQuestion.questionKey || !newQuestion.stepName}
              data-testid="button-save-new-question"
            >
              {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Add Question
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingQuestion} onOpenChange={(open) => { if (!open) setEditingQuestion(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Question</DialogTitle>
          </DialogHeader>
          {editingQuestion && (
            <QuestionForm
              question={editingQuestion}
              onChange={(updated) => setEditingQuestion({ ...editingQuestion, ...updated })}
              existingSteps={groupedSteps}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingQuestion(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (editingQuestion) {
                  const { id, createdAt, ...data } = editingQuestion as any;
                  updateMutation.mutate({ id: editingQuestion.id, data });
                }
              }}
              disabled={updateMutation.isPending}
              data-testid="button-save-edit-question"
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function QuestionForm({
  question,
  onChange,
  existingSteps,
}: {
  question: any;
  onChange: (q: any) => void;
  existingSteps: Array<{ stepName: string; stepTitle: string; stepIcon: string; stepDescription: string; stepOrder: number }>;
}) {
  const [useExistingStep, setUseExistingStep] = useState(
    existingSteps.some(s => s.stepName === question.stepName)
  );

  const handleStepSelect = (stepName: string) => {
    const step = existingSteps.find(s => s.stepName === stepName);
    if (step) {
      onChange({
        ...question,
        stepName: step.stepName,
        stepTitle: step.stepTitle,
        stepIcon: step.stepIcon,
        stepDescription: step.stepDescription,
        stepOrder: step.stepOrder,
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-sm font-medium">Step Assignment</Label>
        <div className="flex items-center gap-3 mb-2">
          <Button
            variant={useExistingStep ? "default" : "outline"}
            size="sm"
            onClick={() => setUseExistingStep(true)}
            type="button"
          >
            Existing Step
          </Button>
          <Button
            variant={!useExistingStep ? "default" : "outline"}
            size="sm"
            onClick={() => setUseExistingStep(false)}
            type="button"
          >
            New Step
          </Button>
        </div>
        {useExistingStep && existingSteps.length > 0 ? (
          <Select value={question.stepName} onValueChange={handleStepSelect}>
            <SelectTrigger data-testid="select-step">
              <SelectValue placeholder="Select a step" />
            </SelectTrigger>
            <SelectContent>
              {existingSteps.map(s => (
                <SelectItem key={s.stepName} value={s.stepName}>{s.stepTitle} (Step {s.stepOrder + 1})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="space-y-2">
            <Input
              placeholder="Step name (e.g., safety_protocols)"
              value={question.stepName}
              onChange={e => onChange({ ...question, stepName: e.target.value })}
              data-testid="input-step-name"
            />
            <Input
              placeholder="Step title (e.g., Safety Protocols)"
              value={question.stepTitle}
              onChange={e => onChange({ ...question, stepTitle: e.target.value })}
              data-testid="input-step-title"
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs text-muted-foreground">Icon</Label>
                <Select value={question.stepIcon} onValueChange={v => onChange({ ...question, stepIcon: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.keys(ICON_MAP).map(icon => (
                      <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Step Order</Label>
                <Input
                  type="number"
                  value={question.stepOrder}
                  onChange={e => onChange({ ...question, stepOrder: parseInt(e.target.value) || 0 })}
                  data-testid="input-step-order"
                />
              </div>
            </div>
            <Input
              placeholder="Step description"
              value={question.stepDescription || ""}
              onChange={e => onChange({ ...question, stepDescription: e.target.value })}
              data-testid="input-step-description"
            />
          </div>
        )}
      </div>

      <div className="border-t pt-4 space-y-3">
        <div>
          <Label className="text-sm font-medium">Question Label</Label>
          <Input
            placeholder="e.g., What is your business address?"
            value={question.questionLabel}
            onChange={e => onChange({ ...question, questionLabel: e.target.value })}
            data-testid="input-question-label"
          />
        </div>

        <div>
          <Label className="text-sm font-medium">Question Key</Label>
          <Input
            placeholder="e.g., businessAddress (unique identifier)"
            value={question.questionKey}
            onChange={e => onChange({ ...question, questionKey: e.target.value })}
            data-testid="input-question-key"
          />
          <p className="text-xs text-muted-foreground mt-1">Unique key used to store the answer. Use camelCase with no spaces.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-sm font-medium">Question Type</Label>
            <Select value={question.questionType} onValueChange={v => onChange({ ...question, questionType: v })}>
              <SelectTrigger data-testid="select-question-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUESTION_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm font-medium">Sort Order</Label>
            <Input
              type="number"
              value={question.sortOrder}
              onChange={e => onChange({ ...question, sortOrder: parseInt(e.target.value) || 0 })}
              data-testid="input-sort-order"
            />
          </div>
        </div>

        {(question.questionType === "radio" || question.questionType === "checkbox" || question.questionType === "select") && (
          <div>
            <Label className="text-sm font-medium">Options (comma-separated)</Label>
            <Input
              placeholder="e.g., Yes,No or Option 1,Option 2,Option 3"
              value={question.options || ""}
              onChange={e => onChange({ ...question, options: e.target.value })}
              data-testid="input-options"
            />
          </div>
        )}

        <div>
          <Label className="text-sm font-medium">Placeholder</Label>
          <Input
            placeholder="Placeholder text for the input"
            value={question.placeholder || ""}
            onChange={e => onChange({ ...question, placeholder: e.target.value })}
            data-testid="input-placeholder"
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Switch
              checked={question.required || false}
              onCheckedChange={v => onChange({ ...question, required: v })}
              data-testid="switch-required"
            />
            <Label className="text-sm">Required</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={question.isActive !== false}
              onCheckedChange={v => onChange({ ...question, isActive: v })}
              data-testid="switch-active"
            />
            <Label className="text-sm">Active</Label>
          </div>
        </div>
      </div>
    </div>
  );
}
