"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ExternalLink,
  GitBranch,
  GitCommit,
  Users,
  Search,
  Filter,
  Loader2,
  Calendar,
  Check,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";

function formatDate(isoString) {
  if (!isoString) return "N/A";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateHeader(isoString) {
  if (!isoString) return "Earlier Commits";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "Earlier Commits";
  return d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 86400)}d ago`;
  return formatDate(isoString);
}

export default function RepositoryCommitsClient({
  repository,
  initialCommits = [],
  contributors = [],
  hasMoreCommits: initialHasMore = false,
}) {
  const [commits, setCommits] = useState(initialCommits);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAuthor, setSelectedAuthor] = useState("ALL");
  const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);

  // Filter commits based on search query and selected author
  const filteredCommits = useMemo(() => {
    return commits.filter((c) => {
      const matchesAuthor =
        selectedAuthor === "ALL" ||
        c.author?.toLowerCase() === selectedAuthor.toLowerCase();

      if (!matchesAuthor) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        c.message?.toLowerCase().includes(q) ||
        c.author?.toLowerCase().includes(q) ||
        c.sha?.toLowerCase().includes(q) ||
        c.shortSha?.toLowerCase().includes(q)
      );
    });
  }, [commits, selectedAuthor, searchQuery]);

  // Group commits by date header
  const groupedCommits = useMemo(() => {
    const groups = new Map();
    for (const commit of filteredCommits) {
      const dateKey = commit.committed_at
        ? formatDateHeader(commit.committed_at)
        : "Undated";
      const list = groups.get(dateKey) || [];
      list.push(commit);
      groups.set(dateKey, list);
    }
    return [...groups.entries()];
  }, [filteredCommits]);

  // Load more commits handler
  async function handleLoadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    const nextPage = page + 1;

    try {
      const authorParam = selectedAuthor !== "ALL" ? `&author=${encodeURIComponent(selectedAuthor)}` : "";
      const res = await fetch(
        `/api/repositories/${repository.id}/commits?page=${nextPage}&perPage=50${authorParam}`
      );
      if (!res.ok) throw new Error("Failed to load more commits");
      const data = await res.json();

      if (Array.isArray(data.commits)) {
        setCommits((prev) => {
          const existingShas = new Set(prev.map((c) => c.sha));
          const newUnique = data.commits.filter((c) => !existingShas.has(c.sha));
          return [...prev, ...newUnique];
        });
        setPage(nextPage);
        setHasMore(Boolean(data.hasMore && data.commits.length > 0));
      } else {
        setHasMore(false);
      }
    } catch (err) {
      console.error("[commits] failed to load more:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-transparent text-zinc-100 flex flex-col items-center overflow-x-hidden">
      <div className="relative z-10 w-full max-w-5xl px-4 sm:px-6 py-6 md:py-8 flex flex-col gap-6">

        {/* Top Navigation */}
        <div className="flex items-center justify-between">
          <Link
            href={`/repositories/${repository.id}`}
            className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-all py-2 px-3.5 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] group"
          >
            <ArrowLeft className="h-4 w-4 text-emerald-400 group-hover:-translate-x-0.5 transition-transform" />
            <span className="font-medium">Back to {repository.name}</span>
          </Link>
        </div>

        {/* Repository Header Card */}
        <div className="relative rounded-2xl border border-white/[0.12] bg-zinc-900/35 p-6 sm:p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <GitCommit className="h-4 w-4" />
                <span>Repository Commit History</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                <span className="text-zinc-400 font-normal">{repository.ownerLogin} /</span>
                <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                  {repository.name}
                </span>
              </h1>
              {repository.description && (
                <p className="text-xs sm:text-sm text-zinc-400 max-w-2xl mt-0.5">
                  {repository.description}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <HoverBorderGradient
                as="a"
                href={repository.githubUrl}
                target="_blank"
                rel="noreferrer noopener"
                containerClassName="rounded-xl"
                className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200 hover:text-white"
              >
                <span>Open in GitHub</span>
                <ExternalLink className="h-4 w-4 text-emerald-400" />
              </HoverBorderGradient>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="mt-5 flex flex-wrap items-center gap-3 pt-4 border-t border-white/[0.08] text-xs">
            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-zinc-300">
              <GitBranch className="h-3.5 w-3.5 text-emerald-400" />
              <span>Branch:</span>
              <span className="font-mono font-semibold text-white">{repository.defaultBranch}</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-zinc-300">
              <GitCommit className="h-3.5 w-3.5 text-emerald-400" />
              <span>Loaded Commits:</span>
              <span className="font-mono font-semibold text-white">{commits.length}</span>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-zinc-300">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <span>Contributors:</span>
              <span className="font-mono font-semibold text-white">{contributors.length}</span>
            </div>
          </div>
        </div>

        {/* Liquid Glass Controls Bar: Search & Contributor Filter */}
        <div className="rounded-2xl border border-white/[0.12] bg-zinc-900/35 p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_30px_rgba(0,0,0,0.4)] backdrop-blur-2xl flex flex-col sm:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter by message, author, or SHA..."
              className="w-full pl-10 pr-3 py-2 text-xs sm:text-sm rounded-xl border border-white/[0.1] bg-white/[0.04] text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 backdrop-blur-md transition-colors"
            />
          </div>

          {/* Contributor Filter Dropdown */}
          <div className="relative w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setAuthorDropdownOpen((v) => !v)}
              className="w-full sm:w-auto inline-flex items-center justify-between gap-2.5 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] px-3.5 py-2 text-xs sm:text-sm font-medium text-zinc-200 hover:text-white transition-all backdrop-blur-md"
            >
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-emerald-400" />
                <span>
                  {selectedAuthor === "ALL"
                    ? `All Contributors (${contributors.length})`
                    : `@${selectedAuthor}`}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-zinc-400" />
            </button>

            {authorDropdownOpen && (
              <div className="absolute right-0 mt-2 w-64 max-h-64 overflow-y-auto rounded-2xl border border-white/[0.18] bg-zinc-950/95 p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-2xl z-50 ring-1 ring-white/10 [scrollbar-width:thin]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedAuthor("ALL");
                    setAuthorDropdownOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-xs font-medium transition-colors ${
                    selectedAuthor === "ALL"
                      ? "bg-emerald-500/15 text-emerald-300 font-semibold"
                      : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-emerald-400" />
                    <span>All Contributors</span>
                  </span>
                  {selectedAuthor === "ALL" && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </button>

                <div className="my-1 border-t border-white/[0.06]" />

                {contributors.map((contrib) => {
                  const isSelected = selectedAuthor.toLowerCase() === (contrib.login || contrib.author).toLowerCase();
                  return (
                    <button
                      key={contrib.login || contrib.author}
                      type="button"
                      onClick={() => {
                        setSelectedAuthor(contrib.login || contrib.author);
                        setAuthorDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors ${
                        isSelected
                          ? "bg-emerald-500/15 text-emerald-300 font-semibold"
                          : "text-zinc-300 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {contrib.avatarUrl ? (
                          <Image
                            src={contrib.avatarUrl}
                            alt={contrib.login}
                            width={20}
                            height={20}
                            className="rounded-full border border-white/20 shrink-0"
                          />
                        ) : (
                          <div className="h-5 w-5 rounded-full bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-[10px] font-bold shrink-0">
                            {(contrib.login || contrib.author).charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="truncate">@{contrib.login || contrib.author}</span>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {contrib.commits}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Commits Timeline by Date */}
        {groupedCommits.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.12] bg-zinc-900/35 p-12 text-center shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
            <GitCommit className="h-10 w-10 text-zinc-600 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-zinc-200">No commits found</h3>
            <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">
              No commits matched your current filter or search criteria.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groupedCommits.map(([dateHeader, commitList]) => (
              <div key={dateHeader} className="flex flex-col gap-3">
                {/* Sticky Date Header */}
                <div className="sticky top-4 z-20 flex items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.12] bg-zinc-950/85 px-3 py-1 text-xs font-semibold text-zinc-300 backdrop-blur-xl shadow-lg ring-1 ring-white/10">
                    <Calendar className="h-3 w-3 text-emerald-400" />
                    <span>{dateHeader}</span>
                    <span className="ml-1 text-[10px] font-normal text-zinc-500">
                      ({commitList.length})
                    </span>
                  </div>
                  <div className="h-px flex-1 bg-white/[0.08]" />
                </div>

                {/* Commit Cards for this Date */}
                <div className="flex flex-col gap-2.5">
                  {commitList.map((commit) => (
                    <div
                      key={commit.sha}
                      className="group p-4 rounded-2xl border border-white/[0.08] bg-zinc-900/30 hover:bg-white/[0.06] hover:border-emerald-500/35 transition-all duration-200 backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.06)] flex flex-col gap-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Author Avatar */}
                          {commit.avatar_url ? (
                            <Image
                              src={commit.avatar_url}
                              alt={commit.author}
                              width={32}
                              height={32}
                              className="rounded-full border border-white/15 shrink-0 mt-0.5 ring-1 ring-white/10"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-xs font-bold text-emerald-400 shrink-0 mt-0.5">
                              {commit.author.charAt(0).toUpperCase()}
                            </div>
                          )}

                          <div className="min-w-0">
                            <p className="text-sm font-medium text-zinc-100 group-hover:text-white leading-snug break-words">
                              {commit.message}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-zinc-400">
                              <span className="font-semibold text-zinc-300">
                                @{commit.author}
                              </span>
                              <span>·</span>
                              <span>{formatRelativeTime(commit.committed_at)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Commit SHA Link */}
                        <div className="shrink-0">
                          {commit.url ? (
                            <a
                              href={commit.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="font-mono text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-1 rounded-xl transition-all inline-flex items-center gap-1.5 hover:bg-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                              title={`View commit ${commit.sha} on GitHub`}
                            >
                              <span>{commit.shortSha}</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            <span className="font-mono text-xs text-zinc-400 bg-white/[0.06] border border-white/[0.08] px-2.5 py-1 rounded-xl">
                              {commit.shortSha}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Load More Button */}
        {hasMore && (
          <div className="mt-4 flex justify-center pb-8">
            <button
              type="button"
              disabled={loading}
              onClick={handleLoadMore}
              className="inline-flex items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 hover:text-emerald-200 font-semibold text-sm px-6 py-3 shadow-[0_0_25px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
                  <span>Loading additional commits...</span>
                </>
              ) : (
                <>
                  <GitCommit className="h-4 w-4 text-emerald-400" />
                  <span>Load More Commits</span>
                </>
              )}
            </button>
          </div>
        )}

        {!hasMore && commits.length > 0 && (
          <div className="py-6 text-center text-xs text-zinc-500">
            All available repository commits loaded ({commits.length} total)
          </div>
        )}

      </div>
    </div>
  );
}
