import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  writeBatch,
} from "firebase/firestore"
import { getFirebaseDb } from "./firebase"
import type { Project, Task, ChatMessage, ProjectMember, SharedResource, LiveActivity, TeamNotification, Milestone, ScheduleEvent, WellnessSettings } from "./types"

function getDb() {
  const db = getFirebaseDb()
  if (!db) throw new Error("Database not available")
  return db
}

// Generate random join code
function generateJoinCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let code = ""
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([promise, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]).catch(
    () => fallback,
  )
}

// Projects
export async function createProject(name: string, deadline: Date, userId: string): Promise<string> {
  const db = getDb()
  const projectRef = doc(collection(db, "projects"))

  const project = {
    project_id: projectRef.id,
    name,
    deadline,
    created_by: userId,
    members: [userId],
    join_code: generateJoinCode(),
    demo_mode: false,
    created_at: serverTimestamp(),
    status: "planning",
    github_repo: null,
    demo_url: null,
    pitch_deck_url: null,
    submission_deadline: null,
    hackathon_event: null,
  }

  await setDoc(projectRef, project)

  // Set role in background - don't wait
  setDoc(doc(db, "project_roles", `${projectRef.id}_${userId}`), {
    project_id: projectRef.id,
    user_id: userId,
    role: "admin",
  }).catch(() => { })

  // Create default milestones in background
  createDefaultMilestones(projectRef.id, deadline).catch(() => { })

  return projectRef.id
}

export async function getProject(projectId: string): Promise<Project | null> {
  try {
    const db = getDb()
    const projectDoc = await withTimeout(getDoc(doc(db, "projects", projectId)), 3000, null as any)
    if (!projectDoc || !projectDoc.exists?.()) return null
    const data = projectDoc.data()
    const created_at = data.created_at?.toDate?.() || new Date()

    // Migration: Calculate deadline from duration if missing
    let deadline = data.deadline?.toDate?.()
    if (!deadline && data.duration) {
      const durationHours = data.duration === "24h" ? 24 : 48
      deadline = new Date(created_at.getTime() + durationHours * 60 * 60 * 1000)
    }

    return {
      ...data,
      created_at,
      deadline: deadline || new Date(created_at.getTime() + 48 * 60 * 60 * 1000), // Fallback
    } as Project
  } catch (error) {
    console.error("Error getting project:", error)
    return null
  }
}

export async function getUserProjects(userId: string): Promise<Project[]> {
  try {
    const db = getDb()
    const q = query(collection(db, "projects"), where("members", "array-contains", userId))
    const snapshot = await withTimeout(getDocs(q), 3000, { docs: [] } as any)

    if (!snapshot.docs) return []

    const projects = snapshot.docs.map((doc: any) => {
      const data = doc.data()
      const created_at = data.created_at?.toDate?.() || new Date()

      // Migration: Calculate deadline from duration if missing
      let deadline = data.deadline?.toDate?.()
      if (!deadline && data.duration) {
        const durationHours = data.duration === "24h" ? 24 : 48
        deadline = new Date(created_at.getTime() + durationHours * 60 * 60 * 1000)
      }

      return {
        ...data,
        created_at,
        deadline: deadline || new Date(created_at.getTime() + 48 * 60 * 60 * 1000), // Fallback
      } as Project
    })

    return projects.sort((a: Project, b: Project) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  } catch (error) {
    console.error("Error getting user projects:", error)
    return []
  }
}

export async function joinProjectByCode(joinCode: string, userId: string): Promise<string | null> {
  try {
    const db = getDb()
    const q = query(collection(db, "projects"), where("join_code", "==", joinCode))

    // STEP 1: READ - Find the project
    console.log(`[Join] Searching for project with code: ${joinCode}`)
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      console.log(`[Join] No project found with code: ${joinCode}`)
      return null
    }

    const projectDoc = snapshot.docs[0]
    console.log(`[Join] Found project: ${projectDoc.id}`)

    // Check if user is already a member
    const projectData = projectDoc.data();
    if (projectData.members?.includes(userId)) {
      console.log(`[Join] User ${userId} is already a member`)
      return projectDoc.id;
    }

    // STEP 2: WRITE - Update membership
    console.log(`[Join] Attempting to add user ${userId} to project ${projectDoc.id}`)
    const batch = writeBatch(db)

    batch.update(doc(db, "projects", projectDoc.id), {
      members: arrayUnion(userId),
    })

    batch.set(doc(db, "project_roles", `${projectDoc.id}_${userId}`), {
      project_id: projectDoc.id,
      user_id: userId,
      role: "member",
    })

    await batch.commit()
    console.log(`[Join] Successfully joined project`)

    return projectDoc.id
  } catch (error) {
    console.error("Error joining project:", error)
    throw error // Re-throw so UI can see the actual error
  }
}

