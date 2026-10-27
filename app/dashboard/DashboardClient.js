"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, ExternalLink, GitFork, LayoutDashboard, LogOut, Rocket, Settings, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar, SidebarBody, SidebarLink, SidebarText, useSidebar } from "@/components/ui/sidebar";
import { Navbar, NavBody, NavItems, MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle } from "@/components/ui/resizable-navbar";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { Meteors } from "@/components/ui/meteors";
import { ContributionGraph } from "@/components/ui/contribution-graph";
import { ActivityHeatmap } from "@/components/ui/activity-heatmap";
import { useSession, signOut } from "next-auth/react";

const navItems = [
  { name: "Dashboard", link: "/dashboard" },
  { name: "Rival", link: "/rival" },
];

const links = [
  { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Repositories", href: "/repositories", icon: <GitFork className="h-5 w-5" /> },
  { label: "Friends", icon: <Users className="h-5 w-5" /> },
  { label: "Notifications", href: "/Notifications", icon: <Bell className="h-5 w-5" /> },
];

function SidebarAccordion({ icon, label, expanded, active = false, itemRef, onOpen, onClose, onToggle, children }) {
  const { open } = useSidebar();
  return (
    <div onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        ref={itemRef}
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`group/sidebar relative z-10 flex w-full cursor-pointer items-center rounded-xl text-sm font-medium transition-colors duration-200 ease-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/30 [&>svg]:relative [&>svg]:z-10 [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:shrink-0 [&>svg]:transition-colors [&>svg]:duration-200 ${
          active
            ? open
              ? "text-green-100 [&>svg]:text-green-400"
              : "[&>svg]:text-green-400 [&>svg]:drop-shadow-[0_0_6px_rgba(74,222,128,0.9)]"
            : "text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100 [&>svg]:text-zinc-400 group-hover/sidebar:[&>svg]:text-green-400"
        } ${open ? "gap-3 px-3 py-2" : "justify-center p-3"}`}
      >
        {icon}
        <SidebarText className="text-sm">
          {label}
        </SidebarText>
        <SidebarText className="ml-auto">
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-300 ${active ? "text-green-400" : "text-zinc-400"} ${expanded ? "rotate-180" : ""}`}
          />
        </SidebarText>
      </button>
      <div
        className={`grid transition-all duration-300 ease-in-out ${expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

function ProfileSettings({ githubUsername, signOut }) {
  const [open, setOpen] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event) {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openGithubProfile() {
    if (!githubUsername) return;
    window.open(`https://github.com/${githubUsername}`, "_blank", "noopener,noreferrer");
  }

  return (
    <div ref={settingsRef} className="relative ml-auto shrink-0">
      <button
        type="button"
        aria-label="Settings"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 transition-colors duration-200 ease-in hover:bg-white/[0.06] hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500/30"
      >
        <Settings className="h-4 w-4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="absolute bottom-full right-0 z-50 mb-2 w-44 origin-bottom-right rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl shadow-black/60 ring-1 ring-inset ring-white/[0.03] backdrop-blur-xl"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                openGithubProfile();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-300 transition-colors duration-200 ease-in hover:bg-white/[0.06] hover:text-zinc-100"
            >
              <ExternalLink className="h-4 w-4" />
              Open in GitHub
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                signOut({ callbackUrl: "/login" });
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-400 transition-colors duration-200 ease-in hover:bg-red-500/10 hover:text-red-300"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function DashboardClient({ user, repositories = [], activities = [], rivalry = null, contributionDays = [], contributionTotal = 0, contributionYear = new Date().getFullYear(), friends = [] }) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(true);
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeItem, setActiveItem] = useState(() => {
    if (pathname.startsWith("/repositories")) return "Repositories";
    if (pathname.startsWith("/notifications")) return "Notifications";
    if (pathname.startsWith("/friends")) return "Friends";
    return "Home";
  });
  const [activeRect, setActiveRect] = useState(null);
  const navRef = useRef(null);
  const itemRefs = useRef({});

  useEffect(() => {
    if (!sidebarOpen) return;
    const nav = navRef.current;
    if (!nav) return;

    const update = () => {
      const item = itemRefs.current[activeItem];
      if (!item) {
        setActiveRect(null);
        return;
      }
      const navRect = nav.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const nextRect = {
        top: itemRect.top - navRect.top + nav.scrollTop,
        height: itemRect.height,
      };
      setActiveRect((prev) =>
        prev && prev.top === nextRect.top && prev.height === nextRect.height ? prev : nextRect
      );
    };

    update();
    const observer = new ResizeObserver(update);
    const item = itemRefs.current[activeItem];
    if (item) observer.observe(item);
    return () => observer.disconnect();
  }, [activeItem, sidebarOpen, friendsOpen, notificationsOpen]);

  // Server data wins, client session is the fallback (e.g. after client-side refresh).
  const displayName = user?.githubUsername ?? session?.user?.githubUsername ?? session?.user?.name ?? "you";
  const githubUsername = user?.githubUsername ?? session?.user?.githubUsername ?? "";
  const avatarUrl = user?.avatarUrl ?? session?.user?.image ?? null;
  const avatarInitial = displayName?.charAt(0) ?? "?";
  const friendsExpanded = friendsOpen && sidebarOpen;
  const notificationsExpanded = notificationsOpen && sidebarOpen;

  function openGithubProfile() {
    if (!githubUsername) return;
    window.open(`https://github.com/${githubUsername}`, "_blank", "noopener,noreferrer");
  }

  function setNavRef(el) {
    if (el && el.offsetParent !== null) navRef.current = el;
  }

  function setItemRef(label) {
    return (el) => {
      if (el && el.offsetParent !== null) itemRefs.current[label] = el;
    };
  }

  return (
    <div className="flex h-svh w-full flex-col dark:bg-zinc-950">

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">

        <Sidebar open={sidebarOpen} setOpen={setSidebarOpen}>
          <SidebarBody className="gap-4">
            <div
              className={`relative flex h-12 items-center overflow-hidden ${
                sidebarOpen ? "justify-start" : "justify-center"
              }`}
            >
              <Image
                src="/logo.png"
                alt="Pushr"
                width={1080}
                height={1080}
                sizes="120px"
                aria-hidden={sidebarOpen}
                className={`h-10 w-10 max-w-none shrink-0 transition-opacity duration-200 ease-in ${
                  sidebarOpen ? "opacity-0" : "opacity-100"
                }`}
              />
              <Image
                src="/heading.png"
                alt="Pushr"
                width={2000}
                height={1120}
                sizes="160px"
                aria-hidden={!sidebarOpen}
                className={`absolute left-0 top-1/2 -ml-[18px] h-16 w-auto max-w-none -translate-y-1/2 transition-opacity duration-200 ease-in ${
                  sidebarOpen ? "opacity-100" : "opacity-0"
                }`}
              />
            </div>
            <div
              ref={setNavRef}
              className="relative mt-1 flex flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden border-t border-white/[0.06] py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {sidebarOpen && (
                <motion.div
                  aria-hidden="true"
                  initial={false}
                  animate={{
                    top: activeRect?.top ?? 0,
                    height: activeRect?.height ?? 0,
                    opacity: activeRect ? 1 : 0,
                  }}
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="pointer-events-none absolute inset-x-0 z-0 rounded-xl border border-green-500/15 bg-green-500/[0.08] shadow-[inset_0_1px_0_rgba(74,222,128,0.06)]"
                >
                  <span className="absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.85)]" />
                </motion.div>
              )}
              {links.map((link) => {
                if (link.label === "Friends") {
                  return (
                    <SidebarAccordion
                      key="friends"
                      icon={link.icon}
                      label="Friends"
                      expanded={friendsExpanded}
                      active={activeItem === "Friends"}
                      itemRef={setItemRef("Friends")}
                      onOpen={() => setFriendsOpen(true)}
                      onClose={() => setFriendsOpen(false)}
                      onToggle={() => {
                        setActiveItem("Friends");
                        setFriendsOpen((v) => !v);
                      }}
                    >
                      <div className="flex max-h-60 flex-col gap-1 overflow-y-auto py-1 [scrollbar-width:thin]">
                        {friends.length === 0 ? (
                          <p className="px-2 py-1 text-xs text-zinc-500">No mutual follows yet.</p>
                        ) : (
                          friends.map((f) => (
                            <a
                              key={f.login}
                              href={`https://github.com/${f.login}`}
                              target="_blank"
                              rel="noreferrer"
                              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors duration-200 ease-in hover:bg-white/[0.05]"
                            >
                              {f.avatarUrl ? (
                                <Image
                                  src={f.avatarUrl}
                                  alt={f.login}
                                  width={24}
                                  height={24}
                                  className="rounded-full border border-white/10"
                                />
                              ) : (
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/10 ring-1 ring-green-500/20">
                                  <span className="text-xs font-semibold text-green-400">
                                    {f.login?.charAt(0) ?? "?"}
                                  </span>
                                </div>
                              )}
                              <span className="truncate text-sm text-zinc-400 transition-colors duration-200 group-hover:text-zinc-200">@{f.login}</span>
                            </a>
                          ))
                        )}
                      </div>
                    </SidebarAccordion>
                  );
                }
                if (link.label === "Notifications") {
                  return (
                    <SidebarAccordion
                      key="notifications"
                      icon={link.icon}
                      label="Notifications"
                      expanded={notificationsExpanded}
                      active={activeItem === "Notifications"}
                      itemRef={setItemRef("Notifications")}
                      onOpen={undefined}
                      onClose={undefined}
                      onToggle={() => {
                        setActiveItem("Notifications");
                        setNotificationsOpen((v) => !v);
                      }}
                    >
                      <p className="px-2 py-1 text-xs text-zinc-500">No notifications</p>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveItem("Notifications");
                          router.push("/notifications");
                        }}
                        className="block w-full cursor-pointer rounded-lg px-2 py-1.5 text-left text-xs font-medium text-green-400 transition-colors duration-200 ease-in hover:bg-white/[0.05] hover:text-green-300"
                      >
                        View all →
                      </button>
                    </SidebarAccordion>
                  );
                }
                return (
                  <SidebarLink
                    key={link.href}
                    link={link}
                    active={activeItem === link.label}
                    itemRef={setItemRef(link.label)}
                    onClick={() => setActiveItem(link.label)}
                  />
                );
              })}
            </div>
            <div className="relative mt-1 border-t border-white/[0.06]">
              <div className={`flex flex-row items-center gap-2.5 mt-2 px-2 py-1.5 ${sidebarOpen ? "rounded-xl transition-colors duration-200 ease-in hover:bg-white/[0.05]" : "justify-center"}`}>
                <div className="relative shrink-0">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-1 rounded-full border border-green-400/25 shadow-[0_0_16px_rgba(74,222,128,0.25)]"
                  />
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={displayName}
                      width={32}
                      height={32}
                      className="relative rounded-full border border-green-400/60 shadow-[0_0_10px_rgba(74,222,128,0.35)]"
                    />
                  ) : (
                    <div className="relative flex h-8 w-8 items-center justify-center rounded-full border border-green-400/60 bg-green-500/10 shadow-[0_0_10px_rgba(74,222,128,0.35)]">
                      <span className="text-sm font-semibold text-green-400">{avatarInitial}</span>
                    </div>
                  )}
                </div>
                <SidebarText className="min-w-0 max-w-full truncate text-sm text-zinc-300">
                  {displayName}
                </SidebarText>
                {sidebarOpen && <ProfileSettings githubUsername={githubUsername} signOut={signOut} />}
              </div>
            </div>
          </SidebarBody>
        </Sidebar>
        <div className="relative mt-2 flex h-full min-w-0 flex-1 flex-col items-center">
          <Navbar className="fixed left-1/2 top-2 z-40 w-fit -translate-x-1/2">
            <NavBody>
              <NavItems items={navItems} />
            </NavBody>
            <MobileNav>
              <MobileNavHeader>
                <button type="button" onClick={() => router.push("/dashboard")} className="flex items-center space-x-2">
                  <Rocket className="h-6 w-6 text-green-500" />
                  <span className="text-lg font-semibold text-green-500">Pushr</span>
                </button>
                <MobileNavToggle
                  isOpen={isMobileMenuOpen}
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                />
              </MobileNavHeader>
              <MobileNavMenu isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)}>
                {navItems.map((item) => {
                  const isActive = pathname === item.link;
                  return (
                    <button
                      key={item.link}
                      type="button"
                      onClick={() => {
                        setIsMobileMenuOpen(false);
                        router.push(item.link);
                      }}
                      className={`w-full rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                        }`}
                    >
                      {item.name}
                    </button>
                  );
                })}
              </MobileNavMenu>
            </MobileNav>
          </Navbar>
          <div className="h-[42px] w-full shrink-0 lg:h-[54px]" aria-hidden="true" />

          <div className="relative flex w-full items-end justify-center gap-6 p-6 pt-3">

            <div className="relative mx-auto flex h-[85vh] w-md max-w-xl self-end flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-2xl shadow-black/40">

              <Meteors number={20} className="z-10" />
              <div className="p-2 relative">

                <div className="image relative z-20 mt-3 flex h-fit w-full justify-center py-2">
                  <div className="relative">
                    <div className="pointer-events-none absolute -inset-1 rounded-full border border-green-400/25 shadow-[0_0_24px_rgba(74,222,128,0.28)]" />
                    <Image
                      src={avatarUrl ?? "/default.png"}
                      alt={displayName}
                      width={210}
                      height={210}
                      className="relative rounded-full border-2 border-green-400/80 shadow-[0_0_18px_rgba(74,222,128,0.25)]"
                    />
                  </div>
                </div>
                <div className="flex mt-3 h-fit w-full justify-between gap-3 px-1.5 items-center">
                  <div>
                    <p className="font-mono text-lg font-semibold text-zinc-200">
                      @{displayName}
                    </p>
                    <p className="text-sm text-zinc-400">
                      {user?.bio?.trim() ||
                        "No Bio."}
                    </p>
                  </div>
                  <div className="flex self-stretch items-center">
                    <HoverBorderGradient
                      onClick={openGithubProfile}
                      className="px-3 py-1 text-xs"
                    >
                      Open in GitHub
                    </HoverBorderGradient>
                  </div>

                </div>
                <div className="relative z-20 mt-2 pb-24">
                  <ActivityHeatmap
                    days={contributionDays}
                    total={contributionTotal}
                    year={contributionYear}
                  />
                </div>
              </div>
            </div>
            <div className="flex w-[54vw] h-[85vh] shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-black/40">
              <p className="mb-4 font-sans text-sm font-semibold text-zinc-200">
                Repositories
              </p>
              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden items-center py-2 ">
                {repositories.length === 0 ? (
                  <p className="text-sm text-zinc-500">No repositories synced yet.</p>
                ) : (
                  repositories.map((repo) => (
                    <div
                      key={repo.name}
                      className="h-fit shrink-0 hover:scale-105  w-[95%] border border-green-500/40 bg-zinc-900/60 p-3 shadow-lg shadow-green-950/20 transition-all duration-300 cursor-pointer rounded-sm"
                    >
                      <div className="mb-2 flex items-center justify-between gap-4 rounded-lg">
                        <p className="text-2xl font-semibold text-zinc-200">
                          {repo.name}
                        </p>
                        <HoverBorderGradient
                          onClick={() => window.open(repo.githubUrl, "_blank", "noopener,noreferrer")}
                          className="text-xs"
                        >
                          Open in GitHub
                        </HoverBorderGradient>
                      </div >
                      <div className="rounded-lg border border-zinc-800 p-1.5">
                        <ContributionGraph commits={repo.commits} className="h-fit w-full rounded-lg border border-green-500" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
