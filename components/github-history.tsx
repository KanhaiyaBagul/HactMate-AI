"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Loader2, Github, GitCommit, ExternalLink, AlertTriangle } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"

interface Commit {
    sha: string
    message: string
    author: {
        name: string
        date: string
        avatar_url?: string
    }
    html_url: string
}

interface GithubHistoryProps {
    repoUrl?: string
}

function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(mins / 60)
    const days = Math.floor(hours / 24)
    if (mins < 1) return "just now"
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 30) return `${days}d ago`
    return new Date(dateStr).toLocaleDateString()
}

export function GithubHistory({ repoUrl }: GithubHistoryProps) {
    const [commits, setCommits] = useState<Commit[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!repoUrl) return
        const fetchCommits = async () => {
            setLoading(true)
            setError(null)
            try {
                const res = await fetch(`/api/github/commits?url=${encodeURIComponent(repoUrl)}`)
                const data = await res.json()
                if (!res.ok) throw new Error(data.error || "Failed to fetch commits")
                setCommits(data.commits)
            } catch (err: any) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        fetchCommits()
    }, [repoUrl])

    if (!repoUrl) {
        return (
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <Github className="h-12 w-12 mb-4 text-muted-foreground opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">No Repository Linked</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        Connect a GitHub repository in the Team tab to view commit history.
                    </p>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="flex flex-col" style={{ height: "calc(100vh - 280px)", minHeight: 400 }}>
            <CardHeader className="pb-3 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Github className="h-4 w-4" />
                            Commit History
                            {commits.length > 0 && (
                                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                    {commits.length}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="text-xs line-clamp-1">
                            {repoUrl.replace("https://github.com/", "")}
                        </CardDescription>
                    </div>
                    <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                        <a href={repoUrl} target="_blank" rel="noopener noreferrer">
                            View Repo <ExternalLink className="ml-1.5 h-3 w-3" />
                        </a>
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="flex-1 overflow-hidden p-0">
                {loading ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                        <p className="text-xs text-muted-foreground">Loading commits...</p>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 gap-3">
                        <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-destructive">Unable to load commits</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-sm">{error}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                            Try Again
                        </Button>
                    </div>
                ) : commits.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-2">
                        <GitCommit className="h-8 w-8 text-muted-foreground opacity-40" />
                        <p className="text-sm text-muted-foreground">No commits found in the last 90 days.</p>
                    </div>
                ) : (
                    <ScrollArea className="h-full">
                        <div className="divide-y">
                            {commits.map((commit) => (
                                <div
                                    key={commit.sha}
                                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors group"
                                >
                                    {/* Avatar */}
                                    {commit.author.avatar_url ? (
                                        <img
                                            src={commit.author.avatar_url}
                                            alt={commit.author.name}
                                            className="h-6 w-6 rounded-full border shrink-0"
                                        />
                                    ) : (
                                        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary border shrink-0">
                                            {commit.author.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}

                                    {/* Main content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[11px] font-semibold shrink-0 text-foreground">
                                                {commit.author.name}
                                            </span>
                                            <span className="text-[11px] text-muted-foreground truncate">
                                                {commit.message.split("\n")[0]}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Right side: SHA + time + link */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge
                                            variant="secondary"
                                            className="font-mono text-[10px] h-4 px-1.5 hidden sm:flex"
                                        >
                                            {commit.sha.substring(0, 7)}
                                        </Badge>
                                        <span className="text-[10px] text-muted-foreground w-14 text-right">
                                            {relativeTime(commit.author.date)}
                                        </span>
                                        <a
                                            href={commit.html_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-primary"
                                            title="View commit"
                                        >
                                            <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    )
}