export async function updateProjectIdea(projectId: string, idea: Project["idea"]): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "projects", projectId), { idea })
}

export async function toggleDemoMode(projectId: string, enabled: boolean): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "projects", projectId), { demo_mode: enabled })
}

export async function updateDemoMode(projectId: string, enabled: boolean): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "projects", projectId), { demo_mode: enabled })
}

export async function updateProjectUrls(projectId: string, urls: { github_repo?: string; demo_url?: string; pitch_deck_url?: string }): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "projects", projectId), urls)
}

export async function updateProjectStatus(projectId: string, status: Project["status"]): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "projects", projectId), { status })
}

export async function deleteProject(projectId: string): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)

  // Delete all tasks
  try {
    const tasksQuery = query(collection(db, "tasks"), where("project_id", "==", projectId))
    const tasksSnapshot = await getDocs(tasksQuery)
    tasksSnapshot.docs.forEach((taskDoc) => {
      batch.delete(taskDoc.ref)
    })
  } catch (e) {
    console.error("Error deleting tasks:", e)
  }

  // Delete all chat messages
  try {
    const messagesQuery = query(collection(db, "messages"), where("project_id", "==", projectId))
    const messagesSnapshot = await getDocs(messagesQuery)
    messagesSnapshot.docs.forEach((msgDoc) => {
      batch.delete(msgDoc.ref)
    })
  } catch (e) {
    console.error("Error deleting messages:", e)
  }

  // Delete project
  batch.delete(doc(db, "projects", projectId))

  await batch.commit()
}

// Subscribe to project updates with error handling
export function subscribeToProject(projectId: string, callback: (project: Project | null) => void) {
  try {
    const db = getDb()
    return onSnapshot(
      doc(db, "projects", projectId),
      (doc) => {
        if (doc.exists()) {
          const data = doc.data()
          const created_at = data.created_at?.toDate?.() || new Date()

          // Migration: Calculate deadline from duration if missing
          let deadline = data.deadline?.toDate?.()
          if (!deadline && data.duration) {
            const durationHours = data.duration === "24h" ? 24 : 48
            deadline = new Date(created_at.getTime() + durationHours * 60 * 60 * 1000)
          }

          callback({
            ...data,
            created_at,
            deadline: deadline || new Date(created_at.getTime() + 48 * 60 * 60 * 1000), // Fallback
          } as Project)
        } else {
          callback(null)
        }
      },
      (error) => {
        console.error("Error subscribing to project:", error)
        callback(null)
      },
    )
  } catch {
    callback(null)
    return () => { }
  }
}

// Tasks
export async function createTask(task: Omit<Task, "task_id" | "last_updated">): Promise<string> {
  const db = getDb()
  const taskRef = doc(collection(db, "tasks"))

  // Filter out undefined values to avoid Firestore errors
  const cleanTask = Object.fromEntries(
    Object.entries({
      ...task,
      task_id: taskRef.id,
      last_updated: serverTimestamp(),
    }).filter(([_, value]) => value !== undefined)
  )

  await setDoc(taskRef, cleanTask)
  return taskRef.id
}

