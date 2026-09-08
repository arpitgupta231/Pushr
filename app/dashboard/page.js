"use client"
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Activity, GitFork, LayoutDashboard, Rocket, Swords } from "lucide-react";
import { Sidebar, SidebarBody, SidebarLink, SidebarText } from "@/components/ui/sidebar";
import { Navbar, NavBody, MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle } from "@/components/ui/resizable-navbar";
import { WobbleCard } from "@/components/ui/wobble-card";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { Meteors } from "@/components/ui/meteors";
import { ChartContainer } from "@/components/ui/chart";
import { useSession, signOut } from "next-auth/react";

const navItems = [
  { name: "Dashboard", link: "/dashboard" },
  { name: "Rival", link: "/rivalry" },
];

const links = [
  { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5 text-white " /> },
  { label: "Rivalry", href: "/rivalry", icon: <Swords className="h-5 w-5 text-white " /> },
  { label: "Repositories", href: "/repositories", icon: <GitFork className="h-5 w-5 text-white dark:text-neutral-200" /> },
  { label: "People", href: "/people", icon: <Activity className="h-5 w-5 text-white dark:text-neutral-200" /> },
];

const mockGitHistory = [
  { sha: "9f8e21a", message: "Initial commit", date: "2026-01-04", branch: "main" },
  { sha: "a1b2c3d", message: "Set up Next.js + Tailwind", date: "2026-01-08", branch: "main" },
  { sha: "b2c3d4e", message: "Add GitHub OAuth flow", date: "2026-01-11", branch: "main" },
  { sha: "c3d4e5f", message: "Wire commit polling", date: "2026-01-15", branch: "feature/sync" },
  { sha: "d4e5f6a", message: "Dedupe activities", date: "2026-01-17", branch: "feature/sync" },
  { sha: "e5f6a7b", message: "Add rivalry lock-in", date: "2026-01-19", branch: "main" },
  { sha: "f6a7b8c", message: "Merge feature/sync", date: "2026-01-20", branch: "main" },
  { sha: "7b8c9d0", message: "Fix scrollbar bleed", date: "2026-01-22", branch: "fix/scroll" },
  { sha: "8c9d0ea", message: "Merge fix/scroll", date: "2026-01-23", branch: "main" },
];

const mockRepositories = [
  {
    name: "pushr",
    githubUrl: "https://github.com/arpitgupta231/pushr",
    commits: mockGitHistory,
  },
  {
    name: "github-rival",
    githubUrl: "https://github.com/arpitgupta231/github-rival",
    commits: [
      { sha: "1a2b3c4", message: "Initial commit", date: "2026-02-01", branch: "main" },
      { sha: "2b3c4d5", message: "Add rivalry scoring", date: "2026-02-05", branch: "main" },
      { sha: "3c4d5e6", message: "Add 6-month lock", date: "2026-02-09", branch: "main" },
      { sha: "4d5e6f7", message: "WIP: streak calc", date: "2026-02-12", branch: "feature/streak" },
      { sha: "5e6f7a8", message: "Merge feature/streak", date: "2026-02-15", branch: "main" },
    ],
  },
  {
    name: "algo-viz",
    githubUrl: "https://github.com/arpitgupta231/algo-viz",
    commits: [
      { sha: "9a8b7c6", message: "Initial commit", date: "2026-03-01", branch: "main" },
      { sha: "8b7c6d5", message: "Add sorting visualizer", date: "2026-03-04", branch: "main" },
      { sha: "7c6d5e4", message: "Add graph traversal", date: "2026-03-08", branch: "main" },
      { sha: "6d5e4f3", message: "WIP: pathfinding", date: "2026-03-11", branch: "feature/astar" },
      { sha: "5f4e3d2", message: "Merge feature/astar", date: "2026-03-14", branch: "main" },
    ],
  },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  return (
    <div className="flex h-svh w-full flex-col dark:bg-zinc-950">

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">

        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="gap-6">
            <div className="flex flex-row items-center gap-2 ">
              <Rocket className="h-6 w-6 text-indigo-500" />
              <SidebarText className="text-lg font-semibold text-indigo-500" >
                Pushr
              </SidebarText>
            </div>
            <div className="flex flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden py-2">
              {links.map((link) => (
                <SidebarLink key={link.href} link={link} />
              ))}
            </div>
            <div className="group relative">
              <div className="pointer-events-none absolute bottom-full left-0 z-30 mb-0.5 w-48 ml-5 translate-y-2 p-3 opacity-0 transition-all duration-300 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 ">
                <div className="rounded-xl border border-white bg-zinc-900 py-2 p-1.5 shadow-2xl shadow-black/40 ">
                  <button
                    type="button"
                    onClick={() => window.open(`https://github.com/${session?.user?.githubUsername}`, "_blank", "noopener,noreferrer")}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    Open in GitHub
                  </button>
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                  >
                    Log out
                  </button>
                </div>
              </div>
              <div className="flex flex-row items-center gap-2 cursor-pointer">
                <div className="flex px-3 -left-0.5 py-1.5 w-fit  items-center justify-center rounded-full bg-indigo-500/20">
                  <span className="text-sm font-semibold text-indigo-400">{session?.user?.name?.charAt(0)}</span>
                </div>
                <SidebarText className="text-sm text-white">
                  {session?.user?.name}
                </SidebarText>
              </div>
            </div>
          </SidebarBody>
        </Sidebar>
        <div className={`relative flex h-full min-w-0 flex-1 flex-col items-center  mt-2 ${sidebarOpen ? "pl-6": ":"}`}>
          <Navbar className="fixed left-1/2 top-2 z-40 w-fit -translate-x-1/2 rounded-4xl border border-white/10 shadow-2xl shadow-black/40 backdrop-blur-4xl bg-zinc-800">
            <NavBody>
              <div className="hidden flex-1 flex-row items-center justify-center space-x-2 lg:flex">
                {navItems.map((item) => {
                  const isActive = pathname === item.link;
                  return (
                    <a
                      key={item.link}
                      href={item.link}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                        }`}
                    >
                      {item.name}
                    </a>
                  );
                })}
              </div>
            </NavBody>
            <MobileNav>
              <MobileNavHeader>
                <a href="/dashboard" className="flex items-center space-x-2">
                  <Rocket className="h-6 w-6 text-indigo-500" />
                  <span className="text-lg font-semibold text-indigo-500">Pushr</span>
                </a>
                <MobileNavToggle
                  isOpen={isMobileMenuOpen}
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                />
              </MobileNavHeader>
              <MobileNavMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)}>
                {navItems.map((item) => {
                  const isActive = pathname === item.link;
                  return (
                    <a
                      key={item.link}
                      href={item.link}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`w-full rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                        }`}
                    >
                      {item.name}
                    </a>
                  );
                })}
              </MobileNavMenu>
            </MobileNav>
          </Navbar>
          <div className="h-[42px] w-full shrink-0 lg:h-[54px]" aria-hidden="true" />

          <div className="relative flex w-full items-end justify-center gap-6 p-6 pt-3">

            <WobbleCard
              containerClassName={`w-md max-w-xl h-[85vh] self-end ${sidebarOpen ? "hidden" : ""}`}
              className="p-0 sm:p-0"
            >

              <Meteors number={20} className="z-10" />
              <div className="p-2 relative">

                <div className="image w-full flex mt-3 justify-center h-fit  py-2">
                  <Image
                    src="/default.png"
                    alt=""
                    width={210}
                    height={210}
                    className="rounded-full border-2 border-green-500 z-20"
                  />
                </div>
                <div className="flex mt-3 h-fit w-full flex-col  gap-3 items-center ">
                  <div>
                    <p className="font-mono text-lg font-semibold text-zinc-200">
                      @{session?.user?.name}
                    </p>
                    <p className="text-sm text-zinc-400">
                      Avid star coder. Pushes harder because the bro pushes.
                    </p>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                <HoverBorderGradient
                  onClick={() => window.open(`https://github.com/${session?.user?.githubUsername}`, "_blank", "noopener,noreferrer")}
                  className="text-white bg-black transition-colors duration-500 hover:bg-white hover:text-black"
                >
                  Open in GitHub
                </HoverBorderGradient>
              </div>
            </WobbleCard>
            <div className={`flex w-[54vw] h-[85vh] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-black/40 ${sidebarOpen ? "absolute right-6 top-3" : ""}`}>
              <p className="mb-4 font-sans text-sm font-semibold text-zinc-200">
                Repositories
              </p>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden items-center">
                {mockRepositories.map((repo) => (
                  <div
                    key={repo.name}
                    className="h-fit shrink-0  overflow-hidden w-[95%] border border-green-500/40 bg-zinc-900/60 p-3 shadow-lg shadow-green-950/20"
                  >
                    <div className="mb-2 flex items-center justify-between gap-4">
                      <p className="text-2xl font-semibold text-zinc-200">
                        {repo.name}
                      </p>
                      <HoverBorderGradient
                        onClick={() => window.open(repo.githubUrl, "_blank", "noopener,noreferrer")}
                        className="text-xs text-white bg-black transition-colors duration-500 hover:bg-white hover:text-black"
                      >
                        Open in GitHub
                      </HoverBorderGradient>
                    </div >
                    <div className="p-1.5 border border-zinc-800">

                      <ChartContainer commits={repo.commits} className="w-full   h-fit border border-green-500" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}