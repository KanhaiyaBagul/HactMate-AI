"use client"

import { useState, useEffect, useRef, useMemo } from "react"
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
  updateProjectUrls,
  subscribeToProject,
  subscribeToTasks,
  subscribeToMessages,
  getProjectMembers,
  uploadResource,
  subscribeToResources,
  addActivity,
  subscribeToActivities,
  createNotification,
  subscribeToNotifications,
  markNotificationRead,
  deleteProject,
  deleteResource,
  removeMemberFromProject,
} from "@/lib/firestore"
import type { Project, Task, ChatMessage, IdeaAnalysis, ProjectMember, TeamAnalytics, SharedResource, LiveActivity, TeamNotification } from "@/lib/types"
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
import { GithubHistory } from "@/components/github-history"
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
  BarChart3,
  Timer,
  Target,
  TrendingUp,
  Github,
  Calendar,
  CalendarDays,
  Coffee,
  Moon,
  Utensils,
  Bell,
  Settings,
  Play,
  Pause,
  Copy,
  Check,
  Upload,
  FileText,
  Link,
  Image,
  Activity,
  Share2,
  Eye,
  Download,
  Trash,
} from "lucide-react"

interface RetryState {
  isRetrying: boolean
  retryAfter: number
  action: string | null
}

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading, updateUserProfile } = useAuth()
  const { toast } = useToast()
  const projectId = params.id as string

  // Core state
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [resources, setResources] = useState<SharedResource[]>([])
  const [activities, setActivities] = useState<LiveActivity[]>([])
  const [notifications, setNotifications] = useState<TeamNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Schedule state
  const [currentWorkSession, setCurrentWorkSession] = useState<{ start: Date; duration: number } | null>(null)
  const [nextBreakTime, setNextBreakTime] = useState<Date | null>(null)

  // Drag and drop state
  const [activeTask, setActiveTask] = useState<Task | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1, // Ultra-fast activation - just 1px movement
      },
    })
  )

  // UI state
  const [ideaInput, setIdeaInput] = useState("")
  const [isAnalyzingIdea, setIsAnalyzingIdea] = useState(false)
  const [isGeneratingTasks, setIsGeneratingTasks] = useState(false)

  // Task creation state
  const [newTaskTitle, setNewTaskTitle] = useState("")
  const [newTaskDescription, setNewTaskDescription] = useState("")
  const [newTaskEffort, setNewTaskEffort] = useState<"Low" | "Medium" | "High">("Medium")
  const [newTaskPriority, setNewTaskPriority] = useState<"Low" | "Medium" | "High" | "Critical">("Medium")
  const [newTaskAssignee, setNewTaskAssignee] = useState<string | null>(null)
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [addTaskDialogOpen, setAddTaskDialogOpen] = useState(false)

  // Chat state
  const [chatInput, setChatInput] = useState("")
  const [isSendingMessage, setIsSendingMessage] = useState(false)

  // Profile settings state
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)
  const [profileRole, setProfileRole] = useState<"lead" | "developer" | "designer" | "researcher">("developer")
  const [profileSkills, setProfileSkills] = useState<string>("")
  const [profileAvailability, setProfileAvailability] = useState<"available" | "busy" | "offline">("available")
  const [profileGithub, setProfileGithub] = useState("")

  // Copy functionality state
  const [copied, setCopied] = useState(false)

  // Delete project state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [isDeletingProject, setIsDeletingProject] = useState(false)

  // Remove member state
  const [removeMemberDialogOpen, setRemoveMemberDialogOpen] = useState(false)
  const [memberToRemove, setMemberToRemove] = useState<ProjectMember | null>(null)
  const [removeConfirmText, setRemoveConfirmText] = useState("")
  const [isRemovingMember, setIsRemovingMember] = useState(false)

  // Collaboration state
  const [resourceDialogOpen, setResourceDialogOpen] = useState(false)
  const [resourceName, setResourceName] = useState("")
  const [resourceType, setResourceType] = useState<"file" | "link" | "note">("link")
  const [resourceUrl, setResourceUrl] = useState("")
  const [resourceContent, setResourceContent] = useState("")
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileDataUrl, setFileDataUrl] = useState<string | null>(null)
  const [isUploadingResource, setIsUploadingResource] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Retry state
  const [retryState, setRetryState] = useState<RetryState>({
    isRetrying: false,
    retryAfter: 0,
    action: null,
  })

  const retryTimerRef = useRef<NodeJS.Timeout | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Calculate time remaining
  const [currentTime, setCurrentTime] = useState(new Date())

  const timeRemaining = useMemo(() => {
    if (!project) return "Loading..."

    const start = new Date(project.created_at)
    const duration = project.duration === "24h" ? 24 : 48
    const end = new Date(start.getTime() + duration * 60 * 60 * 1000)
    const remaining = end.getTime() - currentTime.getTime()

    if (remaining <= 0) return "Time's up! ⏰"

    const hours = Math.floor(remaining / (1000 * 60 * 60))
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))

    return `${hours}h ${minutes}m remaining`
  }, [project?.created_at, project?.duration, currentTime])

  // Update timer every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date())
    }, 60000)
    return () => clearInterval(interval)
  }, [])

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

          const unsubResources = subscribeToResources(projectId, (r) => {
            if (mounted) setResources(r)
          })

          const unsubActivities = subscribeToActivities(projectId, (a) => {
            if (mounted) setActivities(a)
          })

          const unsubNotifications = subscribeToNotifications(projectId, user.uid, (n) => {
            if (mounted) setNotifications(n)
          })

          return () => {
            unsubProject()
            unsubTasks()
            unsubMessages()
            unsubResources()
            unsubActivities()
            unsubNotifications()
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
              features: project.idea?.features || [],
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
            priority: task.priority || "Medium",
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
        priority: newTaskPriority,
        assigned_to: newTaskAssignee,
      })

      if (newTask) {
        setTasks((prev) => [...prev, newTask])
      }

      setNewTaskTitle("")
      setNewTaskDescription("")
      setNewTaskEffort("Medium")
      setNewTaskPriority("Medium")
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
    const originalTask = tasks.find(t => t.task_id === taskId)
    if (!originalTask || !user) return

    // Optimistic update
    setTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, status } : t)))

    try {
      await updateTask(taskId, { status })

      // Add activity
      await addActivity({
        project_id: projectId,
        user_id: user.uid,
        type: "task_update",
        description: `Moved "${originalTask.title}" to ${status}`,
      })

      // Create notification for assigned user if different
      if (originalTask.assigned_to && originalTask.assigned_to !== user.uid) {
        await createNotification({
          project_id: projectId,
          user_id: originalTask.assigned_to,
          type: "task_assigned",
          title: "Task Updated",
          message: `${user.displayName || "Team member"} moved "${originalTask.title}" to ${status}`,
          read: false,
        })
      }
    } catch (error) {
      // Revert on error
      setTasks((prev) => prev.map((t) => (t.task_id === taskId ? { ...t, status: originalTask.status } : t)))
      toast({
        title: "Update failed",
        description: "Failed to update task status.",
        variant: "destructive",
      })
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
      toast({
        title: "Task moved!",
        description: `Task moved to ${mappedStatus === "ToDo" ? "To Do" : mappedStatus === "InProgress" ? "In Progress" : "Done"}`,
      })
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

  const handleUpdateProjectUrls = async (urls: { github_repo?: string; demo_url?: string }) => {
    try {
      await updateProjectUrls(projectId, urls)
      setProject((prev) => (prev ? { ...prev, ...urls } : prev))
      toast({
        title: "Project updated!",
        description: "Project links have been updated.",
      })
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update project links.",
        variant: "destructive",
      })
    }
  }

  const handleUpdateProfile = async () => {
    try {
      const skills = profileSkills.split(',').map(s => s.trim()).filter(s => s.length > 0)
      await updateUserProfile({
        role: profileRole,
        skills,
        availability: profileAvailability,
        github_username: profileGithub || undefined,
      })
      setProfileDialogOpen(false)
      toast({
        title: "Profile updated!",
        description: "Your profile has been updated successfully.",
      })
    } catch (error) {
      toast({
        title: "Update failed",
        description: "Failed to update profile.",
        variant: "destructive",
      })
    }
  }

  const handleCopyJoinCode = async () => {
    try {
      await navigator.clipboard.writeText(project?.join_code || "")
      setCopied(true)
      toast({
        title: "Copied!",
        description: "Join code copied to clipboard.",
      })
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      toast({
        title: "Copy failed",
        description: "Failed to copy join code.",
        variant: "destructive",
      })
    }
  }
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Check file size (limit to 5MB for demo)
      const maxSize = 5 * 1024 * 1024 // 5MB
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: "Please select a file smaller than 5MB.",
          variant: "destructive",
        })
        if (fileInputRef.current) {
          fileInputRef.current.value = ""
        }
        return
      }

      setSelectedFile(file)
      if (!resourceName.trim()) {
        setResourceName(file.name)
      }

      // Convert file to base64 for storage
      const reader = new FileReader()
      reader.onload = (e) => {
        const result = e.target?.result as string
        setFileDataUrl(result)
      }
      reader.onerror = (error) => {
        console.error("FileReader error:", error)
        toast({
          title: "File read error",
          description: "Failed to read the selected file.",
          variant: "destructive",
        })
      }
      reader.readAsDataURL(file)
    }
  }

  const handleResourceDialogClose = (open: boolean) => {
    setResourceDialogOpen(open)
    if (!open) {
      // Reset form when dialog closes
      setResourceName("")
      setResourceUrl("")
      setResourceContent("")
      setSelectedFile(null)
      setFileDataUrl(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleDeleteProject = async () => {
    if (!project || !user) return
    if (project.created_by !== user.uid) {
      toast({
        title: "Permission denied",
        description: "Only the project owner can delete this project.",
        variant: "destructive",
      })
      return
    }
    if (deleteConfirmText !== project.name) {
      toast({
        title: "Confirmation required",
        description: "Please type the project name exactly to confirm deletion.",
        variant: "destructive",
      })
      return
    }

    setIsDeletingProject(true)
    try {
      await deleteProject(projectId)
      toast({
        title: "Project deleted",
        description: "The project has been permanently deleted.",
      })
      router.push("/dashboard")
    } catch (error: any) {
      console.error("Delete project error:", error)
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete project.",
        variant: "destructive",
      })
    } finally {
      setIsDeletingProject(false)
      setDeleteDialogOpen(false)
      setDeleteConfirmText("")
    }
  }

  const handleDeleteResource = async (resource: SharedResource) => {
    if (!user) return

    // Check if user is the uploader
    if (resource.uploaded_by !== user.uid) {
      toast({
        title: "Permission denied",
        description: "Only the uploader can delete this resource.",
        variant: "destructive",
      })
      return
    }

    try {
      await deleteResource(resource.resource_id)

      // Add activity
      await addActivity({
        project_id: projectId,
        user_id: user.uid,
        type: "file_upload",
        description: `Deleted ${resource.type}: ${resource.name}`,
      })

      toast({
        title: "Resource deleted",
        description: `${resource.name} has been removed.`,
      })
    } catch (error: any) {
      console.error("Delete resource error:", error)
      toast({
        title: "Delete failed",
        description: error.message || "Failed to delete resource.",
        variant: "destructive",
      })
    }
  }

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!user || !project) return

    // Check if user is the project creator
    if (project.created_by !== user.uid) {
      toast({
        title: "Permission denied",
        description: "Only the project creator can remove members.",
        variant: "destructive",
      })
      return
    }

    // Prevent removing self
    if (memberId === user.uid) {
      toast({
        title: "Cannot remove yourself",
        description: "Project creators cannot remove themselves from the project.",
        variant: "destructive",
      })
      return
    }

    // Find the member and open confirmation dialog
    const member = members.find(m => m.user_id === memberId)
    if (member) {
      setMemberToRemove(member)
      setRemoveMemberDialogOpen(true)
    }
  }

  const handleConfirmRemoveMember = async () => {
    if (!memberToRemove || !user) return

    // Validate confirmation text
    if (removeConfirmText !== memberToRemove.name) {
      toast({
        title: "Confirmation required",
        description: "Please type the member's name exactly to confirm removal.",
        variant: "destructive",
      })
      return
    }

    setIsRemovingMember(true)
    try {
      await removeMemberFromProject(projectId, memberToRemove.user_id)

      // Add activity
      await addActivity({
        project_id: projectId,
        user_id: user.uid,
        type: "status_change",
        description: `Removed ${memberToRemove.name} from the team`,
      })

      toast({
        title: "Member removed",
        description: `${memberToRemove.name} has been removed from the project.`,
      })

      // Reset dialog state
      setRemoveMemberDialogOpen(false)
      setMemberToRemove(null)
      setRemoveConfirmText("")
    } catch (error: any) {
      console.error("Remove member error:", error)
      toast({
        title: "Remove failed",
        description: error.message || "Failed to remove member.",
        variant: "destructive",
      })
    } finally {
      setIsRemovingMember(false)
    }
  }

  const handleDownloadFile = (resource: SharedResource) => {
    if (resource.type === "file" && resource.content) {
      try {
        // Check if content is base64 data URL
        if (!resource.content.startsWith('data:')) {
          toast({
            title: "Download failed",
            description: "Invalid file format stored.",
            variant: "destructive",
          })
          return
        }

        // Try direct data URL download
        const fileName = resource.original_name || resource.name
        const link = document.createElement('a')
        link.href = resource.content
        link.download = fileName
        link.style.display = 'none'

        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        toast({
          title: "Download started",
          description: `Downloading ${fileName}`,
        })
      } catch (error) {
        console.error("Download error:", error)
        toast({
          title: "Download failed",
          description: "Failed to download file.",
          variant: "destructive",
        })
      }
    } else {
      toast({
        title: "Download failed",
        description: "No file content available.",
        variant: "destructive",
      })
    }
  }

  const handleAddResource = async () => {
    if (!resourceName.trim() || !user) return
    if (resourceType === "link" && !resourceUrl.trim()) return
    if (resourceType === "note" && !resourceContent.trim()) return
    if (resourceType === "file" && !selectedFile) return

    setIsUploadingResource(true)
    try {
      // Create resource object with only defined values
      const resourceData: any = {
        project_id: projectId,
        name: resourceName,
        type: resourceType,
        uploaded_by: user.uid,
        tags: [],
      }

      // Handle different resource types
      if (resourceType === "link" && resourceUrl.trim()) {
        resourceData.url = resourceUrl.trim()
      } else if (resourceType === "note" && resourceContent.trim()) {
        resourceData.content = resourceContent.trim()
      } else if (resourceType === "file" && selectedFile && fileDataUrl) {
        // Store file data as base64 in content field
        resourceData.content = fileDataUrl
        resourceData.size = selectedFile.size
        resourceData.file_type = selectedFile.type
        resourceData.original_name = selectedFile.name
      }

      await uploadResource(resourceData)

      // Add activity
      await addActivity({
        project_id: projectId,
        user_id: user.uid,
        type: "file_upload",
        description: `Added ${resourceType}: ${resourceName}`,
      })

      // Reset form
      setResourceName("")
      setResourceUrl("")
      setResourceContent("")
      setSelectedFile(null)
      setFileDataUrl(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      setResourceDialogOpen(false)

      toast({
        title: "Resource added!",
        description: `${resourceType} has been shared with the team.`,
      })
    } catch (error: any) {
      console.error("Resource upload error:", error)
      toast({
        title: "Upload failed",
        description: error.message || "Failed to add resource.",
        variant: "destructive",
      })
    } finally {
      setIsUploadingResource(false)
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
                  <div className="flex items-center gap-1">
                    <span>Code:</span>
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={handleCopyJoinCode}
                    >
                      {project.join_code}
                      {copied ? (
                        <Check className="ml-1 h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="ml-1 h-3 w-3" />
                      )}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 text-primary">
                    <Timer className="h-4 w-4" />
                    <span className="font-medium">{timeRemaining}</span>
                  </div>
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
              {project.created_by === user?.uid && (
                <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                      <Trash className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="text-red-600">Delete Project</DialogTitle>
                      <DialogDescription>
                        This action cannot be undone. This will permanently delete the project, all tasks, messages, and shared resources.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 pt-4">
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm text-red-800 font-medium mb-2">
                          ⚠️ This will permanently delete:
                        </p>
                        <ul className="text-sm text-red-700 space-y-1">
                          <li>• All project tasks and progress</li>
                          <li>• Team chat messages</li>
                          <li>• Shared resources and files</li>
                          <li>• Project analytics and history</li>
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <Label>Type the project name to confirm:</Label>
                        <Input
                          placeholder={project.name}
                          value={deleteConfirmText}
                          onChange={(e) => setDeleteConfirmText(e.target.value)}
                          className="font-mono"
                        />
                        <p className="text-xs text-muted-foreground">
                          Type: <code className="bg-muted px-1 rounded">{project.name}</code>
                        </p>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setDeleteDialogOpen(false)
                            setDeleteConfirmText("")
                          }}
                          className="flex-1"
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          onClick={handleDeleteProject}
                          disabled={deleteConfirmText !== project.name || isDeletingProject}
                          className="flex-1"
                        >
                          {isDeletingProject ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Trash className="mr-2 h-4 w-4" />
                              Delete Project
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Remove Member Confirmation Dialog */}
            <Dialog open={removeMemberDialogOpen} onOpenChange={setRemoveMemberDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="text-red-600">Remove Team Member</DialogTitle>
                  <DialogDescription>
                    This will remove the member from the project and revoke their access.
                  </DialogDescription>
                </DialogHeader>
                {memberToRemove && (
                  <div className="space-y-4 pt-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-lg">
                          {memberToRemove.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{memberToRemove.name}</p>
                          <p className="text-sm text-muted-foreground">{memberToRemove.email}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="font-medium text-muted-foreground">Role</p>
                          <p className="capitalize">{memberToRemove.role || "Member"}</p>
                        </div>
                        <div>
                          <p className="font-medium text-muted-foreground">Status</p>
                          <div className="flex items-center gap-2">
                            <div className={`h-2 w-2 rounded-full ${memberToRemove.availability === "available" ? "bg-green-500" :
                              memberToRemove.availability === "busy" ? "bg-yellow-500" : "bg-red-500"
                              }`} />
                            <span className="capitalize">{memberToRemove.availability || "available"}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-800 font-medium mb-2">
                        ⚠️ Removing this member will:
                      </p>
                      <ul className="text-sm text-red-700 space-y-1">
                        <li>• Revoke their access to the project</li>
                        <li>• Unassign them from all tasks</li>
                        <li>• Remove them from team communications</li>
                        <li>• They won't be able to rejoin without a new invite</li>
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <Label>Type the member's name to confirm removal:</Label>
                      <Input
                        placeholder={memberToRemove.name}
                        value={removeConfirmText}
                        onChange={(e) => setRemoveConfirmText(e.target.value)}
                        className="font-mono"
                      />
                      <p className="text-xs text-muted-foreground">
                        Type: <code className="bg-muted px-1 rounded">{memberToRemove.name}</code>
                      </p>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setRemoveMemberDialogOpen(false)
                          setMemberToRemove(null)
                          setRemoveConfirmText("")
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleConfirmRemoveMember}
                        disabled={removeConfirmText !== memberToRemove.name || isRemovingMember}
                        className="flex-1"
                      >
                        {isRemovingMember ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash className="mr-2 h-4 w-4" />
                            Remove Member
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>
      {/* Main Content */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="idea" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 max-w-4xl h-auto">
            <TabsTrigger value="idea" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              <span className="hidden sm:inline">Idea</span>
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Tasks</span>
            </TabsTrigger>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              <span className="hidden sm:inline">Schedule</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="mentor" className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Mentor</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Collaborate</span>
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
                        <Label>Priority</Label>
                        <Select value={newTaskPriority} onValueChange={(value) => setNewTaskPriority(value as "Low" | "Medium" | "High" | "Critical")}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                            <SelectItem value="Critical">Critical</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
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
                                      {member?.name ? member.name.charAt(0).toUpperCase() : "?"}
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
                          {members.map((member, i) => (
                            <SelectItem key={`${member.user_id}-${i}`} value={member.user_id}>
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                                  {member?.name ? member.name.charAt(0).toUpperCase() : "?"}
                                </div>
                                <span>{member.name}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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
                  <div className="p-3 bg-background border-2 border-primary/50 rounded-lg space-y-2 shadow-2xl opacity-95 scale-105 rotate-2 ring-2 ring-primary/30">
                    <p className="text-sm font-medium">{activeTask.title}</p>
                    {activeTask.description && <p className="text-xs text-muted-foreground">{activeTask.description}</p>}
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {activeTask.effort}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {activeTask.status === "ToDo" ? "To Do" : activeTask.status === "InProgress" ? "In Progress" : "Done"}
                      </Badge>
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </TabsContent>
          {/* Schedule Tab */}
          <TabsContent value="schedule" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Time Remaining Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Timer className="h-5 w-5 text-primary" />
                    Hackathon Timer
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center space-y-4">
                    <div className="text-3xl font-bold text-primary">{timeRemaining}</div>
                    <div className="text-sm text-muted-foreground">
                      Started: {project.created_at ? new Date(project.created_at).toLocaleDateString() : "Unknown"}
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(0, Math.min(100,
                            ((new Date().getTime() - new Date(project.created_at).getTime()) /
                              ((project.duration === "24h" ? 24 : 48) * 60 * 60 * 1000)) * 100
                          ))}%`
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Work Session Tracker */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Coffee className="h-5 w-5 text-amber-500" />
                    Work Session
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {currentWorkSession ? (
                      <div className="text-center">
                        <div className="text-lg font-medium text-green-600">Session Active</div>
                        <div className="text-sm text-muted-foreground">
                          Started: {currentWorkSession.start.toLocaleTimeString()}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => setCurrentWorkSession(null)}
                        >
                          <Pause className="mr-2 h-4 w-4" />
                          End Session
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center">
                        <div className="text-lg font-medium text-muted-foreground">No Active Session</div>
                        <Button
                          size="sm"
                          className="mt-2"
                          onClick={() => setCurrentWorkSession({ start: new Date(), duration: 25 })}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Start Work Session
                        </Button>
                      </div>
                    )}

                    {nextBreakTime && (
                      <div className="text-center p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="text-sm font-medium text-amber-800">Next Break</div>
                        <div className="text-xs text-amber-600">{nextBreakTime.toLocaleTimeString()}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Schedule */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    Suggested Schedule
                  </CardTitle>
                  <CardDescription>
                    Recommended timeline for your {project.duration} hackathon
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(() => {
                      const start = new Date(project.created_at)
                      const duration = project.duration === "24h" ? 24 : 48
                      const phases = [
                        { name: "Planning & Setup", percent: 15, icon: Lightbulb, color: "text-yellow-600" },
                        { name: "Core Development", percent: 50, icon: CheckSquare, color: "text-blue-600" },
                        { name: "Testing & Polish", percent: 20, icon: Target, color: "text-green-600" },
                        { name: "Presentation Prep", percent: 15, icon: Users, color: "text-purple-600" }
                      ]

                      let currentPercent = 0
                      return phases.map((phase, i) => {
                        const phaseStart = new Date(start.getTime() + (currentPercent / 100) * duration * 60 * 60 * 1000)
                        const phaseEnd = new Date(start.getTime() + ((currentPercent + phase.percent) / 100) * duration * 60 * 60 * 1000)
                        currentPercent += phase.percent

                        const Icon = phase.icon
                        const isActive = new Date() >= phaseStart && new Date() <= phaseEnd

                        return (
                          <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${isActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/30'}`}>
                            <Icon className={`h-5 w-5 ${phase.color}`} />
                            <div className="flex-1">
                              <div className="font-medium">{phase.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {phaseStart.toLocaleDateString()} {phaseStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - {phaseEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                            <Badge variant={isActive ? "default" : "secondary"}>
                              {phase.percent}%
                            </Badge>
                          </div>
                        )
                      })
                    })()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {/* Task Progress */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Task Progress</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{doneTasks.length}/{tasks.length}</div>
                  <div className="text-xs text-muted-foreground">Tasks Completed</div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${tasks.length > 0 ? (doneTasks.length / tasks.length) * 100 : 0}%` }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Team Velocity */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Team Velocity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {(() => {
                      const hoursElapsed = Math.max(1, (new Date().getTime() - new Date(project.created_at).getTime()) / (1000 * 60 * 60))
                      return (doneTasks.length / hoursElapsed).toFixed(1)
                    })()}
                  </div>
                  <div className="text-xs text-muted-foreground">Tasks/Hour</div>
                  <div className="flex items-center gap-1 mt-2">
                    <TrendingUp className="h-3 w-3 text-green-500" />
                    <span className="text-xs text-green-600">On Track</span>
                  </div>
                </CardContent>
              </Card>

              {/* Active Members */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Active Members</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{members.length}</div>
                  <div className="text-xs text-muted-foreground">Team Members</div>
                  <div className="flex items-center gap-1 mt-2">
                    <div className="flex -space-x-1">
                      {members.slice(0, 3).map((member, i) => (
                        <div key={i} className="h-6 w-6 rounded-full bg-primary/20 border-2 border-background flex items-center justify-center text-xs font-bold text-primary">
                          {member?.name ? member.name.charAt(0).toUpperCase() : "?"}
                        </div>
                      ))}
                      {members.length > 3 && (
                        <div className="h-6 w-6 rounded-full bg-muted border-2 border-background flex items-center justify-center text-xs">
                          +{members.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Time Efficiency */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Time Efficiency</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-amber-600">
                    {(() => {
                      const totalHours = project.duration === "24h" ? 24 : 48
                      const elapsedHours = (new Date().getTime() - new Date(project.created_at).getTime()) / (1000 * 60 * 60)
                      const efficiency = Math.min(100, (doneTasks.length / Math.max(1, elapsedHours / totalHours * tasks.length)) * 100)
                      return Math.round(efficiency)
                    })()}%
                  </div>
                  <div className="text-xs text-muted-foreground">Efficiency Score</div>
                  <div className="flex items-center gap-1 mt-2">
                    <Target className="h-3 w-3 text-amber-500" />
                    <span className="text-xs text-amber-600">Good Pace</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Detailed Analytics */}
            <div className="grid gap-6 md:grid-cols-2">
              {/* Task Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Task Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">To Do</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-muted rounded-full h-2">
                          <div
                            className="bg-slate-500 h-2 rounded-full"
                            style={{ width: `${tasks.length > 0 ? (todoTasks.length / tasks.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8">{todoTasks.length}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">In Progress</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-muted rounded-full h-2">
                          <div
                            className="bg-blue-500 h-2 rounded-full"
                            style={{ width: `${tasks.length > 0 ? (inProgressTasks.length / tasks.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8">{inProgressTasks.length}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Done</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 bg-muted rounded-full h-2">
                          <div
                            className="bg-green-500 h-2 rounded-full"
                            style={{ width: `${tasks.length > 0 ? (doneTasks.length / tasks.length) * 100 : 0}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium w-8">{doneTasks.length}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-green-500" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-48">
                    <div className="space-y-3">
                      {activities.length > 0 ? (
                        activities.slice(0, 10).map((activity) => {
                          const member = members.find(m => m.user_id === activity.user_id)
                          return (
                            <div key={activity.activity_id} className="flex items-start gap-3 text-sm">
                              <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                {member?.name.charAt(0).toUpperCase() || "?"}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm">{activity.description}</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(activity.timestamp).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <div className="text-center text-muted-foreground py-8">
                          <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No recent activity</p>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
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
                          className={`max-w-[80%] rounded-lg px-4 py-2 ${msg.sender_type === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
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
            <div className="grid gap-6 lg:grid-cols-3">
              {/* GitHub History */}
              <div className="lg:col-span-3 space-y-4 border-2 border-dashed border-amber-500 p-4 rounded-xl bg-amber-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 px-1">
                    <Github className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-bold">GitHub Integration</h2>
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-800">New Feature</Badge>
                </div>
                <GithubHistory repoUrl={project.github_repo} />
              </div>

              {/* Team Members */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-500" />
                    Team Members ({members.length})
                  </CardTitle>
                  <CardDescription>
                    Manage your hackathon team
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {members.length > 0 ? (
                      members.map((member, i) => (
                        <div key={`${member.user_id}-${i}`} className="flex items-center justify-between p-4 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-lg">
                              {member?.name ? member.name.charAt(0).toUpperCase() : "?"}
                            </div>
                            <div>
                              <p className="font-medium">{member.name}</p>
                              <p className="text-sm text-muted-foreground">{member.email}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {member.role || "Member"}
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <div className={`h-2 w-2 rounded-full ${member.availability === "available" ? "bg-green-500" :
                                    member.availability === "busy" ? "bg-yellow-500" : "bg-red-500"
                                    }`} />
                                  <span className="text-xs text-muted-foreground capitalize">
                                    {member.availability || "available"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {member.github_username && (
                              <Button variant="ghost" size="sm" asChild>
                                <a href={`https://github.com/${member.github_username}`} target="_blank" rel="noopener noreferrer">
                                  <Github className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            {project.created_by === user?.uid && member.user_id !== user?.uid && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveMember(member.user_id, member.name)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Trash className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No team members yet</p>
                        <p className="text-sm mt-2">Share your join code to invite members</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Project Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5 text-gray-500" />
                    Project Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>GitHub Repository</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://github.com/user/repo"
                        value={project.github_repo || ""}
                        onChange={(e) => handleUpdateProjectUrls({ github_repo: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Demo URL</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="https://your-demo.com"
                        value={project.demo_url || ""}
                        onChange={(e) => handleUpdateProjectUrls({ demo_url: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
                      <DialogTrigger asChild>
                        <Button variant="outline" className="w-full">
                          <Settings className="mr-2 h-4 w-4" />
                          Update Profile
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Update Your Profile</DialogTitle>
                          <DialogDescription>
                            Update your role and skills for better team coordination
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label>Role</Label>
                            <Select value={profileRole} onValueChange={(value) => setProfileRole(value as any)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="lead">Team Lead</SelectItem>
                                <SelectItem value="developer">Developer</SelectItem>
                                <SelectItem value="designer">Designer</SelectItem>
                                <SelectItem value="researcher">Researcher</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Skills (comma-separated)</Label>
                            <Input
                              placeholder="React, Node.js, Python, Design..."
                              value={profileSkills}
                              onChange={(e) => setProfileSkills(e.target.value)}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Availability</Label>
                            <Select value={profileAvailability} onValueChange={(value) => setProfileAvailability(value as any)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="available">Available</SelectItem>
                                <SelectItem value="busy">Busy</SelectItem>
                                <SelectItem value="offline">Offline</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>GitHub Username</Label>
                            <Input
                              placeholder="your-username"
                              value={profileGithub}
                              onChange={(e) => setProfileGithub(e.target.value)}
                            />
                          </div>

                          <Button onClick={handleUpdateProfile} className="w-full">
                            Update Profile
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Shared Resources */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-green-500" />
                    Shared Resources ({resources.length})
                  </div>
                  <Dialog open={resourceDialogOpen} onOpenChange={handleResourceDialogClose}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Add Resource
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Share a Resource</DialogTitle>
                        <DialogDescription>
                          Share files, links, or notes with your team
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                          <Label>Resource Name</Label>
                          <Input
                            placeholder="Resource name"
                            value={resourceName}
                            onChange={(e) => setResourceName(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Type</Label>
                          <Select value={resourceType} onValueChange={(value) => setResourceType(value as any)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="link">Link</SelectItem>
                              <SelectItem value="file">File</SelectItem>
                              <SelectItem value="note">Note</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {resourceType === "link" && (
                          <div className="space-y-2">
                            <Label>URL</Label>
                            <Input
                              placeholder="https://..."
                              value={resourceUrl}
                              onChange={(e) => setResourceUrl(e.target.value)}
                            />
                          </div>
                        )}

                        {resourceType === "file" && (
                          <div className="space-y-2">
                            <Label>File</Label>
                            <Input
                              type="file"
                              ref={fileInputRef}
                              onChange={handleFileSelect}
                              accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg,.gif,.zip"
                            />
                            {selectedFile && (
                              <p className="text-sm text-muted-foreground">
                                Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
                              </p>
                            )}
                          </div>
                        )}

                        {resourceType === "note" && (
                          <div className="space-y-2">
                            <Label>Content</Label>
                            <Textarea
                              placeholder="Write your note here..."
                              value={resourceContent}
                              onChange={(e) => setResourceContent(e.target.value)}
                              rows={4}
                            />
                          </div>
                        )}

                        <Button
                          onClick={handleAddResource}
                          disabled={!resourceName.trim() || isUploadingResource ||
                            (resourceType === "link" && !resourceUrl.trim()) ||
                            (resourceType === "note" && !resourceContent.trim()) ||
                            (resourceType === "file" && !selectedFile)
                          }
                          className="w-full"
                        >
                          {isUploadingResource ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Upload className="mr-2 h-4 w-4" />
                              Share Resource
                            </>
                          )}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {resources.length > 0 ? (
                    resources.map((resource) => {
                      const uploader = members.find(m => m.user_id === resource.uploaded_by)
                      const canDelete = resource.uploaded_by === user?.uid

                      return (
                        <Card key={resource.resource_id} className="relative">
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {resource.type === "file" && <FileText className="h-4 w-4 text-blue-500" />}
                                {resource.type === "link" && <Link className="h-4 w-4 text-green-500" />}
                                {resource.type === "note" && <FileText className="h-4 w-4 text-amber-500" />}
                                <span className="font-medium text-sm">{resource.name}</span>
                              </div>
                              {canDelete && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteResource(resource)}
                                  className="h-6 w-6 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash className="h-3 w-3" />
                                </Button>
                              )}
                            </div>

                            <p className="text-xs text-muted-foreground mb-3">
                              By {uploader?.name || "Unknown"} • {new Date(resource.created_at).toLocaleDateString()}
                            </p>

                            <div className="flex gap-2">
                              {resource.type === "link" && resource.url && (
                                <Button variant="outline" size="sm" asChild className="flex-1">
                                  <a href={resource.url} target="_blank" rel="noopener noreferrer">
                                    <Eye className="mr-1 h-3 w-3" />
                                    Open
                                  </a>
                                </Button>
                              )}

                              {resource.type === "file" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDownloadFile(resource)}
                                  className="flex-1"
                                >
                                  <Download className="mr-1 h-3 w-3" />
                                  Download
                                </Button>
                              )}

                              {resource.type === "note" && resource.content && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button variant="outline" size="sm" className="flex-1">
                                      <Eye className="mr-1 h-3 w-3" />
                                      View
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent>
                                    <DialogHeader>
                                      <DialogTitle>{resource.name}</DialogTitle>
                                    </DialogHeader>
                                    <div className="pt-4">
                                      <div className="p-4 bg-muted rounded-lg">
                                        <p className="text-sm whitespace-pre-wrap">{resource.content}</p>
                                      </div>
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })
                  ) : (
                    <div className="col-span-full text-center text-muted-foreground py-12">
                      <Share2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No shared resources yet</p>
                      <p className="text-sm mt-2">Share files, links, or notes with your team</p>
                    </div>
                  )}
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
    <Card className={`${isOver ? "ring-2 ring-primary bg-primary/10 scale-[1.02]" : ""} transition-all duration-100 ease-out`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${color} transition-all duration-100 ${isOver ? "scale-125" : ""}`} />
          {title} ({count})
          {isOver && (
            <div className="ml-auto text-primary animate-pulse">
              <span className="text-xs font-medium">Drop here</span>
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent
        ref={setNodeRef}
        className={`space-y-2 min-h-[200px] ${isOver ? "bg-primary/10" : ""} transition-all duration-100 ease-out rounded-md`}
      >
        {children}
        {isOver && (
          <div className="border-2 border-dashed border-primary/60 rounded-lg p-3 text-center text-primary animate-pulse">
            <span className="text-sm font-medium">Drop task here</span>
          </div>
        )}
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
  } = useSortable({
    id: task.task_id,
    transition: {
      duration: 100, // Ultra-fast transition
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', // Bouncy smooth easing
    }
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? 'none' : transition, // No transition while dragging for maximum smoothness
  }

  const effortColors = {
    Low: "bg-green-500/10 text-green-600",
    Medium: "bg-amber-500/10 text-amber-600",
    High: "bg-red-500/10 text-red-600",
  }

  const priorityColors = {
    Low: "bg-blue-500/10 text-blue-600",
    Medium: "bg-yellow-500/10 text-yellow-600",
    High: "bg-orange-500/10 text-orange-600",
    Critical: "bg-red-500/10 text-red-600"
  }

  const assignedMember = members.find(m => m.user_id === task.assigned_to)

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`p-3 bg-background border rounded-lg space-y-2 cursor-grab active:cursor-grabbing select-none ${isDragging ? "opacity-70 shadow-2xl scale-110 z-50 rotate-3 ring-2 ring-primary/50" : "hover:shadow-lg hover:scale-[1.02]"
        } transition-all duration-100 ease-out will-change-transform`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium flex-1 pointer-events-none">{task.title}</p>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 pointer-events-auto opacity-60 hover:opacity-100 transition-opacity duration-100"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onDelete(task.task_id)
          }}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {task.description && (
        <p className="text-xs text-muted-foreground pointer-events-none">{task.description}</p>
      )}

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className={`${effortColors[task.effort as keyof typeof effortColors] || ""} pointer-events-none transition-all duration-100 flex items-center gap-1`} title="Effort">
            <BarChart3 className="h-3 w-3" />
            {task.effort}
          </Badge>
          {task.priority && (
            <Badge variant="outline" className={`${priorityColors[task.priority as keyof typeof priorityColors] || ""} pointer-events-none transition-all duration-100 flex items-center gap-1`} title="Priority">
              <AlertTriangle className="h-3 w-3" />
              {task.priority}
            </Badge>
          )}
        </div>

        <Select
          value={task.status}
          onValueChange={(value) => {
            onStatusChange(task.task_id, value as Task["status"])
          }}
        >
          <SelectTrigger
            className="h-7 w-28 text-xs pointer-events-auto transition-all duration-100 hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
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
        <span className="text-xs text-muted-foreground pointer-events-none">Assigned to:</span>
        <Select
          value={task.assigned_to || "unassigned"}
          onValueChange={(value) => {
            const assignedTo = value === "unassigned" ? null : value
            onAssign(task.task_id, assignedTo)
          }}
        >
          <SelectTrigger
            className="h-7 w-32 text-xs pointer-events-auto transition-all duration-100 hover:bg-accent"
            onClick={(e) => {
              e.stopPropagation()
              e.preventDefault()
            }}
          >
            <SelectValue>
              {assignedMember ? (
                <div className="flex items-center gap-1">
                  <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                    {assignedMember?.name ? assignedMember.name.charAt(0).toUpperCase() : "?"}
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
            {members.map((member, i) => {
              const id = member?.user_id ?? `member-${i}`
              const displayName = member?.name ?? "Unknown"
              return (
                <SelectItem key={`${id}-${i}`} value={id}>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary">
                      {displayName ? displayName.charAt(0).toUpperCase() : "?"}
                    </div>
                    <span>{displayName}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}