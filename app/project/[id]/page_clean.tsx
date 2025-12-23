"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from "@dnd-kit/core"
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
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

  // Core state
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Drag and drop state
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const sensors = useSensors(useSensor(PointerSensor))

  // UI state
  const [ideaInput, setIdeaInput] = useState("")
  const [isAnalyzingIdea, setIsAnalyzingIdea] = useState(false)
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false)

  // Task creation state
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskDescription, setNewTaskDescription] = useState("")
  const [newTaskEffort, setNewTaskEffort] = useState<"Low" | "Medium" | "High">("Medium")
  const [newTaskAssignee, setNewTaskAssignee] = useState<string | null>(null)
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false)

  // Chat state
  const [chatInput, setChatInput] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)

  // Retry state
  const [retryState, setRetryState] = useState<RetryState>({
    isRetrying: false,
    retryAfter: 0,
    action: null,
  })

  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Retry timer effect
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

        // Load project members
        if (projectData.members && projectData.members.length > 0) {
          try {
            const projectMembers = await getProjectMembers(projectData.members)
            if (mounted) setMembers(projectMembers)
          } catch (err) {
            console.error("Failed to load members:", err)
          }
        }

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

  // API retry helper
  const callApiWithRetry = async (action: string, apiCall: () => Promise<Response>) => {
    const response = await apiCall()
    const data = await response.json()

    if (response.status === 429) {
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

  // Idea analysis handler
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

      let analysis: IdeaAnalysis
      try {
        analysis = JSON.parse(data.result)
      } catch (parseError) {
        console.error("JSON parsing failed:", data.result)
        throw new Error("AI returned invalid response format. Please try again.")
      }
      
      // Validate required fields
      if (!analysis.problem_statement || !Array.isArray(analysis.target_users)) {
        throw new Error("Incomplete analysis received. Please try again.")
      }
      
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

  // Task generation handler
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
              features: project.idea.features || [],
              projectName: project.name,
              duration: project.duration,
            },
          }),
        }),
      )

      let generatedTasks
      try {
        generatedTasks = JSON.parse(data.result)
      } catch (parseError) {
        console.error("JSON parsing failed:", data.result)
        throw new Error("AI returned invalid response format. Please try again.")
      }
      
      // Validate the response structure
      if (!Array.isArray(generatedTasks)) {
        throw new Error("Invalid response format from AI")
      }

      if (generatedTasks.length === 0) {
        throw new Error("No tasks were generated")
      }

      let successCount = 0
      for (const task of generatedTasks) {
        try {
          await addTask({
            project_id: projectId,
            title: task.title || "Untitled Task",
            description: task.description || "",
            status: "ToDo",
            effort: task.effort || "Medium",
            assigned_to: null,
          })
          successCount++
        } catch (taskError) {
          console.error("Failed to add task:", task.title, taskError)
        }
      }

      if (successCount > 0) {
        toast({
          title: "Tasks generated!",
          description: `${successCount} tasks added to your board.`,
        })
      } else {
        throw new Error("Failed to add any tasks to the board")
      }
    } catch (error: any) {
      console.error("Task generation error:", error)
      toast({
        title: "Task generation failed",
        description: error.message || "Please try again in a moment.",
        variant: "destructive",
      })
    } finally {
      setIsGeneratingTasks(false)
    }
  }

  // Task management handlers
  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return

    setIsAddingTask(true)
    try {
      const newTask = await addTask({
        project_id: projectId,
        title: newTaskTitle,
        description: newTaskDescription,
        status: "ToDo",
        effort: newTaskEffort,
        assigned_to: newTaskAssignee,
      })

      if (newTask) {
        setTasks((prev) => [...prev, newTask])
      }

      setNewTaskTitle("")
      setNewTaskDescription("")
      setNewTaskEffort("Medium")
      setNewTaskAssignee(null)
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
      const originalTask = tasks.find((t) => t.task_id === taskId)
      if (originalTask) {
        setTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, status: originalTask.status } : t)))
      }
    }
  }

  const handleAssignTask = async (taskId: string, assignedTo: string | null) => {
    setTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, assigned_to: assignedTo } : t)))
    try {
      await updateTask(taskId, { assigned_to: assignedTo })
      toast({ title: assignedTo ? "Task assigned!" : "Task unassigned!" })
    } catch (error) {
      // Revert on error
      const originalTask = tasks.find((t) => t.task_id === taskId)
      if (originalTask) {
        setTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, assigned_to: originalTask.assigned_to } : t)))
      }
      toast({
        title: "Failed to update assignment",
        variant: "destructive",
      })
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    const taskToDelete = tasks.find((t) => t.task_id === taskId)
    setTasks((prev) => prev.filter((t) => t.task_id !== taskId))
    try {
      await deleteTask(taskId)
      toast({ title: "Task deleted!" })
    } catch (error) {
      if (taskToDelete) {
        setTasks((prev) => [...prev, taskToDelete])
      }
      toast({
        title: "Failed to delete task",
        variant: "destructive",
      })
    }
  }

  // Drag and drop handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    const task = tasks.find((t) => t.task_id === active.id)
    setActiveTask(task || null)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveTask(null)

    if (!over) return

    const taskId = active.id as string
    const newStatus = over.id as string

    // Map droppable IDs to status values
    const statusMap: Record<string, Task["status"]> = {
      "todo-column": "ToDo",
      "inprogress-column": "InProgress", 
      "done-column": "Done"
    }

    const mappedStatus = statusMap[newStatus]
    if (!mappedStatus) return

    const task = tasks.find((t) => t.task_id === taskId)
    if (task && task.status !== mappedStatus) {
      handleUpdateTaskStatus(taskId, mappedStatus)
    }
  }

  // Chat handler
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
        ? `Project: ${project.name}\nProblem: ${project.idea.problem_statement || "Not defined"}\nFeatures: ${(project.idea.features || []).join(", ")}`
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

  const todoTasks = tasks.filter((t) => t.status === "ToDo")
  const inProgressTasks = tasks.filter((t) => t.status === "InProgress")
  const doneTasks = tasks.filter((t) => t.status === "Done")

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
                <Switch
                  id="demo-mode"
                  checked={project.demo_mode}
                  onCheckedChange={handleToggleDemoMode}
                />
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
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
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
                      {project.idea.target_users?.map((user, i) => (
                        <Badge key={i} variant="secondary">
                          {user}
                        </Badge>
                      )) || <p className="text-muted-foreground">No target users defined</p>}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      Features
                      {project.idea.features && project.idea.features.length > 0 && (
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
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {project.idea.features?.map((feature, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckSquare className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      )) || <p className="text-muted-foreground">No features defined</p>}
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
                      {project.idea.risks?.map((risk, i) => (
                        <li key={i} className="text-sm text-muted-foreground">
                          • {risk}
                        </li>
                      )) || <p className="text-muted-foreground">No risks identified</p>}
                    </ul>
                  </CardContent>
                </Card>

                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle>Suggested Tech Stack</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {project.idea.tech_stack_suggestions?.map((tech, i) => (
                        <Badge key={i}>{tech}</Badge>
                      )) || <p className="text-muted-foreground">No tech stack suggestions</p>}
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
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Effort Level</Label>
                        <Select value={newTaskEffort} onValueChange={(value) => setNewTaskEffort(value as "Low" | "Medium" | "High")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label>Assign to</Label>
                        <Select value={newTaskAssignee || "unassigned"} onValueChange={(value) => setNewTaskAssignee(value === "unassigned" ? null : value)}>
                          <SelectTrigger>
                            <SelectValue>
                              {newTaskAssignee ? (
                                (() => {
                                  const member = members.find(m => m.user_id === newTaskAssignee)
                                  return member ? (
                                    <div className="flex items-center gap-2">
                                      <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                        {member.name.charAt(0).toUpperCase()}
                                      </div>
                                      <span>{member.name}</span>
                                    </div>
                                  ) : "Unassigned"
                                })()
                              ) : (
                                "Unassigned"
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unassigned">
                              <span className="text-muted-foreground">Unassigned</span>
                            </SelectItem>
                            {members.map((member) => (
                              <SelectItem key={member.user_id} value={member.user_id}>
                                <div className="flex items-center gap-2">
                                  <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                    {member.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span>{member.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <Button onClick={handleAddTask} disabled={!newTaskTitle.trim() || isAddingTask} className="w-full">
                      {isAddingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Task"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <DndContext
              sensors={sensors}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {/* Todo Column */}
                <DroppableColumn
                  id="todo-column"
                  title="To Do"
                  count={todoTasks.length}
                  color="bg-slate-400"
                >
                  <SortableContext items={todoTasks.map(t => t.task_id)} strategy={verticalListSortingStrategy}>
                    {todoTasks.map((task) => (
                      <TaskCard
                        key={task.task_id}
                        task={task}
                        onStatusChange={handleUpdateTaskStatus}
                        onDelete={handleDeleteTask}
                        onAssign={handleAssignTask}
                        members={members}
                      />
                    ))}
                    {todoTasks.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No tasks yet</p>
                    )}
                  </SortableContext>
                </DroppableColumn>

                {/* In Progress Column */}
                <DroppableColumn
                  id="inprogress-column"
                  title="In Progress"
                  count={inProgressTasks.length}
                  color="bg-blue-500"
                >
                  <SortableContext items={inProgressTasks.map(t => t.task_id)} strategy={verticalListSortingStrategy}>
                    {inProgressTasks.map((task) => (
                      <TaskCard
                        key={task.task_id}
                        task={task}
                        onStatusChange={handleUpdateTaskStatus}
                        onDelete={handleDeleteTask}
                        onAssign={handleAssignTask}
                        members={members}
                      />
                    ))}
                    {inProgressTasks.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No tasks in progress</p>
                    )}
                  </SortableContext>
                </DroppableColumn>

                {/* Done Column */}
                <DroppableColumn
                  id="done-column"
                  title="Done"
                  count={doneTasks.length}
                  color="bg-green-500"
                >
                  <SortableContext items={doneTasks.map(t => t.task_id)} strategy={verticalListSortingStrategy}>
                    {doneTasks.map((task) => (
                      <TaskCard
                        key={task.task_id}
                        task={task}
                        onStatusChange={handleUpdateTaskStatus}
                        onDelete={handleDeleteTask}
                        onAssign={handleAssignTask}
                        members={members}
                      />
                    ))}
                    {doneTasks.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">No completed tasks</p>
                    )}
                  </SortableContext>
                </DroppableColumn>
              </div>

              {/* Drag Overlay */}
              <DragOverlay>
                {activeTask ? (
                  <div className="p-3 bg-background border rounded-lg space-y-2 shadow-lg opacity-90">
                    <p className="text-sm font-medium">{activeTask.title}</p>
                    {activeTask.description && <p className="text-xs text-muted-foreground">{activeTask.description}</p>}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
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
                <div className="flex gap-2 pt-4 border-t">
                  <Input
                    placeholder="Ask your AI mentor anything..."
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
                  {members.length > 0 ? (
                    members.map((member) => {
                      const assignedTasks = tasks.filter(t => t.assigned_to === member.user_id)
                      const completedTasks = assignedTasks.filter(t => t.status === "Done")
                      
                      return (
                        <div key={member.user_id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium">{member.name}</p>
                            <p className="text-sm text-muted-foreground">{member.email}</p>
                            <div className="flex items-center gap-4 mt-1">
                              <span className="text-xs text-muted-foreground">
                                {assignedTasks.length} tasks assigned
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {completedTasks.length} completed
                              </span>
                              {member.online_status && (
                                <div className="flex items-center gap-1">
                                  <div className="h-2 w-2 rounded-full bg-green-500" />
                                  <span className="text-xs text-green-600">Online</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {member.user_id === project.created_by && (
                            <Badge className="ml-auto">Owner</Badge>
                          )}
                        </div>
                      )
                    })
                  ) : (
                    <div className="text-center py-8">
                      <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">Loading team members...</p>
                    </div>
                  )}
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

function DroppableColumn({
  id,
  title,
  count,
  color,
  children,
}: {
  id: string
  title: string
  count: number
  color: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <Card className={`${isOver ? "ring-2 ring-primary" : ""} transition-all`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${color}`} />
          {title} ({count})
        </CardTitle>
      </CardHeader>
      <CardContent ref={setNodeRef} className="space-y-2 min-h-[200px]">
        {children}
      </CardContent>
    </Card>
  )
}

function TaskCard({
  task,
  onStatusChange,
  onDelete,
  onAssign,
  members,
}: {
  task: Task
  onStatusChange: (id: string, status: Task["status"]) => void
  onDelete: (id: string) => void
  onAssign: (id: string, assignedTo: string | null) => void
  members: ProjectMember[]
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.task_id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const effortColors = {
    Low: "bg-green-500/10 text-green-600",
    Medium: "bg-amber-500/10 text-amber-600",
    High: "bg-red-500/10 text-red-600",
  }

  const assignedMember = members.find(m => m.user_id === task.assigned_to)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 bg-background border rounded-lg space-y-2 cursor-grab active:cursor-grabbing ${
        isDragging ? "opacity-50 shadow-lg" : "hover:shadow-md"
      } transition-shadow`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">{task.title}</p>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6 shrink-0" 
          onClick={(e) => {
            e.stopPropagation()
            onDelete(task.task_id)
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      
      {task.description && <p className="text-xs text-muted-foreground">{task.description}</p>}
      
      <div className="flex items-center justify-between gap-2">
        <Badge variant="secondary" className={effortColors[task.effort as keyof typeof effortColors] || ""}>
          {task.effort}
        </Badge>
        
        <Select 
          value={task.status} 
          onValueChange={(value) => {
            onStatusChange(task.task_id, value as Task["status"])
          }}
        >
          <SelectTrigger 
            className="h-7 w-28 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ToDo">To Do</SelectItem>
            <SelectItem value="InProgress">In Progress</SelectItem>
            <SelectItem value="Done">Done</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Member Assignment */}
      <div className="flex items-center justify-between gap-2 pt-1 border-t">
        <span className="text-xs text-muted-foreground">Assigned to:</span>
        <Select 
          value={task.assigned_to || "unassigned"} 
          onValueChange={(value) => {
            const assignedTo = value === "unassigned" ? null : value
            onAssign(task.task_id, assignedTo)
          }}
        >
          <SelectTrigger 
            className="h-7 w-32 text-xs"
            onClick={(e) => e.stopPropagation()}
          >
            <SelectValue>
              {assignedMember ? (
                <div className="flex items-center gap-1">
                  <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {assignedMember.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate">{assignedMember.name}</span>
                </div>
              ) : (
                "Unassigned"
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="unassigned">
              <span className="text-muted-foreground">Unassigned</span>
            </SelectItem>
            {members.map((member) => (
              <SelectItem key={member.user_id} value={member.user_id}>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <span>{member.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}