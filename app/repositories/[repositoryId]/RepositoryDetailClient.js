"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  GitFork,
  Star,
  CircleDot,
  GitBranch,
  Calendar,
  Clock,
  Shield,
  Users,
  GitCommit,
  TrendingUp,
  Award,
  Layers,
  Search,
  Sparkles,
} from "lucide-react";
import { RepoCommitHeatmap } from "@/components/repository/repo-commit-heatmap";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { formatUtcDay } from "@/lib/repo-insights";

function formatDate(isoString) {
  if (!isoString) return "N/A";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-US", {
    month: "short",
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

// Common language colors with liquid glass vibrance
const LANGUAGE_COLORS = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  Rust: "#dea584",
  Go: "#00ADD8",
  Java: "#b07219",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Vue: "#41b883",
  Kotlin: "#A97BFF",
  Swift: "#F05138",
};

export default function RepositoryDetailClient({
  repository,
  insights,
  contributors = [],
  languages = {},
}) {
  const languageList = Object.entries(languages);
  const totalLanguageBytes = languageList.reduce((acc, [, bytes]) => acc + bytes, 0);

  // Search filter for contributors when there are many
  const [contributorSearch, setContributorSearch] = useState("");
  const filteredContributors = useMemo(() => {
    if (!contributorSearch.trim()) return contributors;
    const query = contributorSearch.toLowerCase().trim();
    return contributors.filter(
      (c) =>
        c.login?.toLowerCase().includes(query) ||
        c.author?.toLowerCase().includes(query) ||
        c.name?.toLowerCase().includes(query)
    );
  }, [contributors, contributorSearch]);

  // Limit recent commits div to latest 3 commits
  const displayedCommits = (insights?.recentCommits ?? []).slice(0, 3);
  const totalCommitsCount =
    insights?.totalCommitsAllTime ??
    insights?.totalCommits ??
    repository.commits?.length ??
    0;

  return (
    <div className="relative min-h-screen bg-transparent text-zinc-100 flex flex-col items-center overflow-x-hidden">
      <div className="relative z-10 w-full max-w-6xl px-4 sm:px-6 py-6 md:py-8 flex flex-col gap-6">

        {/* Top Navigation Bar */}
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-all py-2 px-3.5 rounded-xl border border-white/[0.12] bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.12)] group"
          >
            <ArrowLeft className="h-4 w-4 text-green-500 group-hover:-translate-x-0.5 transition-transform" />
            <span className="font-medium">Back to Dashboard</span>
          </Link>
        </div>

        {/* Repository Header / Overview Card in Liquid Glass */}
        <div className="relative rounded-2xl border border-white/[0.12] bg-zinc-900/35 p-6 sm:p-7 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
                  <span className="text-zinc-400 font-normal">{repository.ownerLogin} /</span>
                  <span className="bg-gradient-to-r from-white via-zinc-200 to-zinc-400 bg-clip-text text-transparent">
                    {repository.name}
                  </span>
                </h1>

                {/* Badges in Liquid Glass Pill Style */}
                <span className="rounded-full border border-white/[0.12] bg-white/[0.05] px-3 py-0.5 text-xs font-medium text-zinc-300 backdrop-blur-md shadow-sm">
                  {repository.private ? "Private" : "Public"}
                </span>
                {repository.isFork && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-0.5 text-xs font-medium text-amber-300 backdrop-blur-md shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                    Fork
                  </span>
                )}
                {repository.isContributor && (
                  <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-0.5 text-xs font-medium text-purple-300 backdrop-blur-md shadow-[0_0_12px_rgba(168,85,247,0.2)]">
                    Contributor
                  </span>
                )}
                {repository.archived && (
                  <span className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-0.5 text-xs font-medium text-red-300 backdrop-blur-md">
                    Archived
                  </span>
                )}
              </div>

              {repository.description && (
                <p className="text-sm text-zinc-400 max-w-3xl leading-relaxed mt-0.5">
                  {repository.description}
                </p>
              )}
            </div>

            {/* Open on GitHub Button with HoverBorderGradient */}
            <div className="shrink-0">
              <HoverBorderGradient
                as="a"
                href={repository.githubUrl}
                target="_blank"
                rel="noreferrer noopener"
                containerClassName="rounded-xl"
                className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-zinc-200 hover:text-white"
              >
                <span>Open in GitHub</span>
                <ExternalLink className="h-4 w-4 text-green-500" />
              </HoverBorderGradient>
            </div>
          </div>

          {/* Metadata Highlights Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-y-3 gap-x-6 text-xs text-zinc-400">
            {repository.language && (
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shadow-sm"
                  style={{
                    backgroundColor: LANGUAGE_COLORS[repository.language] || "#22c55e",
                    boxShadow: `0 0 8px ${LANGUAGE_COLORS[repository.language] || "#22c55e"}66`,
                  }}
                />
                <span className="font-semibold text-zinc-200">{repository.language}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5" title="Stars">
              <Star className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-zinc-300 font-medium">{repository.starsCount.toLocaleString()} stars</span>
            </div>

            <div className="flex items-center gap-1.5" title="Forks">
              <GitFork className="h-3.5 w-3.5 text-zinc-400" />
              <span>{repository.forksCount.toLocaleString()} forks</span>
            </div>

            <div className="flex items-center gap-1.5" title="Open Issues">
              <CircleDot className="h-3.5 w-3.5 text-zinc-400" />
              <span>{repository.openIssuesCount.toLocaleString()} open issues</span>
            </div>

            {repository.defaultBranch && (
              <div className="flex items-center gap-1.5" title="Default Branch">
                <GitBranch className="h-3.5 w-3.5 text-green-500" />
                <span className="font-medium text-zinc-300">{repository.defaultBranch}</span>
              </div>
            )}

            {repository.license && (
              <div className="flex items-center gap-1.5" title="License">
                <Shield className="h-3.5 w-3.5 text-zinc-400" />
                <span>{repository.license}</span>
              </div>
            )}

            <div className="flex items-center gap-1.5" title="Created Date">
              <Calendar className="h-3.5 w-3.5 text-zinc-500" />
              <span>Created {formatDate(repository.createdAt)}</span>
            </div>

            <div className="flex items-center gap-1.5" title="Last Pushed">
              <Clock className="h-3.5 w-3.5 text-zinc-500" />
              <span>Pushed {formatRelativeTime(repository.pushedAt)}</span>
            </div>
          </div>

          {/* Repository Topics */}
          {repository.topics && repository.topics.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 pt-3.5 border-t border-white/[0.06]">
              {repository.topics.map((topic) => (
                <span
                  key={topic}
                  className="rounded-lg border border-green-500/30 bg-green-500/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-green-400 backdrop-blur-md shadow-[0_0_10px_rgba(22,163,74,0.1)]"
                >
                  #{topic}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Key Metrics Row in Liquid Glass */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4 sm:p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Total Commits</span>
              <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/25 text-green-500">
                <GitCommit className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {totalCommitsCount.toLocaleString()}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {insights?.totalCommitsYear ?? 0} in {insights?.year}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4 sm:p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Contributors</span>
              <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/25 text-green-500">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {contributors.length}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              Active repository authors
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4 sm:p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Peak Period</span>
              <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/25 text-green-500">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {insights?.mostActiveQuarter?.label ?? "N/A"}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1">
              {insights?.mostActiveQuarter?.total ?? 0} commits
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-4 sm:p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_8px_24px_rgba(0,0,0,0.3)] backdrop-blur-xl">
            <div className="flex items-center justify-between text-zinc-400 mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Most Active Day</span>
              <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/25 text-green-500">
                <Award className="h-4 w-4" />
              </div>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">
              {insights?.mostActiveDay?.count ?? 0}
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 truncate">
              {insights?.mostActiveDay?.date ? formatUtcDay(insights.mostActiveDay.date) : "None recorded"}
            </p>
          </div>
        </div>

        {/* Heatmap Section (with liquid glass and fixed commit history hover popup) */}
        <RepoCommitHeatmap insights={insights} commits={repository.commits} />

        {/* Two-Column Section: Contributors & Recent Commits */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

          {/* Left Column: All Contributors */}
          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-white/[0.12] bg-zinc-900/35 p-5 sm:p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 mb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/25 text-green-500">
                    <Users className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100">
                    Contributors
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-green-500 bg-green-500/10 border border-green-500/25 px-2 py-0.5 rounded-lg">
                    {contributors.length} author{contributors.length === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              {/* Contributor Search Filter */}
              {contributors.length > 4 && (
                <div className="relative mb-3.5">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={contributorSearch}
                    onChange={(e) => setContributorSearch(e.target.value)}
                    placeholder="Search contributors..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-white/[0.1] bg-white/[0.04] text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-green-500/50 backdrop-blur-md transition-colors"
                  />
                </div>
              )}

              {contributors.length === 0 ? (
                <p className="text-xs text-zinc-500 py-8 text-center">No contributor data available.</p>
              ) : filteredContributors.length === 0 ? (
                <p className="text-xs text-zinc-500 py-6 text-center">No contributors match your search.</p>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-[440px] overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.1)_transparent]">
                  {filteredContributors.map((contrib) => (
                    <div
                      key={contrib.login || contrib.author}
                      className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-green-500/40 transition-all backdrop-blur-md group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {contrib.avatarUrl ? (
                          <Image
                            src={contrib.avatarUrl}
                            alt={contrib.login}
                            width={34}
                            height={34}
                            className="rounded-full border border-white/15 shrink-0 ring-1 ring-white/10"
                          />
                        ) : (
                          <div className="h-[34px] w-[34px] rounded-full bg-green-500/15 border border-green-500/40 flex items-center justify-center text-xs font-bold text-green-500 shrink-0">
                            {contrib.login.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <a
                            href={contrib.htmlUrl}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-sm font-semibold text-zinc-200 hover:text-green-400 transition-colors truncate flex items-center gap-1.5"
                          >
                            <span>@{contrib.login}</span>
                            <ExternalLink className="h-3 w-3 text-zinc-500 group-hover:text-green-500 transition-colors" />
                          </a>
                          <p className="text-[11px] text-zinc-400">
                            {contrib.percentage > 0 ? `${contrib.percentage}% of commits` : "Collaborator"}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="inline-block rounded-lg bg-white/[0.06] border border-white/[0.08] px-2.5 py-1 text-xs font-mono font-medium text-green-400">
                          {contrib.commits} commit{contrib.commits === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Language Breakdown Card in Liquid Glass */}
            {languageList.length > 0 && (
              <div className="rounded-2xl border border-white/[0.12] bg-zinc-900/35 p-5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl">
                <div className="flex items-center justify-between pb-3 mb-3.5 border-b border-white/[0.08]">
                  <h3 className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-green-500" />
                    <span>Languages</span>
                  </h3>
                </div>

                {/* Multi-segmented Progress Bar */}
                <div className="h-2.5 w-full rounded-full overflow-hidden flex bg-white/[0.05] p-0.5 border border-white/[0.08] mb-4">
                  {languageList.map(([lang, bytes]) => {
                    const percent = totalLanguageBytes > 0 ? (bytes / totalLanguageBytes) * 100 : 0;
                    if (percent < 0.5) return null;
                    return (
                      <div
                        key={lang}
                        style={{
                          width: `${percent}%`,
                          backgroundColor: LANGUAGE_COLORS[lang] || "#22c55e",
                        }}
                        title={`${lang}: ${percent.toFixed(1)}%`}
                        className="rounded-sm"
                      />
                    );
                  })}
                </div>

                {/* Language Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                  {languageList.map(([lang, bytes]) => {
                    const percent = totalLanguageBytes > 0 ? (bytes / totalLanguageBytes) * 100 : 0;
                    return (
                      <div key={lang} className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{
                            backgroundColor: LANGUAGE_COLORS[lang] || "#22c55e",
                            boxShadow: `0 0 6px ${LANGUAGE_COLORS[lang] || "#22c55e"}66`,
                          }}
                        />
                        <span className="font-medium text-zinc-300">{lang}</span>
                        <span className="text-zinc-500 font-mono">{percent.toFixed(1)}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Commit History Div (Limited to latest 3 commits + Load More Option) */}
          <div className="rounded-2xl border border-white/[0.12] bg-zinc-900/35 p-5 sm:p-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.12),0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-2xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3.5 mb-4 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 rounded-lg bg-green-500/10 border border-green-500/25 text-green-500">
                    <GitCommit className="h-4 w-4" />
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100">
                    Recent Commits
                  </h3>
                </div>
                <span className="text-xs text-zinc-400">
                  Showing latest {displayedCommits.length}
                </span>
              </div>

              {displayedCommits.length === 0 ? (
                <p className="text-xs text-zinc-500 py-8 text-center">No commit history available.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {displayedCommits.map((c) => (
                    <div
                      key={c.sha}
                      className="p-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.07] hover:border-green-500/40 transition-all backdrop-blur-md flex flex-col gap-2.5 group"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs sm:text-sm font-medium text-zinc-200 line-clamp-2 leading-snug">
                          {c.message}
                        </p>
                        {c.url ? (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="shrink-0 font-mono text-[11px] text-green-400 bg-green-500/10 border border-green-500/30 px-2 py-0.5 rounded-lg transition-colors inline-flex items-center gap-1 hover:bg-green-500/20"
                          >
                            <span>{c.shortSha}</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="shrink-0 font-mono text-[11px] text-zinc-400 bg-white/[0.06] border border-white/[0.08] px-2 py-0.5 rounded-lg">
                            {c.shortSha}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1.5 border-t border-white/[0.04]">
                        <span className="truncate max-w-[200px] text-zinc-300 font-medium">
                          By @{c.author}
                        </span>
                        <span>{formatRelativeTime(c.committed_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Load More Option -> Opens Commit Page showing commits of all contributors */}
            <div className="mt-5 pt-4 border-t border-white/[0.08]">
              <Link
                href={`/repositories/${repository.id}/commits`}
                className="w-full py-3 px-4 rounded-xl border border-green-500/40 bg-green-500/10 hover:bg-green-500/20 text-green-400 hover:text-green-300 font-semibold text-xs sm:text-sm transition-all duration-200 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(22,163,74,0.15)] hover:shadow-[0_0_25px_rgba(22,163,74,0.2)] group"
              >
                <GitCommit className="h-4 w-4 text-green-500 group-hover:scale-110 transition-transform" />
                <span>Load More Commits ({totalCommitsCount.toLocaleString()} total)</span>
                <ArrowRight className="h-4 w-4 text-green-500 group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}
