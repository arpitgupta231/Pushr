"use client"
import Image from "next/image";
import { Activity, GitFork, LayoutDashboard, Rocket, Swords } from "lucide-react";
import { Sidebar, SidebarBody, SidebarLink, SidebarText } from "@/components/ui/sidebar";
import { WobbleCard } from "@/components/ui/wobble-card";
import { HoverBorderGradient } from "@/components/ui/hover-border-gradient";
import { Meteors } from "@/components/ui/meteors";
import { useSession, signOut } from "next-auth/react";

const links = [
  { label: "Home", href: "/dashboard", icon: <LayoutDashboard className="h-5 w-5 text-white " /> },
  { label: "Rivalry", href: "/rivalry", icon: <Swords className="h-5 w-5 text-white " /> },
  { label: "Repositories", href: "/repositories", icon: <GitFork className="h-5 w-5 text-white dark:text-neutral-200" /> },
  { label: "People", href: "/people", icon: <Activity className="h-5 w-5 text-white dark:text-neutral-200" /> },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  return (
    <div className="flex h-svh w-full flex-col md:flex-row  dark:bg-zinc-950">
      
      <Sidebar>
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
              <div className="rounded-xl border border-white bg-zinc-900 py-2 p-1.5 shadow-2xl shadow-black/40">
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
      <div className="flex  items-end justify-center p-6">
        <WobbleCard
          containerClassName="w-md max-w-xl h-[85vh]"
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
      </div>
    </div>
  );
}