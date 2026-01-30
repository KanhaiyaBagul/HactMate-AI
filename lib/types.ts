export interface Project {
  project_id: string
  name: string
  /** @deprecated Use deadline instead */
  duration?: "24h" | "48h"
  deadline: Date
  created_by: string
  members: string[]
  join_code: string
  demo_mode: boolean
  idea?: IdeaAnalysis
  created_at: Date
  hackathon_event?: string
  submission_deadline?: Date
  github_repo?: string
  demo_url?: string
  pitch_deck_url?: string
  status: "planning" | "development" | "testing" | "submitted" | "judging" | "completed"
}

export interface HackathonEvent {
  event_id: string
  name: string
  description: string
  start_date: Date
  end_date: Date
  theme: string
  max_team_size: number
  prizes: string[]
  rules: string[]
  organizer: string
  status: "upcoming" | "active" | "judging" | "completed"
}

export interface TeamAnalytics {
  total_tasks: number
  completed_tasks: number
  in_progress_tasks: number
  overdue_tasks: number
  total_hours_worked: number
  average_task_completion_time: number
  velocity: number // tasks completed per day
  burnout_risk: "low" | "medium" | "high"
  completion_prediction: number // percentage chance of finishing on time
}

export interface SharedResource {
  resource_id: string
  project_id: string
  name: string
  type: "file" | "link" | "note" | "image" | "document"
  uploaded_by: string
  created_at: Date
  tags: string[]
  url?: string
  content?: string
  size?: number
  file_type?: string
  original_name?: string
}

export interface LiveActivity {
  activity_id: string
  project_id: string
  user_id: string
  type: "task_update" | "file_upload" | "message" | "code_commit" | "status_change"
  description: string
  timestamp: Date
  metadata?: any
}

export interface TeamNotification {
  notification_id: string
  project_id: string
  user_id: string
  type: "task_assigned" | "deadline_reminder" | "blocker_alert" | "team_update"
  title: string
  message: string
  read: boolean
  created_at: Date
  action_url?: string
}

export interface Milestone {
  milestone_id: string
  project_id: string
  name: string
  description: string
  deadline: Date
  status: "upcoming" | "active" | "completed" | "overdue"
  type: "idea_submission" | "prototype" | "final_presentation" | "custom"
  created_at: Date
}

export interface ScheduleEvent {
  event_id: string
  project_id: string
  user_id: string
  title: string
  type: "work" | "break" | "sleep" | "meal" | "meeting" | "presentation"
  start_time: Date
  end_time: Date
  description?: string
  reminder_minutes?: number
  completed: boolean
  created_at: Date
}

export interface WellnessSettings {
  user_id: string
  project_id: string
  work_session_duration: number // minutes
  break_duration: number // minutes
  sleep_start_time: string // "22:00"
  sleep_end_time: string // "07:00"
  meal_times: {
    breakfast: string // "08:00"
    lunch: string // "13:00"
    dinner: string // "19:00"
  }
  burnout_prevention: boolean
  reminder_notifications: boolean
  created_at: Date
}

export interface Task {
  task_id: string
  project_id: string
  title: string
  description: string
  effort: "Low" | "Medium" | "High"
  status: "ToDo" | "InProgress" | "Done"
  assigned_to: string | null
  last_updated: Date
  created_at?: Date
  due_date?: Date
  priority: "Low" | "Medium" | "High" | "Critical"
  time_spent?: number // in minutes
  dependencies?: string[] // task_ids that must be completed first
  tags?: string[]
}

export interface ChatMessage {
  message_id: string
  project_id: string
  sender: string
  sender_type: "user" | "ai"
  content: string
  timestamp: Date
}

export interface IdeaAnalysis {
  problem_statement: string
  target_users: string[]
  features: string[]
  risks: string[]
  tech_stack_suggestions: string[]
}

export interface ProjectMember {
  user_id: string
  name: string
  email: string
  role: "lead" | "developer" | "designer" | "researcher" | "admin"
  skills: string[]
  online_status: boolean
  availability: "available" | "busy" | "offline"
  timezone?: string
  github_username?: string
  hours_worked?: number
  tasks_completed?: number
}