export async function addTask(task: Omit<Task, "task_id" | "last_updated">): Promise<Task | null> {
  try {
    const db = getDb()
    const taskRef = doc(collection(db, "tasks"))

    // Create the task data without undefined fields
    const taskData = {
      ...task,
      task_id: taskRef.id,
      last_updated: serverTimestamp(),
      created_at: serverTimestamp(),
      priority: task.priority || "Medium",
      time_spent: 0,
      dependencies: [],
      tags: [],
    }

    // Only add due_date if it's defined
    if (task.due_date !== undefined) {
      taskData.due_date = task.due_date
    }

    await setDoc(taskRef, taskData)

    // Return the task with client-side dates for immediate UI update
    const newTask = {
      ...task,
      task_id: taskRef.id,
      last_updated: new Date(),
      created_at: new Date(),
      priority: task.priority || "Medium",
      time_spent: 0,
      dependencies: [],
      tags: [],
    }

    return newTask as Task
  } catch (error) {
    console.error("Error adding task:", error)
    return null
  }
}

export async function createTasks(tasks: Omit<Task, "task_id" | "last_updated">[]): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)

  for (const task of tasks) {
    const taskRef = doc(collection(db, "tasks"))

    // Filter out undefined values to avoid Firestore errors
    const cleanTask = Object.fromEntries(
      Object.entries({
        ...task,
        task_id: taskRef.id,
        last_updated: serverTimestamp(),
      }).filter(([_, value]) => value !== undefined)
    )

    batch.set(taskRef, cleanTask)
  }

  await batch.commit()
}

export async function updateTask(taskId: string, updates: Partial<Task>): Promise<void> {
  const db = getDb()

  // Filter out undefined values to avoid Firestore errors
  const cleanUpdates = Object.fromEntries(
    Object.entries({
      ...updates,
      last_updated: serverTimestamp(),
    }).filter(([_, value]) => value !== undefined)
  )

  await updateDoc(doc(db, "tasks", taskId), cleanUpdates)
}

export async function deleteTask(taskId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, "tasks", taskId))
}

export function subscribeToTasks(projectId: string, callback: (tasks: Task[]) => void) {
  try {
    const db = getDb()
    const q = query(collection(db, "tasks"), where("project_id", "==", projectId))
    return onSnapshot(
      q,
      (snapshot) => {
        const tasks = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            ...data,
            last_updated: data.last_updated?.toDate?.() || new Date(),
          } as Task
        })
        tasks.sort((a, b) => new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime())
        callback(tasks)
      },
      (error) => {
        console.error("Error subscribing to tasks:", error)
        callback([])
      },
    )
  } catch {
    callback([])
    return () => { }
  }
}

// Chat Messages
export async function sendMessage(message: Omit<ChatMessage, "message_id" | "timestamp">): Promise<string> {
  const db = getDb()
  const msgRef = doc(collection(db, "messages"))
  await setDoc(msgRef, {
    ...message,
    message_id: msgRef.id,
    timestamp: serverTimestamp(),
  })
  return msgRef.id
}

export function subscribeToMessages(projectId: string, callback: (messages: ChatMessage[]) => void) {
  try {
    const db = getDb()
    const q = query(collection(db, "messages"), where("project_id", "==", projectId))
    return onSnapshot(
      q,
      (snapshot) => {
        const messages = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            ...data,
            timestamp: data.timestamp?.toDate?.() || new Date(),
          } as ChatMessage
        })
        messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        callback(messages)
      },
      (error) => {
        console.error("Error subscribing to messages:", error)
        callback([])
      },
    )
  } catch {
    callback([])
    return () => { }
  }
}

// Project Members
export async function getProjectMembers(memberIds: string[]): Promise<ProjectMember[]> {
  try {
    const db = getDb()
    const members: ProjectMember[] = []
    for (const id of memberIds) {
      try {
        const userDoc = await getDoc(doc(db, "users", id))
        if (userDoc.exists()) {
          members.push(userDoc.data() as ProjectMember)
        }
      } catch (e) {
        console.error("Error getting member:", e)
      }
    }
    return members
  } catch {
    return []
  }
}

export async function getUserRole(projectId: string, userId: string): Promise<"admin" | "member" | "viewer"> {
  try {
    const db = getDb()
    const roleDoc = await getDoc(doc(db, "project_roles", `${projectId}_${userId}`))
    if (roleDoc.exists()) {
      return roleDoc.data().role
    }
  } catch (e) {
    console.error("Error getting user role:", e)
  }
  return "viewer"
}

