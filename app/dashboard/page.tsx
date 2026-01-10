"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/auth-context"
import { getUserProjects, createProject, joinProjectByCode } from "@/lib/firestore"
import type { Project } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Plus,
  Rocket,
  LogOut,
  Clock,
  Users,
  ArrowRight,
  UserPlus,
  FolderOpen,
  Loader2,
  CheckCircle2,
  RefreshCw,
  AlertTriangle,
  FileText,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { formatDistanceToNow } from "date-fns"
import { Alert, AlertDescription } from "@/components/ui/alert"

type CreationStatus = "idle" | "creating" | "success" | "error"

export default function DashboardPage() {
  const { user, userProfile, loading, logout } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [projects, setProjects] = useState<Project[]>([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [joinDialogOpen, setJoinDialogOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState("")
  const [newProjectDuration, setNewProjectDuration] = useState<"24h" | "48h">("24h")
  const [joinCode, setJoinCode] = useState("")
  const [creationStatus, setCreationStatus] = useState<CreationStatus>("idle")
  const [creationMessage, setCreationMessage] = useState("")
  const [isJoining, setIsJoining] = useState(false)
  const [joiningMessage, setJoiningMessage] = useState("")
  const [isOfflineMode, setIsOfflineMode] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push("/")
    }
  }, [user, loading, router])

  const loadProjects = useCallback(async () => {
    if (!user) {
      setIsLoadingProjects(false)
      return
    }

    setIsLoadingProjects(true)
    setLoadError(false)

    try {
      const userProjects = await getUserProjects(user.uid)
      setProjects(userProjects)
      setIsOfflineMode(false)
    } catch (error: any) {
      console.error("Failed to load projects:", error)
      if (error.message?.includes("offline")) {
        setIsOfflineMode(true)
      } else {
        setLoadError(true)
      }
    } finally {
      setIsLoadingProjects(false)
    }
  }, [user])

  useEffect(() => {
    if (user && !loading) {
      loadProjects()
    } else if (!loading) {
      setIsLoadingProjects(false)
    }
  }, [user, loading, loadProjects])

  const handleCreateProject = async () => {
    if (!user || !newProjectName.trim()) return

    setCreationStatus("creating")
    setCreationMessage("Creating project...")

    try {
      const projectId = await createProject(newProjectName.trim(), newProjectDuration, user.uid)

      setCreationStatus("success")
      setCreationMessage("Project created!")

      toast({
        title: "Project created!",
        description: "Opening your new project...",
      })

      setTimeout(() => {
        setCreateDialogOpen(false)
        setNewProjectName("")
        setCreationStatus("idle")
        setCreationMessage("")
        router.push(`/project/${projectId}`)
      }, 300)
    } catch (error: any) {
      setCreationStatus("error")
      setCreationMessage("Failed to create project")
      toast({
        title: "Failed to create project",
        description: error.message || "Please try again",
        variant: "destructive",
      })
      setTimeout(() => {
        setCreationStatus("idle")
        setCreationMessage("")
      }, 1500)
    }
  }

  const handleJoinProject = async () => {
    if (!user || !joinCode.trim()) return

    setIsJoining(true)
    setJoiningMessage("Joining project...")

    try {
      const projectId = await joinProjectByCode(joinCode.trim().toUpperCase(), user.uid)

      if (projectId) {
        setJoiningMessage("Joined!")
        toast({
          title: "Joined project!",
          description: "Opening the project...",
        })

        setTimeout(() => {
          setJoinDialogOpen(false)
          setJoinCode("")
          setIsJoining(false)
          setJoiningMessage("")
          router.push(`/project/${projectId}`)
        }, 300)
      } else {
        setJoiningMessage("Project not found")
        toast({
          title: "Invalid code",
          description: "No project found with this join code.",
          variant: "destructive",
        })
        setTimeout(() => {
          setIsJoining(false)
          setJoiningMessage("")
        }, 1500)
      }
    } catch (error: any) {
      setJoiningMessage("Failed to join")
      toast({
        title: "Failed to join project",
        description: error.message || "Please try again",
        variant: "destructive",
      })
      setTimeout(() => {
        setIsJoining(false)
        setJoiningMessage("")
      }, 1500)
    }
  }

  const handleCreateDialogChange = (open: boolean) => {
    setCreateDialogOpen(open)
    if (!open) {
      setCreationStatus("idle")
      setCreationMessage("")
      setNewProjectName("")
    }
  }

  const handleJoinDialogChange = (open: boolean) => {
    setJoinDialogOpen(open)
    if (!open) {
      setIsJoining(false)
      setJoiningMessage("")
      setJoinCode("")
    }
  }

  const handleLogout = async () => {
    await logout()
    router.push("/")
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Rocket className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold">HackMate AI</h1>
              <p className="text-sm text-muted-foreground">
                Welcome, {userProfile?.name || user.displayName || "Hacker"}!
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {/* Logged in user email display */}
            {user?.email && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 rounded-lg">
                <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-semibold text-primary">
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{user.email}</span>
              </div>
            )}
            <Button variant="ghost" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {isOfflineMode && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-700 dark:text-amber-400">
              Database connection is slow. You can still create new projects - they will sync when connected.
            </AlertDescription>
          </Alert>
        )}

        {/* Actions - Always visible */}
        <div className="flex flex-wrap gap-4 mb-8">
          <Dialog open={createDialogOpen} onOpenChange={handleCreateDialogChange}>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="h-5 w-5 mr-2" />
                Create Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Project</DialogTitle>
                <DialogDescription>Start a new hackathon project and invite your team.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {creationStatus !== "idle" ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-3">
                    {creationStatus === "creating" && <Loader2 className="h-10 w-10 animate-spin text-primary" />}
                    {creationStatus === "success" && (
                      <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-white" />
                      </div>
                    )}
                    {creationStatus === "error" && (
                      <div className="h-10 w-10 rounded-full bg-destructive flex items-center justify-center">
                        <span className="text-xl text-white">!</span>
                      </div>
                    )}
                    <p className="text-center font-medium">{creationMessage}</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="project-name">Project Name</Label>
                      <Input
                        id="project-name"
                        placeholder="My Awesome Hackathon Project"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="duration">Hackathon Duration</Label>
                      <Select
                        value={newProjectDuration}
                        onValueChange={(v) => setNewProjectDuration(v as "24h" | "48h")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select duration" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="24h">24 Hours</SelectItem>
                          <SelectItem value="48h">48 Hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleCreateProject} className="w-full" disabled={!newProjectName.trim()}>
                      Create Project
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={joinDialogOpen} onOpenChange={handleJoinDialogChange}>
            <DialogTrigger asChild>
              <Button variant="outline" size="lg">
                <UserPlus className="h-5 w-5 mr-2" />
                Join Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Join a Project</DialogTitle>
                <DialogDescription>Enter the 6-character join code shared by your team.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                {isJoining ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-3">
                    {joiningMessage === "Joined!" ? (
                      <div className="h-10 w-10 rounded-full bg-green-500 flex items-center justify-center">
                        <CheckCircle2 className="h-6 w-6 text-white" />
                      </div>
                    ) : joiningMessage.includes("not found") || joiningMessage.includes("Failed") ? (
                      <div className="h-10 w-10 rounded-full bg-destructive flex items-center justify-center">
                        <span className="text-xl text-white">!</span>
                      </div>
                    ) : (
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    )}
                    <p className="text-center font-medium">{joiningMessage}</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="join-code">Join Code</Label>
                      <Input
                        id="join-code"
                        placeholder="ABC123"
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        maxLength={6}
                        className="text-center text-2xl tracking-widest font-mono"
                        autoFocus
                      />
                    </div>
                    <Button onClick={handleJoinProject} className="w-full" disabled={joinCode.length !== 6}>
                      Join Project
                    </Button>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>

          <Button variant="outline" size="lg" onClick={() => router.push("/docs-generator")}>
            <FileText className="h-5 w-5 mr-2" />
            Generate Docs
          </Button>
        </div>

        {/* Projects Grid */}
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Your Projects</h2>
          <Button variant="ghost" size="sm" onClick={loadProjects} disabled={isLoadingProjects}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoadingProjects ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {
          isLoadingProjects ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Loading your projects...</p>
              </CardContent>
            </Card>
          ) : loadError ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                  <RefreshCw className="h-8 w-8 text-destructive" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Could not load projects</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-sm">
                  There was a problem connecting to the database. Create a new project to get started.
                </p>
                <div className="flex gap-3">
                  <Button onClick={loadProjects}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Project
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FolderOpen className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No projects yet</h3>
                <p className="text-muted-foreground text-center mb-6 max-w-sm">
                  Create your first project or join an existing one with a code from your team.
                </p>
                <div className="flex gap-3">
                  <Button onClick={() => setCreateDialogOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Project
                  </Button>
                  <Button variant="outline" onClick={() => setJoinDialogOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Join Project
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project) => (
                <Card
                  key={project.project_id}
                  className="hover:shadow-lg transition-shadow cursor-pointer group"
                  onClick={() => router.push(`/project/${project.project_id}`)}
                >
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl group-hover:text-primary transition-colors">
                          {project.name}
                        </CardTitle>
                        <CardDescription className="mt-1">
                          {project.created_at && formatDistanceToNow(project.created_at, { addSuffix: true })}
                        </CardDescription>
                      </div>
                      <Badge variant={project.demo_mode ? "default" : "secondary"}>
                        {project.demo_mode ? "Demo Mode" : project.duration}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          {project.members.length}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {project.duration}
                        </div>
                      </div>
                      <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )
        }
      </main>
    </div>
  )
}
