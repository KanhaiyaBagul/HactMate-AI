"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signInAnonymously,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
  updatePassword,
} from "firebase/auth"
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore"
import { getFirebaseAuth, getFirebaseDb } from "./firebase"

export interface UserProfile {
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
  created_at?: Date
}

interface AuthContextType {
  user: User | null
  userProfile: UserProfile | null
  loading: boolean
  signInWithEmail: (email: string, password: string) => Promise<void>
  signUpWithEmail: (email: string, password: string, name: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInAsGuest: () => Promise<void>
  logout: () => Promise<void>
  updateUserSkills: (skills: string[]) => Promise<void>
  updateUserProfile: (updates: Partial<UserProfile>) => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updateUserPassword: (password: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function createDefaultProfile(user: User): UserProfile {
  return {
    user_id: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "User",
    email: user.email || "",
    role: "developer",
    skills: [],
    online_status: true,
    availability: "available",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    hours_worked: 0,
    tasks_completed: 0,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const auth = getFirebaseAuth()
    const db = getFirebaseDb()

    if (!auth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user)

      if (user) {
        const defaultProfile = createDefaultProfile(user)
        setUserProfile(defaultProfile)
        setLoading(false)

        // Try to fetch real profile in background (non-blocking)
        if (db) {
          try {
            const profileDoc = await getDoc(doc(db, "users", user.uid))
            if (profileDoc.exists()) {
              setUserProfile(profileDoc.data() as UserProfile)
            }
          } catch (error) {
            // Silently fail - we already have default profile
          }
        }
      } else {
        setUserProfile(null)
        setLoading(false)
      }
    })

    return () => unsubscribe()
  }, [])

  const createUserProfile = async (user: User, name: string, isGuest = false) => {
    const db = getFirebaseDb()
    const profile: UserProfile = {
      user_id: user.uid,
      name: name || (isGuest ? `Guest_${user.uid.slice(0, 6)}` : "User"),
      email: user.email || "",
      role: "developer",
      skills: [],
      online_status: true,
      availability: "available",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      hours_worked: 0,
      tasks_completed: 0,
    }
    setUserProfile(profile)

    if (db) {
      setDoc(doc(db, "users", user.uid), {
        ...profile,
        created_at: serverTimestamp(),
      }).catch(() => { })
    }
  }

  const signInWithEmail = async (email: string, password: string) => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error("Auth not initialized")
    await signInWithEmailAndPassword(auth, email, password)
  }

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error("Auth not initialized")
    const result = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(result.user, { displayName: name })
    await createUserProfile(result.user, name)
  }

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuth()
    const db = getFirebaseDb()
    if (!auth) throw new Error("Auth not initialized")

    const provider = new GoogleAuthProvider()
    const result = await signInWithPopup(auth, provider)

    if (db) {
      try {
        const profileDoc = await getDoc(doc(db, "users", result.user.uid))
        if (!profileDoc.exists()) {
          await createUserProfile(result.user, result.user.displayName || "User")
        } else {
          setUserProfile(profileDoc.data() as UserProfile)
        }
      } catch {
        await createUserProfile(result.user, result.user.displayName || "User")
      }
    } else {
      await createUserProfile(result.user, result.user.displayName || "User")
    }
  }

  const signInAsGuest = async () => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error("Auth not initialized")
    const result = await signInAnonymously(auth)
    await createUserProfile(result.user, "", true)
  }

  const logout = async () => {
    const auth = getFirebaseAuth()
    const db = getFirebaseDb()
    if (!auth) return

    if (user && db) {
      setDoc(doc(db, "users", user.uid), { online_status: false }, { merge: true }).catch(() => { })
    }
    await signOut(auth)
    setUser(null)
    setUserProfile(null)
  }

  const updateUserSkills = async (skills: string[]) => {
    const db = getFirebaseDb()
    if (user) {
      setUserProfile((prev) => (prev ? { ...prev, skills } : null))
      if (db) {
        setDoc(doc(db, "users", user.uid), { skills }, { merge: true }).catch(() => { })
      }
    }
  }

  const updateUserProfile = async (updates: Partial<UserProfile>) => {
    const db = getFirebaseDb()
    if (user) {
      setUserProfile((prev) => (prev ? { ...prev, ...updates } : null))
      if (db) {
        setDoc(doc(db, "users", user.uid), updates, { merge: true }).catch(() => { })
      }
    }
  }

  const resetPassword = async (email: string) => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error("Auth not initialized")
    await sendPasswordResetEmail(auth, email)
  }

  const updateUserPassword = async (password: string) => {
    if (!user) throw new Error("No user logged in")
    await updatePassword(user, password)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInAsGuest,
        logout,
        updateUserSkills,
        updateUserProfile,
        resetPassword,
        updateUserPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