export function subscribeToProjectMembers(memberIds: string[], callback: (members: ProjectMember[]) => void) {
  try {
    const db = getDb()
    const unsubscribes: (() => void)[] = []
    const membersMap = new Map<string, ProjectMember>()

    memberIds.forEach((id) => {
      const unsub = onSnapshot(
        doc(db, "users", id),
        (doc) => {
          if (doc.exists()) {
            membersMap.set(id, doc.data() as ProjectMember)
            callback(Array.from(membersMap.values()))
          }
        },
        (error) => {
          console.error("Error subscribing to member:", error)
        },
      )
      unsubscribes.push(unsub)
    })

    return () => unsubscribes.forEach((unsub) => unsub())
  } catch {
    callback([])
    return () => { }
  }
}

// Milestones
export async function createMilestone(milestone: Omit<Milestone, "milestone_id" | "created_at">): Promise<string> {
  const db = getDb()
  const milestoneRef = doc(collection(db, "milestones"))
  await setDoc(milestoneRef, {
    ...milestone,
    milestone_id: milestoneRef.id,
    created_at: serverTimestamp(),
  })
  return milestoneRef.id
}

export async function updateMilestone(milestoneId: string, updates: Partial<Milestone>): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "milestones", milestoneId), updates)
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, "milestones", milestoneId))
}

export function subscribeToMilestones(projectId: string, callback: (milestones: Milestone[]) => void) {
  try {
    const db = getDb()
    const q = query(collection(db, "milestones"), where("project_id", "==", projectId))
    return onSnapshot(
      q,
      (snapshot) => {
        const milestones = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            ...data,
            deadline: data.deadline?.toDate?.() || new Date(),
            created_at: data.created_at?.toDate?.() || new Date(),
          } as Milestone
        })
        milestones.sort((a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime())
        callback(milestones)
      },
      (error) => {
        console.error("Error subscribing to milestones:", error)
        callback([])
      },
    )
  } catch {
    callback([])
    return () => { }
  }
}

// Schedule Events
export async function createScheduleEvent(event: Omit<ScheduleEvent, "event_id" | "created_at">): Promise<string> {
  const db = getDb()
  const eventRef = doc(collection(db, "schedule_events"))
  await setDoc(eventRef, {
    ...event,
    event_id: eventRef.id,
    start_time: event.start_time,
    end_time: event.end_time,
    created_at: serverTimestamp(),
  })
  return eventRef.id
}

export async function updateScheduleEvent(eventId: string, updates: Partial<ScheduleEvent>): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "schedule_events", eventId), updates)
}

export async function deleteScheduleEvent(eventId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, "schedule_events", eventId))
}

export function subscribeToScheduleEvents(projectId: string, userId: string, callback: (events: ScheduleEvent[]) => void) {
  try {
    const db = getDb()
    const q = query(
      collection(db, "schedule_events"),
      where("project_id", "==", projectId),
      where("user_id", "==", userId)
    )
    return onSnapshot(
      q,
      (snapshot) => {
        const events = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            ...data,
            start_time: data.start_time?.toDate?.() || new Date(),
            end_time: data.end_time?.toDate?.() || new Date(),
            created_at: data.created_at?.toDate?.() || new Date(),
          } as ScheduleEvent
        })
        events.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
        callback(events)
      },
      (error) => {
        console.error("Error subscribing to schedule events:", error)
        callback([])
      },
    )
  } catch {
    callback([])
    return () => { }
  }
}

// Wellness Settings
export async function saveWellnessSettings(settings: Omit<WellnessSettings, "created_at">): Promise<void> {
  const db = getDb()
  const settingsRef = doc(db, "wellness_settings", `${settings.project_id}_${settings.user_id}`)
  await setDoc(settingsRef, {
    ...settings,
    created_at: serverTimestamp(),
  })
}

export async function getWellnessSettings(projectId: string, userId: string): Promise<WellnessSettings | null> {
  try {
    const db = getDb()
    const settingsDoc = await getDoc(doc(db, "wellness_settings", `${projectId}_${userId}`))
    if (!settingsDoc.exists()) return null
    const data = settingsDoc.data()
    return {
      ...data,
      created_at: data.created_at?.toDate?.() || new Date(),
    } as WellnessSettings
  } catch (error) {
    console.error("Error getting wellness settings:", error)
    return null
  }
}

