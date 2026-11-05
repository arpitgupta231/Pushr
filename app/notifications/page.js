"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Rocket, Bell, BellOff, Loader2 } from "lucide-react";
import { Navbar, NavBody, NavItems, MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle } from "@/components/ui/resizable-navbar";
import { isPushSupported, getPushPermissionState, subscribeToPush, unsubscribeFromPush } from "@/lib/push-client";

const navItems = [
  { name: "Dashboard", link: "/dashboard" },
  { name: "Rival", link: "/rival" },
];

export default function NotificationsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [pushPermission, setPushPermission] = useState(null);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    fetch("/api/notifications")
      .then((response) => response.ok ? response.json() : { notifications: [] })
      .then((data) => setNotifications(data.notifications ?? []))
      .catch(() => setNotifications([]));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function detectPushState() {
      if (!isPushSupported()) {
        if (!cancelled) setPushPermission("unsupported");
        return;
      }
      const permission = await getPushPermissionState();
      if (cancelled) return;
      setPushPermission(permission);
      try {
        const registration = await navigator.serviceWorker.getRegistration("/sw.js");
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (!cancelled) setPushSubscribed(Boolean(subscription));
      } catch {
        if (!cancelled) setPushSubscribed(false);
      }
    }
    detectPushState();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnablePush = async () => {
    setPushBusy(true);
    const result = await subscribeToPush();
    if (result.ok) {
      setPushSubscribed(true);
      setPushPermission("granted");
    } else if (result.reason === "denied") {
      setPushPermission("denied");
    } else if (result.reason === "unsupported") {
      setPushPermission("unsupported");
    }
    setPushBusy(false);
  };

  const handleDisablePush = async () => {
    setPushBusy(true);
    await unsubscribeFromPush();
    setPushSubscribed(false);
    setPushBusy(false);
  };

  return (
    <div className="flex h-svh w-full flex-col dark:bg-zinc-950">
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

      <div className="flex w-full flex-1 items-start justify-center p-6 pt-3">
        <div className="flex w-[75vw] h-[82vh] mt-2.5 shrink-0 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 p-6 shadow-2xl shadow-black/40">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-sans text-sm font-semibold text-zinc-200">
              Notifications
            </p>
            {pushPermission === null ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking…
              </span>
            ) : pushPermission === "unsupported" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-500">
                <BellOff className="h-3.5 w-3.5" />
                Push unavailable
              </span>
            ) : pushPermission === "denied" ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-500" title="Notifications blocked in browser settings">
                <BellOff className="h-3.5 w-3.5" />
                Notifications blocked in browser settings
              </span>
            ) : pushPermission === "granted" && pushSubscribed ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs font-medium text-green-400">
                  <Bell className="h-3.5 w-3.5" />
                  Push enabled
                </span>
                <button
                  type="button"
                  onClick={handleDisablePush}
                  disabled={pushBusy}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-zinc-400 transition-colors hover:border-white/20 hover:text-zinc-200 disabled:opacity-50"
                >
                  {pushBusy ? "Disabling…" : "Disable"}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={handleEnablePush}
                disabled={pushBusy}
                className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-1.5 text-xs font-semibold text-zinc-950 transition-colors hover:bg-green-500 disabled:opacity-50"
              >
                {pushBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bell className="h-3.5 w-3.5" />}
                {pushBusy ? "Enabling…" : "Enable push"}
              </button>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden items-center justify-center py-2 ">
            {notifications.length === 0 ? (
              <p className="text-md text-zinc-500">No notifications yet.</p>
            ) : notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                onClick={async () => {
                  if (!notification.read_at) {
                    await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notification.id }) });
                  }
                  router.push(notification.href || "/rival");
                }}
                className={`w-full max-w-2xl rounded-xl border p-4 text-left transition-colors ${notification.read_at ? "border-white/5 bg-zinc-900/40" : "border-green-500/20 bg-green-500/5 hover:bg-green-500/10"}`}
              >
                <p className="text-sm font-semibold text-zinc-100">{notification.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{notification.body}</p>
                <time className="mt-2 block text-xs text-zinc-600">{new Date(notification.created_at).toLocaleString()}</time>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
