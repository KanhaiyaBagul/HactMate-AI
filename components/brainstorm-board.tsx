"use client"

import { useEffect, useState, useRef } from "react"
import { Tldraw, useEditor, createTLStore, defaultShapeUtils, TLRecord } from "tldraw"
import "tldraw/tldraw.css"
import { subscribeToWhiteboard, updateWhiteboardShapes, subscribeToPresence, updatePresence } from "@/lib/firestore"
import { Loader2, Cloud, CloudOff, MousePointer2 } from "lucide-react"
import { useAuth } from "@/lib/auth-context"

interface BrainstormBoardProps {
    projectId: string
    readOnly?: boolean
}

// -----------------------------------------------------------------------------
// Live Cursors Component (Must be inside Tldraw context)
// -----------------------------------------------------------------------------
function CollaborativeCursors({ projectId }: { projectId: string }) {
    const editor = useEditor()
    const { user, userProfile } = useAuth()
    const [otherUsers, setOtherUsers] = useState<any[]>([])
    const lastBroadcastRef = useRef<number>(0)

    // 1. Subscribe to other users' presence
    useEffect(() => {
        const unsubscribe = subscribeToPresence(projectId, (users) => {
            if (!user) return

            // Filter out self and inactive users (inactive > 60s)
            // Note: firestore timestamps need conversion, handling both Date and Timestamp
            const activeUsers = users.filter(u => {
                if (u.userId === user.uid) return false

                // Safety check for timestamps
                const lastActive = u.lastActive?.toMillis ? u.lastActive.toMillis() :
                    u.lastActive?.getTime ? u.lastActive.getTime() : Date.now()

                return Date.now() - lastActive < 60000 // 1 minute timeout
            })

            setOtherUsers(activeUsers)
        })

        return () => unsubscribe()
    }, [projectId, user])

    // 2. Broadcast my presence (Throttled ~100ms)
    useEffect(() => {
        if (!user || !editor) return

        const broadcastInterval = setInterval(() => {
            const now = Date.now()
            if (now - lastBroadcastRef.current < 100) return

            const { x, y } = editor.inputs.currentPagePoint
            // Only update if on canvas (roughly)
            // Using a simple check if x,y are valid numbers
            if (!Number.isNaN(x) && !Number.isNaN(y)) {
                updatePresence(projectId, user.uid, {
                    userId: user.uid,
                    userName: userProfile?.name || user.email?.split('@')[0] || "Anon",
                    color: "#3b82f6", // Default blue for now, can randomize later
                    x: Math.round(x), // round to save bytes
                    y: Math.round(y)
                })
                lastBroadcastRef.current = now
            }
        }, 100)

        return () => clearInterval(broadcastInterval)
    }, [projectId, user, userProfile, editor])

    if (!editor) return null

    return (
        <>
            {otherUsers.map((u) => {
                // Convert Page (Canvas) Coordinates -> Screen (Viewport) Coordinates
                const screenPoint = editor.pageToViewport({ x: u.x, y: u.y })

                // Hide if outside viewport (optional optimization)
                // if (screenPoint.x < 0 || screenPoint.y < 0 ...) 

                return (
                    <div
                        key={u.userId}
                        className="absolute pointer-events-none flex flex-col items-start z-[99999]"
                        style={{
                            transform: `translate(${screenPoint.x}px, ${screenPoint.y}px)`,
                            transition: "transform 120ms linear", // smooth interpolation
                        }}
                    >
                        <MousePointer2
                            className="h-5 w-5 fill-current"
                            style={{ color: u.color || "#ef4444" }}
                        />
                        <span
                            className="ml-4 -mt-2 px-2 py-0.5 text-[10px] font-bold text-white rounded-full shadow-sm whitespace-nowrap"
                            style={{ backgroundColor: u.color || "#ef4444" }}
                        >
                            {u.userName}
                        </span>
                    </div>
                )
            })}
        </>
    )
}

// -----------------------------------------------------------------------------
// Main Board Component
// -----------------------------------------------------------------------------
export function BrainstormBoard({ projectId, readOnly = false }: BrainstormBoardProps) {
    const [store] = useState(() => createTLStore({ shapeUtils: defaultShapeUtils }))
    const [loading, setLoading] = useState(true)
    const [syncStatus, setSyncStatus] = useState<"synced" | "syncing" | "error">("synced")

    // 1. Subscribe to Firestore and update local store
    useEffect(() => {
        console.log(`[Brainstorm] Subscribing to whiteboard for project: ${projectId}`)
        const unsubscribe = subscribeToWhiteboard(projectId, (records) => {
            if (records.length > 0) {
                store.mergeRemoteChanges(() => {
                    const changes = {
                        added: {} as Record<string, TLRecord>,
                        updated: {} as Record<string, TLRecord>,
                        removed: {} as Record<string, TLRecord>,
                    }

                    records.forEach((record: any) => {
                        changes.added[record.id] = record
                    })

                    store.put(Object.values(changes.added))
                })
            }
            // Always stop loading after first update (even if empty)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [projectId, store])

    // 2. Listen to local changes and push to Firestore
    useEffect(() => {
        if (readOnly) return

        const cleanup = store.listen(
            async ({ changes }) => {
                setSyncStatus("syncing")
                try {
                    // Tldraw 'updated' changes are [prev, next] tuples. We need 'next'.
                    const updatedRecords: Record<string, TLRecord> = {}
                    Object.values(changes.updated).forEach((change) => {
                        // change is [prev, next], but let's be safe with casting
                        const next = (change as unknown as [TLRecord, TLRecord])[1]
                        if (next) {
                            updatedRecords[next.id] = next
                        }
                    })

                    await updateWhiteboardShapes(projectId, {
                        added: changes.added,
                        updated: updatedRecords,
                        removed: changes.removed,
                    })
                    setSyncStatus("synced")
                } catch (error) {
                    console.error("Sync error:", error)
                    setSyncStatus("error")
                }
            },
            { source: "user", scope: "document" }
        )

        return () => cleanup()
    }, [projectId, store, readOnly])

    return (
        <div className="h-[600px] w-full relative border rounded-xl overflow-hidden bg-white">
            <div className="absolute top-2 right-2 z-50 flex items-center gap-2 px-3 py-1.5 bg-background/80 backdrop-blur border rounded-full text-xs shadow-sm select-none pointer-events-none">
                {loading ? (
                    <>
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        <span className="text-muted-foreground">Connecting...</span>
                    </>
                ) : (
                    <>
                        {syncStatus === "syncing" && (
                            <>
                                <Cloud className="h-3 w-3 animate-pulse text-blue-500" />
                                <span className="text-blue-500 font-medium">Saving...</span>
                            </>
                        )}
                        {syncStatus === "synced" && (
                            <>
                                <Cloud className="h-3 w-3 text-green-500" />
                                <span className="text-muted-foreground">Live</span>
                            </>
                        )}
                        {syncStatus === "error" && (
                            <>
                                <CloudOff className="h-3 w-3 text-red-500" />
                                <span className="text-red-500">Offline</span>
                            </>
                        )}
                    </>
                )}
            </div>

            <Tldraw store={store}>
                {!readOnly && <CollaborativeCursors projectId={projectId} />}
            </Tldraw>
        </div>
    )
}
