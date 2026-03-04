"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { motion } from "framer-motion"
import { MessageCircle, X, Send, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { subscribeToTeamMessages, sendTeamMessage } from "@/lib/firestore"
import type { TeamMessage, ProjectMember } from "@/lib/types"
import { cn } from "@/lib/utils"

interface TeamChatProps {
    projectId: string
    currentUser: { uid: string; name: string }
    members: ProjectMember[]
}

const PANEL_W = 320
const PANEL_H = 480
const PILL_H = 44
const STORAGE_KEY = "hackmate-chat-pos"

function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

function getAvatarColor(name: string): string {
    const colors = ["bg-blue-500", "bg-emerald-500", "bg-violet-500", "bg-orange-500", "bg-pink-500", "bg-cyan-500", "bg-amber-500"]
    return colors[name.charCodeAt(0) % colors.length]
}

function clamp(val: number, min: number, max: number) {
    return Math.max(min, Math.min(val, max))
}

function getDefaultPosition(isOpen: boolean) {
    const h = isOpen ? PANEL_H : PILL_H
    return {
        x: window.innerWidth - PANEL_W - 24,
        y: window.innerHeight - h - 24,
    }
}

function loadPosition(isOpen: boolean) {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (raw) {
            const pos = JSON.parse(raw)
            const h = isOpen ? PANEL_H : PILL_H
            return {
                x: clamp(pos.x, 8, window.innerWidth - PANEL_W - 8),
                y: clamp(pos.y, 8, window.innerHeight - h - 8),
            }
        }
    } catch { /* ignore */ }
    return getDefaultPosition(isOpen)
}

