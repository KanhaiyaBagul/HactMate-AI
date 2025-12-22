"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import {
  getProject,
  updateProjectIdea,
  addTask,
  updateTask,
  deleteTask,
  sendMessage,
  updateDemoMode,
  subscribeToProject,
  subscribeToTasks,
  subscribeToMessages,
  getProjectMembers,
} from "@/lib/firestore"
import type { Project, Task, ChatMessage, IdeaAnalysis, ProjectMember } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import {
  ArrowLeft,
  Lightbulb,
  CheckSquare,
  MessageCircle,
  Users,
  Loader2,
  Plus,
  Trash2,
  Sparkles,
  Send,
  Clock,
  AlertTriangle,
} from "lucide-react"

interface RetryState {
  isRetrying: boolean
  retryAfter: number
  action: string | null
}

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const { toast } = useToast()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [ideaInput, setIdeaInput] = useState("")
  const [isAnalyzingIdea, setIsAnalyzingIdea] = useState(false)
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false)

  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskDescription, setNewTaskDescription] = useState("")
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false)

  const [chatInput, setChatInput] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [retryState, setRetryState] = useState<RetryState>({
    isRetrying: false,
    retryAfter: 0,
    action: null,
  })
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (retryState.retryAfter > 0) {
      retryTimerRef.current = setInterval(() => {
        setRetryState((prev) => {
          if (prev.retryAfter <= 1) {
            return { isRetrying: false, retryAfter: 0, action: null }
          }
          return { ...prev, retryAfter: prev.retryAfter - 1 }
        })
      }, 1000)
    }
    return () => {
      if (retryTimerRef.current) clearInterval(retryTimerRef.current)
    }
  }, [retryState.retryAfter > 0])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Load project data
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      router.push("/")
      return
    }

    let mounted = true

    const loadProject = async () => {
      try {
        const projectData = await getProject(projectId)
        if (!mounted) return

        if (!projectData) {
          setError("Project not found")
          setLoading(false)
          return
        }

        setProject(projectData)
        setLoading(false)

        // Set up subscriptions after initial load
        setTimeout(() => {
          if (!mounted) return

          const unsubProject = subscribeToProject(projectId, (p) => {
            if (mounted && p) setProject(p)
          })

          const unsubTasks = subscribeToTasks(projectId, (t) => {
            if (mounted) setTasks(t)
          })

          const unsubMessages = subscribeToMessages(projectId, (m) => {
            if (mounted) setMessages(m)
          })

          return () => {
            unsubProject()
            unsubTasks()
            unsubMessages()
          }
        }, 300)
      } catch (err: any) {
        if (mounted) {
          setError(err.message || "Failed to load project")
          setLoading(false)
        }
      }
    }

    loadProject()

    return () => {
      mounted = false
    }
  }, [projectId, user, authLoading, router])

  // Load members when project changes
  useEffect(() => {
    if (project?.members) {
      getProjectMembers(project.members).then(setMembers)
    }
  }, [project?.members])

  const callApiWithRetry = async (action: string, apiCall: () => Promise<Response>): Promise<any> => {
    const response = await apiCall()
    const data = await response.json()

    if (response.status === 429 && data.retryAfter) {
      setRetryState({
        isRetrying: true,
        retryAfter: data.retryAfter,
        action,
      })
      throw new Error(`Rate limited. Retry in ${data.retryAfter}s`)
    }

    if (data.error) throw new Error(data.error)
    return data
  }

  const handleAnalyzeIdea = async () => {
    if (!ideaInput.trim() || !project) return
    if (retryState.isRetrying) return

    setIsAnalyzingIdea(true)
    try {
      const data = await callApiWithRetry("analyze", () =>
        fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "analyze_idea",
            data: {
              idea: ideaInput,
              duration: project.duration,
            },
          }),
        }),
      )

      const analysis: IdeaAnalysis = JSON.parse(data.result)
      await updateProjectIdea(projectId, analysis)
      setProject((prev) => (prev ? { ...prev, idea: analysis } : prev))

      toast({
        title: "Idea analyzed!",
        description: "Your project plan is ready.",
      })
      setIdeaInput("")
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsAnalyzingIdea(false)
    }
  }

  const handleGenerateTasks = async () => {
    if (!project?.idea?.features?.length) return
    if (retryState.isRetrying) return

    setIsGeneratingTasks(true)
    try {
      const data = await callApiWithRetry("tasks", () =>
        fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_tasks",
            data: {
              features: project.idea.features,
              projectName: project.name,
              duration: project.duration,
            },
          }),
        }),
      )

      const generatedTasks = JSON.parse(data.result)
      for (const task of generatedTasks) {
        await addTask({
          project_id: projectId,
          title: task.title,
          description: task.description || "",
          status: "todo",
          effort: task.effort || "Medium",
        })
      }

      toast({
        title: "Tasks generated!",
        description: `${generatedTasks.length} tasks added to your board.`,
      })
    } catch (error: any) {
      toast({
        title: "Task generation failed",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsGeneratingTasks(false)
    }
  }

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return

    setIsAddingTask(true)
    try {
      const newTask = await addTask({
        project_id: projectId,
        title: newTaskTitle,
        description: newTaskDescription,
        status: "todo",
        effort: "Medium",
      })

      if (newTask) {
        setTasks((prev) => [...prev, newTask])
      }

      setNewTaskTitle("")
      setNewTaskDescription("")
      setAddTaskDialogOpen(false)
      toast({ title: "Task added!" })
    } catch (error: any) {
      toast({
        title: "Failed to add task",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsAddingTask(false)
    }
  }

  const handleUpdateTaskStatus = async (taskId: string, status: Task["status"]) => {
    setTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, status } : t)))
    try {
      await updateTask(taskId, { status })
    } catch (error) {
      // Revert on error
      setTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, status: t.status } : t)))
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find((t) => t.task_id === taskId)
    setTasks((prev) => prev.filter((t) => t.task_id !== taskId))
    try {
      await deleteTask(taskId)
    } catch (error) {
      if (taskToDelete) {
        setTasks((prev) => [...prev, taskToDelete])
      }
    }
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim() || !user) return
    if (retryState.isRetrying) return

    setIsSendingMessage(true)
    const userMessage = chatInput
    setChatInput("")

    const tempUserMsg: ChatMessage = {
      message_id: `temp-${Date.now()}`,
      project_id: projectId,
      sender: user.uid,
      sender_type: "user",
      content: userMessage,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, tempUserMsg])

    try {
      await sendMessage({
        project_id: projectId,
        sender: user.uid,
        sender_type: "user",
        content: userMessage,
      })

      const context = project?.idea
        ? `Project: ${project.name}\nProblem: ${project.idea.problem_statement}\nFeatures: ${project.idea.features.join(", ")}`
        : `Project: ${project?.name || "Hackathon Project"}`

      const data = await callApiWithRetry("chat", () =>
        fetch("/api/gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "mentor_chat",
            data: {
              question: userMessage,
              context,
            },
          }),
        }),
      )

      const tempAiMsg: ChatMessage = {
        message_id: `temp-ai-${Date.now()}`,
        project_id: projectId,
        sender: "ai",
        sender_type: "ai",
        content: data.result,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, tempAiMsg])

      await sendMessage({
        project_id: projectId,
        sender: "ai",
        sender_type: "ai",
        content: data.result,
      })
    } catch (error: any) {
      toast({
        title: "Failed to get AI response",
        description: error.message,
        variant: "destructive",
      })
    } finally {
      setIsSendingMessage(false)
    }
  }

  const handleToggleDemoMode = async (enabled: boolean) => {
    setProject((prev) => (prev ? { ...prev, demo_mode: enabled } : prev))
    try {
      await updateDemoMode(projectId, enabled)
      toast({
        title: enabled ? "Demo mode enabled" : "Demo mode disabled",
        description: enabled ? "Anyone with the link can view this project" : "Project is now private",
      })
    } catch (error) {
      setProject((prev) => (prev ? { ...prev, demo_mode: !enabled } : prev))
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.push("/dashboard")}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!project) return null

  const todoTasks = tasks.filter((t) => t.status === "todo")
  const inProgressTasks = tasks.filter((t) => t.status === "in_progress")
  const doneTasks = tasks.filter((t) => t.status === "done")

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">{project.name}</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Badge variant="outline">{project.duration}</Badge>
                  <span>Code: {project.join_code}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {retryState.isRetrying && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-amber-600">Rate limited. Retry in {retryState.retryAfter}s</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Switch id="demo-mode" checked={project.demo_mode || false} onCheckedChange={handleToggleDemoMode} />
                <Label htmlFor="demo-mode" className="text-sm">
                  Demo Mode
                </Label>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="idea" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-lg">
            <TabsTrigger value="idea" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              <span className="hidden sm:inline">Idea</span>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Tasks</span>
            </TabsTrigger>
            <TabsTrigger value="mentor" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Mentor</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Team</span>
            </TabsTrigger>
          </TabsList>

          {/* Idea Tab */}
          <TabsContent value="idea" className="space-y-6">
            {!project.idea ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Describe Your Idea
                  </CardTitle>
                  <CardDescription>Tell us about your hackathon project and our AI will analyze it</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Textarea
                    placeholder="Describe your project idea in detail. What problem does it solve? Who is it for? What makes it unique?"
                    value={ideaInput}
                    onChange={(e) => setIdeaInput(e.target.value)}
                    rows={6}
                    className="resize-none"
                  />
                  <Button
                    onClick={handleAnalyzeIdea}
                    disabled={!ideaInput.trim() || isAnalyzingIdea || retryState.isRetrying}
                    className="w-full"
                  >
                    {isAnalyzingIdea ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Analyzing...
                      </>
                    ) : retryState.isRetrying ? (
                      <>
                        <Clock className="mr-2 h-4 w-4" />
                        Wait {retryState.retryAfter}s
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Analyze with AI
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Problem Statement</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">{project.idea.problem_statement}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Target Users</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {project.idea.target_users.map((user, i) => (
                        <Badge key={i} variant="secondary">
                          {user}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      Features
                      <Button
                        size="sm"
                        onClick={handleGenerateTasks}
                        disabled={isGeneratingTasks || retryState.isRetrying}
                      >
                        {isGeneratingTasks ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : retryState.isRetrying ? (
                          <>
                            <Clock className="mr-1 h-4 w-4" />
                            {retryState.retryAfter}s
                          </>
                        ) : (
                          <>
                            <Sparkles className="mr-1 h-4 w-4" />
                            Generate Tasks
                          </>
                        )}
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {project.idea.features.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckSquare className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Risks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {project.idea.risks.map((risk, i) => (
                        <li key={i} className="text-sm text-muted-foreground">
                          • {risk}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Suggested Tech Stack</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {project.idea.tech_stack_suggestions.map((tech, i) => (
                        <Badge key={i}>{tech}</Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Task Board</h2>
              <Dialog open={addTaskDialogOpen} onOpenChange={setAddTaskDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Task
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Task</DialogTitle>
                    <DialogDescription>Create a new task for your project</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <Input
                      placeholder="Task title"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                    />
                    <Textarea
                      placeholder="Task description (optional)"
                      value={newTaskDescription}
                      onChange={(e) => setNewTaskDescription(e.target.value)}
                      rows={3}
                    />
                    <Button onClick={handleAddTask} disabled={!newTaskTitle.trim() || isAddingTask} className="w-full">
                      {isAddingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Task"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {/* Todo Column */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-slate-400" />
                    To Do ({todoTasks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {todoTasks.map((task) => (
                    <TaskCard
                      key={task.task_id}
                      task={task}
                      onStatusChange={handleUpdateTaskStatus}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                  {todoTasks.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No tasks yet</p>
                  )}
                </CardContent>
              </Card>

              {/* In Progress Column */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                    In Progress ({inProgressTasks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {inProgressTasks.map((task) => (
                    <TaskCard
                      key={task.task_id}
                      task={task}
                      onStatusChange={handleUpdateTaskStatus}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                  {inProgressTasks.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No tasks in progress</p>
                  )}
                </CardContent>
              </Card>

              {/* Done Column */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    Done ({doneTasks.length})
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {doneTasks.map((task) => (
                    <TaskCard
                      key={task.task_id}
                      task={task}
                      onStatusChange={handleUpdateTaskStatus}
                      onDelete={handleDeleteTask}
                    />
                  ))}
                  {doneTasks.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">No completed tasks</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Mentor Tab */}
          <TabsContent value="mentor" className="space-y-6">
            <Card className="h-[600px] flex flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  AI Mentor Chat
                </CardTitle>
                <CardDescription>Get guidance on priorities, debugging, and presentation tips</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col overflow-hidden">
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-4">
                    {messages.length === 0 && (
                      <div className="text-center text-muted-foreground py-8">
                        <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Start a conversation with your AI mentor</p>
                        <p className="text-sm mt-2">Ask about priorities, technical challenges, or pitch preparation</p>
                      </div>
                    )}
                    {messages.map((msg) => (
                      <div
                        key={msg.message_id}
                        className={`flex ${msg.sender_type === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${
                            msg.sender_type === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                          }`}
                        >
                          <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
                <div className="flex gap-2 pt-4 border-t mt-4">
                  <Input
                    placeholder={retryState.isRetrying ? `Wait ${retryState.retryAfter}s...` : "Ask your AI mentor..."}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                    disabled={isSendingMessage || retryState.isRetrying}
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!chatInput.trim() || isSendingMessage || retryState.isRetrying}
                  >
                    {isSendingMessage ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : retryState.isRetrying ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>
                  Share code{" "}
                  <Badge variant="outline" className="ml-2">
                    {project.join_code}
                  </Badge>{" "}
                  to invite teammates
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {members.map((member) => (
                    <div key={member.user_id} className="flex items-center gap-3 p-3 rounded-lg border">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Users className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium">{member.name}</p>
                        <p className="text-sm text-muted-foreground">{member.email}</p>
                      </div>
                      {member.user_id === project.created_by && <Badge className="ml-auto">Owner</Badge>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Progress Overview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between text-sm">
                    <span>Tasks Completed</span>
                    <span className="font-medium">
                      {doneTasks.length} / {tasks.length}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: tasks.length ? `${(doneTasks.length / tasks.length) * 100}%` : "0%",
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

function TaskCard({
  task,
  onStatusChange,
  onDelete,
}: {
  task: Task
  onStatusChange: (id: string, status: Task["status"]) => void
  onDelete: (id: string) => void
}) {
  const effortColors = {
    Low: "bg-green-500/10 text-green-600",
    Medium: "bg-amber-500/10 text-amber-600",
    High: "bg-red-500/10 text-red-600",
  }

  return (
    <div className="p-3 bg-background border rounded-lg space-y-2">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{task.title}</p>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => onDelete(task.task_id)}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className={effortColors[task.effort as keyof typeof effortColors] || ""}>
          {task.effort}
        </Badge>
        <Select value={task.status} onValueChange={(value) => onStatusChange(task.task_id, value as Task["status"])}>
          <SelectTrigger className="h-7 w-28 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todo">To Do</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="done">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
