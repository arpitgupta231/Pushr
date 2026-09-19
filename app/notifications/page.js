"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Rocket } from "lucide-react";
import { Navbar, NavBody, MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle } from "@/components/ui/resizable-navbar";

const navItems = [
  { name: "Dashboard", link: "/dashboard" },
  { name: "Rival", link: "/rival" },
];

export default function NotificationsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex h-svh w-full flex-col dark:bg-zinc-950">
      <Navbar className="fixed left-1/2 top-2 z-40 w-fit -translate-x-1/2 rounded-4xl border border-white/10 shadow-2xl shadow-black/40 backdrop-blur-4xl bg-zinc-800">
        <NavBody>
          <div className="hidden flex-1 flex-row items-center justify-center space-x-2 lg:flex">
            {navItems.map((item) => {
              const isActive = pathname === item.link;
              return (
                <button
                  key={item.link}
                  type="button"
                  onClick={() => router.push(item.link)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${isActive ? "bg-white text-black" : "text-zinc-400 hover:text-white"
                    }`}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        </NavBody>
        <MobileNav>
          <MobileNavHeader>
            <button type="button" onClick={() => router.push("/dashboard")} className="flex items-center space-x-2">
              <Rocket className="h-6 w-6 text-indigo-500" />
              <span className="text-lg font-semibold text-indigo-500">Pushr</span>
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

      <div className="flex w-full flex-1 items-start justify-center p-6 pt-3">
        <div className="flex w-[75vw] h-[82vh] mt-2.5 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-black/40">
          <p className="mb-4 font-sans text-sm font-semibold text-zinc-200">
            Notifications
          </p>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden items-center justify-center py-2 ">
            <p className=" text-zinc-500 text-md ">No notifications yet.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