export function TeamChat({ projectId, currentUser, members }: TeamChatProps) {
    const [isOpen, setIsOpen] = useState(false)
    const [messages, setMessages] = useState<TeamMessage[]>([])
    const [input, setInput] = useState("")
    const [isSending, setIsSending] = useState(false)
    const [unreadCount, setUnreadCount] = useState(0)
    const [hasMounted, setHasMounted] = useState(false)
    const [pos, setPos] = useState({ x: 0, y: 0 })
    const dragMoved = useRef(false) // track if pointer actually moved (drag vs click)

    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const lastSeenRef = useRef(0)

    useEffect(() => {
        setPos(loadPosition(false))
        setHasMounted(true)
    }, [])

    useEffect(() => {
        const unsub = subscribeToTeamMessages(projectId, (msgs) => {
            setMessages(msgs)
            if (!isOpen) {
                const n = msgs.length - lastSeenRef.current
                if (n > 0) setUnreadCount(n)
            }
        })
        return () => unsub()
    }, [projectId, isOpen])

    useEffect(() => {
        if (isOpen && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages, isOpen])

    useEffect(() => {
        if (isOpen) {
            lastSeenRef.current = messages.length
            setUnreadCount(0)
            setTimeout(() => inputRef.current?.focus(), 150)
        }
    }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

    const onlineCount = members.filter(m => m.online_status || m.availability === "available").length

    const handleSend = useCallback(async () => {
        const text = input.trim()
        if (!text || isSending) return
        setInput("")
        setIsSending(true)
        try {
            await sendTeamMessage(projectId, {
                sender_id: currentUser.uid,
                sender_name: currentUser.name,
                sender_initial: currentUser.name.charAt(0).toUpperCase(),
                content: text,
            })
        } catch { setInput(text) }
        finally { setIsSending(false) }
    }, [input, isSending, projectId, currentUser])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend() }
    }

    const groupedMessages = messages.map((msg, i) => ({
        ...msg,
        isFirstInGroup: i === 0 || messages[i - 1].sender_id !== msg.sender_id,
    }))

    if (!hasMounted) return null

    const panelH = isOpen ? PANEL_H : PILL_H

    return (
        <motion.div
            drag
            dragMomentum={false}
            dragElastic={0}
            dragConstraints={{
                left: 8,
                top: 8,
                right: window.innerWidth - PANEL_W - 8,
                bottom: window.innerHeight - panelH - 8,
            }}
            onDragStart={() => { dragMoved.current = false }}
            onDrag={(_, info) => {
                if (Math.abs(info.offset.x) > 5 || Math.abs(info.offset.y) > 5) {
                    dragMoved.current = true
                }
            }}
            onDragEnd={(_, info) => {
                const newPos = {
                    x: clamp(pos.x + info.offset.x, 8, window.innerWidth - PANEL_W - 8),
                    y: clamp(pos.y + info.offset.y, 8, window.innerHeight - panelH - 8),
                }
                setPos(newPos)
                localStorage.setItem(STORAGE_KEY, JSON.stringify(newPos))
                setTimeout(() => { dragMoved.current = false }, 100)
            }}
            onPointerDown={(e) => e.stopPropagation()}
            className="z-50 select-none"
            style={{ width: PANEL_W, position: "fixed", top: 0, left: 0, x: pos.x, y: pos.y }}
        >
            {isOpen ? (
                /* ─── Expanded Panel ─── */
                <div
                    className="flex flex-col bg-card border shadow-2xl rounded-2xl overflow-hidden"
                    style={{ height: PANEL_H }}
                >
                    {/* Header — shows drag cursor */}
                    <div className="flex items-center justify-between px-4 py-3 bg-primary text-primary-foreground shrink-0 cursor-grab active:cursor-grabbing">
                        <div className="flex items-center gap-2 pointer-events-none">
                            <MessageCircle className="h-4 w-4" />
                            <span className="font-semibold text-sm">Team Chat</span>
                            {onlineCount > 0 && (
                                <span className="text-xs opacity-75 flex items-center gap-1">
                                    <span className="h-1.5 w-1.5 rounded-full bg-green-400 inline-block" />
                                    {onlineCount} online
                                </span>
                            )}
                        </div>
                        <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-primary-foreground hover:bg-primary-foreground/20 rounded-full pointer-events-auto"
                            onClick={(e) => { e.stopPropagation(); setIsOpen(false) }}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    {/* Messages */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-y-auto px-3 py-3 space-y-1"
                        onPointerDown={(e) => e.stopPropagation()} // scroll area should NOT drag the widget
                    >
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground px-6 gap-2">
                                <MessageCircle className="h-8 w-8 opacity-20" />
                                <p className="text-sm font-medium">Team Chat</p>
                                <p className="text-xs opacity-60">Say hi to your team!</p>
                            </div>
                        ) : (
                            groupedMessages.map((msg) => {
                                const isSelf = msg.sender_id === currentUser.uid
                                return (
                                    <div key={msg.message_id} className={cn("flex items-end gap-2", isSelf ? "flex-row-reverse" : "flex-row", msg.isFirstInGroup ? "mt-3" : "mt-0.5")}>
                                        {!isSelf && (
                                            <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0", msg.isFirstInGroup ? "opacity-100" : "opacity-0", getAvatarColor(msg.sender_name))}>
                                                {msg.sender_initial}
                                            </div>
                                        )}
                                        <div className={cn("flex flex-col gap-0.5 max-w-[75%]", isSelf ? "items-end" : "items-start")}>
                                            {!isSelf && msg.isFirstInGroup && (
                                                <span className="text-[10px] text-muted-foreground px-1">{msg.sender_name}</span>
                                            )}
                                            <div className={cn("px-3 py-1.5 text-sm leading-relaxed break-words", isSelf ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm" : "bg-muted text-foreground rounded-2xl rounded-bl-sm")}>
                                                {msg.content}
                                            </div>
                                            {msg.isFirstInGroup && (
                                                <span className="text-[10px] text-muted-foreground px-1">{formatTime(msg.timestamp)}</span>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* Input */}
                    <div
                        className="px-3 py-2.5 border-t bg-card shrink-0 flex gap-2 items-center"
                        onPointerDown={(e) => e.stopPropagation()} // input should NOT drag the widget
                    >
                        <Input
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Message team..."
                            className="h-8 text-sm rounded-full bg-muted border-0 focus-visible:ring-1"
                            disabled={isSending}
                            maxLength={500}
                        />
                        <Button
                            size="icon"
                            className="h-8 w-8 rounded-full shrink-0"
                            onClick={handleSend}
                            disabled={!input.trim() || isSending}
                        >
                            <Send className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
            ) : (
                /* ─── Collapsed Pill ─── */
                <div className="relative">
                    <div
                        className="flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg bg-primary text-primary-foreground text-sm font-medium cursor-grab active:cursor-grabbing"
                        onClick={() => {
                            // Only open if it wasn't a drag
                            if (!dragMoved.current) setIsOpen(true)
                        }}
                    >
                        <MessageCircle className="h-4 w-4" />
                        <span>Team Chat</span>
                        {onlineCount > 0 && (
                            <span className="flex items-center gap-1 text-xs opacity-80">
                                <Users className="h-3 w-3" />
                                {onlineCount}
                            </span>
                        )}
                    </div>

                    {unreadCount > 0 && (
                        <span className="absolute -top-1.5 -right-1.5 h-5 min-w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1 pointer-events-none">
                            {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                    )}
                </div>
            )}
        </motion.div>
    )
}