// Helper function to create default milestones for a project
export async function createDefaultMilestones(projectId: string, deadline: Date): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)
  const now = new Date()
  const totalDuration = deadline.getTime() - now.getTime()

  const milestones = [
    {
      name: "Idea Finalization",
      description: "Complete idea analysis and feature planning",
      type: "idea_submission" as const,
      deadline: new Date(now.getTime() + totalDuration * 0.2), // 20% through
    },
    {
      name: "Prototype Development",
      description: "Build working prototype with core features",
      type: "prototype" as const,
      deadline: new Date(now.getTime() + totalDuration * 0.7), // 70% through
    },
    {
      name: "Final Presentation",
      description: "Complete project and prepare final presentation",
      type: "final_presentation" as const,
      deadline: deadline, // End of hackathon
    },
  ]

  for (const milestone of milestones) {
    const milestoneRef = doc(collection(db, "milestones"))
    batch.set(milestoneRef, {
      ...milestone,
      milestone_id: milestoneRef.id,
      project_id: projectId,
      status: "upcoming",
      created_at: serverTimestamp(),
    })
  }

  await batch.commit()
}

// Shared Resources
export async function uploadResource(resource: Omit<SharedResource, "resource_id" | "created_at">): Promise<string> {
  const db = getDb()
  const resourceRef = doc(collection(db, "shared_resources"))

  // Filter out undefined values to avoid Firestore errors
  const cleanResource = Object.fromEntries(
    Object.entries({
      ...resource,
      resource_id: resourceRef.id,
      created_at: serverTimestamp(),
    }).filter(([_, value]) => value !== undefined)
  )

  await setDoc(resourceRef, cleanResource)
  return resourceRef.id
}

export async function getProjectResources(projectId: string): Promise<SharedResource[]> {
  try {
    const db = getDb()
    const q = query(collection(db, "shared_resources"), where("project_id", "==", projectId))
    const snapshot = await getDocs(q)
    return snapshot.docs.map(doc => ({
      ...doc.data(),
      created_at: doc.data().created_at?.toDate?.() || new Date(),
    } as SharedResource))
  } catch (error) {
    console.error("Error getting resources:", error)
    return []
  }
}

export function subscribeToResources(projectId: string, callback: (resources: SharedResource[]) => void) {
  try {
    const db = getDb()
    const q = query(collection(db, "shared_resources"), where("project_id", "==", projectId))
    return onSnapshot(q, (snapshot) => {
      const resources = snapshot.docs.map(doc => ({
        ...doc.data(),
        created_at: doc.data().created_at?.toDate?.() || new Date(),
      } as SharedResource))
      callback(resources)
    })
  } catch {
    callback([])
    return () => { }
  }
}

// Live Activity Feed
export async function addActivity(activity: Omit<LiveActivity, "activity_id" | "timestamp">): Promise<void> {
  const db = getDb()
  const activityRef = doc(collection(db, "live_activities"))

  // Filter out undefined values
  const cleanActivity = Object.fromEntries(
    Object.entries({
      ...activity,
      activity_id: activityRef.id,
      timestamp: serverTimestamp(),
    }).filter(([_, value]) => value !== undefined)
  )

  await setDoc(activityRef, cleanActivity)
}

export function subscribeToActivities(projectId: string, callback: (activities: LiveActivity[]) => void) {
  try {
    const db = getDb()
    const q = query(
      collection(db, "live_activities"),
      where("project_id", "==", projectId)
    )
    return onSnapshot(q, (snapshot) => {
      const activities = snapshot.docs.map(doc => ({
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate?.() || new Date(),
      } as LiveActivity))
      activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      callback(activities.slice(0, 50)) // Limit to 50 recent activities
    })
  } catch {
    callback([])
    return () => { }
  }
}

// Team Notifications
export async function createNotification(notification: Omit<TeamNotification, "notification_id" | "created_at">): Promise<void> {
  const db = getDb()
  const notificationRef = doc(collection(db, "team_notifications"))

  // Filter out undefined values
  const cleanNotification = Object.fromEntries(
    Object.entries({
      ...notification,
      notification_id: notificationRef.id,
      created_at: serverTimestamp(),
    }).filter(([_, value]) => value !== undefined)
  )

  await setDoc(notificationRef, cleanNotification)
}

