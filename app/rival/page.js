"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Rocket } from "lucide-react";
import { Navbar, NavBody, MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle } from "@/components/ui/resizable-navbar";
import CommitGrid from "@/components/ui/commit-grid";
import { Swirl } from "loading-dev";

const navItems = [
  { name: "Dashboard", link: "/dashboard" },
  { name: "Rival", link: "/rival" },
];

export default function RivalPage() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [rivalry, setRivalry] = useState(null);
  const [rivalryChecked, setRivalryChecked] = useState(false);
  const [requests, setRequests] = useState({ incoming: [], outgoing: [], suggestions: [] });
  const [requestsLoaded, setRequestsLoaded] = useState(false);
  const [acting, setActing] = useState(null);
  const [listError, setListError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function checkRivalry() {
      try {
        const res = await fetch("/api/rivalry/active", { cache: "no-store" });
        const data = res.ok ? await res.json() : { rivalry: null };
        if (!cancelled) setRivalry(data.rivalry ?? null);
      } catch {
        if (!cancelled) setRivalry(null);
      } finally {
        if (!cancelled) setRivalryChecked(true);
      }
    }
    checkRivalry();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadRequests() {
    try {
      const res = await fetch("/api/rivalry/requests", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setRequests({
          incoming: data.incoming ?? [],
          outgoing: data.outgoing ?? [],
          suggestions: data.suggestions ?? [],
        });
      }
    } catch {
      // keep previous lists on failure
    } finally {
      setRequestsLoaded(true);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      try {
        const res = await fetch("/api/rivalry/requests", { cache: "no-store" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          setRequests({
            incoming: data.incoming ?? [],
            outgoing: data.outgoing ?? [],
            suggestions: data.suggestions ?? [],
          });
        }
      } catch {
        // keep empty lists on failure
      } finally {
        if (!cancelled) setRequestsLoaded(true);
      }
    }
    initialLoad();
    return () => {
      cancelled = true;
    };
  }, []);

  async function postAction(url, payload, key) {
    setActing(key);
    setListError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(data.error ?? "Something went wrong.");
      } else if (data.action === "accepted") {
        // Accepted locks the rivalry — refresh the active gate too.
        try {
          const active = await fetch("/api/rivalry/active", { cache: "no-store" });
          if (active.ok) setRivalry((await active.json()).rivalry ?? null);
        } catch {
          // gate refreshes on next visit
        }
      }
      await loadRequests();
    } catch {
      setListError("Network error. Try again.");
    } finally {
      setActing(null);
    }
  }

  const sendChallenge = (login) =>
    postAction("/api/rivalry/request", { opponentUsername: login }, `challenge:${login}`);
  const respond = (id, action) =>
    postAction("/api/rivalry/respond", { rivalryId: id, action }, `rivalry:${id}`);

  return (
    < >
      <CommitGrid className="bg-zinc-950 h-svh" />
      <div className="flex h-svh w-full flex-col ">

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

        <div>rival</div>
      </div>

      {!(rivalryChecked && requestsLoaded) && (
        <div className="fixed top-1/2 left-1/2 z-40 -translate-x-1/2 -translate-y-1/2">
          <Swirl size={36} color="#118d04" />
        </div>
      )}

      {rivalryChecked && requestsLoaded && !rivalry && (
        <div className="fixed top-1/2 left-1/2 z-40 mt-6 flex h-[80vh] w-[60vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                {listError && (
                  <p className="mb-2 text-xs text-red-400">{listError}</p>
                )}

                <p className="mb-2 text-sm font-semibold text-zinc-200">
                  Incoming
                </p>
                {requests.incoming.length === 0 ? (
                  <p className="mb-3 text-sm text-zinc-500">No incoming requests.</p>
                ) : (
                  <ul className="mb-3 flex flex-col gap-2">
                    {requests.incoming.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
                      >
                        <span className="truncate font-mono text-sm text-zinc-200">
                          @{r.fromUsername}
                        </span>
                        <span className="flex shrink-0 gap-1.5">
                          <button
                            type="button"
                            disabled={acting === `rivalry:${r.id}`}
                            onClick={() => respond(r.id, "accept")}
                            className="rounded-full bg-white px-3 py-1 text-xs font-medium text-black transition-colors hover:bg-zinc-200 disabled:opacity-50"
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={acting === `rivalry:${r.id}`}
                            onClick={() => respond(r.id, "decline")}
                            className="rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
                          >
                            Decline
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {requests.outgoing.length > 0 && (
                  <>
                    <p className="mb-2 text-xs font-medium tracking-wide text-zinc-500 uppercase">
                      Sent
                    </p>
                    <ul className="mb-3 flex flex-col gap-2">
                      {requests.outgoing.map((r) => (
                        <li
                          key={r.id}
                          className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
                        >
                          <span className="truncate font-mono text-sm text-zinc-400">
                            @{r.toUsername}
                          </span>
                          <button
                            type="button"
                            disabled={acting === `rivalry:${r.id}`}
                            onClick={() => respond(r.id, "cancel")}
                            className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:text-white disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="mb-2 text-sm font-semibold text-zinc-200">
                  Suggestions
                </p>
                {requests.suggestions.length === 0 ? (
                  <p className="text-sm text-zinc-500">
                    No suggestions. Mutual follows show up here.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {requests.suggestions.map((s) => (
                      <li
                        key={s.login}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {s.avatar_url ? (
                            <Image
                              src={s.avatar_url}
                              alt={s.login}
                              width={28}
                              height={28}
                              className="shrink-0 rounded-full border border-white/10"
                            />
                          ) : (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-400">
                              {s.login.charAt(0)}
                            </span>
                          )}
                          <span className="truncate font-mono text-sm text-zinc-200">
                            @{s.login}
                          </span>
                        </span>
                        {s.onPushr ? (
                          <button
                            type="button"
                            disabled={acting === `challenge:${s.login}`}
                            onClick={() => sendChallenge(s.login)}
                            className="shrink-0 cursor-pointer rounded-full bg-white px-3 py-1 text-xs font-medium text-black transition-[transform,box-shadow,background-color] duration-200 ease-in will-change-transform hover:bg-zinc-200 hover:shadow-lg hover:shadow-white/20 disabled:hover:scale-100 disabled:hover:shadow-none disabled:opacity-50"
                          >
                            Challenge
                          </button>
                        ) : (
                          <span
                            title={`${s.login} has not signed up for Pushr yet`}
                            className="shrink-0 cursor-not-allowed rounded-full border border-white/10 px-3 py-1 text-xs text-zinc-600"
                          >
                            Not on Pushr
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
          </div>
        </div>
      )}
    </>

  );
}
