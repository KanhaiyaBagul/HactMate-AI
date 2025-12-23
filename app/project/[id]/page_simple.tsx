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

  // Core state
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

        // Set up subscriptions
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
        varia