export function subscribeToNotifications(projectId: string, userId: string, callback: (notifications: TeamNotification[]) => void) {
  try {
    const db = getDb()
    const q = query(
      collection(db, "team_notifications"),
      where("project_id", "==", projectId),
      where("user_id", "==", userId)
    )
    return onSnapshot(q, (snapshot) => {
      const notifications = snapshot.docs.map(doc => ({
        ...doc.data(),
        created_at: doc.data().created_at?.toDate?.() || new Date(),
      } as TeamNotification))
      notifications.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      callback(notifications)
    })
  } catch {
    callback([])
    return () => { }
  }
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const db = getDb()
  await updateDoc(doc(db, "team_notifications", notificationId), { read: true })
}

export async function deleteResource(resourceId: string): Promise<void> {
  const db = getDb()
  await deleteDoc(doc(db, "shared_resources", resourceId))
}

export async function removeMemberFromProject(projectId: string, userId: string): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)

  // Remove user from project members array
  const projectRef = doc(db, "projects", projectId)
  const projectDoc = await getDoc(projectRef)

  if (projectDoc.exists()) {
    const currentMembers = projectDoc.data().members || []
    const updatedMembers = currentMembers.filter((memberId: string) => memberId !== userId)

    batch.update(projectRef, { members: updatedMembers })
  }

  // Remove user's project role
  const roleRef = doc(db, "project_roles", `${projectId}_${userId}`)
  batch.delete(roleRef)

  await batch.commit()
}

// Whiteboard (tldraw)
// We treat each shape/record as a document in a subcollection
export function subscribeToWhiteboard(projectId: string, callback: (records: any[]) => void) {
  try {
    const db = getDb()
    const q = query(collection(db, "projects", projectId, "whiteboard"))

    return onSnapshot(q, (snapshot) => {
      const records = snapshot.docs.map(doc => doc.data())
      callback(records)
    })
  } catch {
    callback([])
    return () => { }
  }
}

export async function updateWhiteboardShapes(projectId: string, updates: {
  added?: Record<string, any>,
  updated?: Record<string, any>,
  removed?: Record<string, any>
}): Promise<void> {
  const db = getDb()
  const batch = writeBatch(db)
  const collectionRef = collection(db, "projects", projectId, "whiteboard")

  // Helper to remove undefined values recursively
  const cleanData = (data: any): any => {
    return JSON.parse(JSON.stringify(data))
  }

  // Handle Added
  if (updates.added) {
    Object.values(updates.added).forEach(record => {
      const docRef = doc(collectionRef, record.id)
      batch.set(docRef, cleanData(record))
    })
  }

  // Handle Updated
  if (updates.updated) {
    Object.values(updates.updated).forEach(record => {
      const docRef = doc(collectionRef, record.id)
      batch.update(docRef, cleanData(record))
    })
  }

  // Handle Removed
  if (updates.removed) {
    Object.values(updates.removed).forEach(record => {
      const docRef = doc(collectionRef, record.id)
      batch.delete(docRef)
    })
  }

  await batch.commit()
}

// Presence
export function subscribeToPresence(projectId: string, callback: (users: any[]) => void) {
  try {
    const db = getDb()
    // Retrieve presence updated in last 60 seconds (simulated by client filtering usually, or just all for now)
    const q = query(collection(db, "projects", projectId, "presence"))

    return onSnapshot(q, (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data())
      callback(users)
    })
  } catch (error) {
    console.error("Error subscribing to presence:", error)
    return () => { }
  }
}

export async function updatePresence(projectId: string, userId: string, presence: any) {
  try {
    const db = getDb()
    const docRef = doc(db, "projects", projectId, "presence", userId)
    // Ensure lastActive is server timestamp for validity checks
    await setDoc(docRef, { ...presence, lastActive: serverTimestamp() }, { merge: true })
  } catch (error) {
    // Silent fail for presence updates to avoid console spam
  }
}