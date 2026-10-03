"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink, Rocket } from "lucide-react";
import { Navbar, NavBody, MobileNav, MobileNavHeader, MobileNavMenu, MobileNavToggle } from "@/components/ui/resizable-navbar";
import CommitGrid from "@/components/ui/commit-grid";
import { PixelPreloader } from "@/components/ui/pixel-preloader";
import { Blocks } from "loading-dev";

const navItems = [
  { name: "Dashboard", link: "/dashboard" },
  { name: "Rival", link: "/rival" },
];

function toRequestState(data) {
  return {
    incoming: data?.incoming ?? [],
    outgoing: data?.outgoing ?? [],
    suggestions: data?.suggestions ?? [],
  };
}

// Full-bleed loading screen for the rivalry path. It only mounts once the
// active-rivalry verdict is known, so it just plays a smooth 0→100, holds,
// and fades itself out before onComplete. Lives in its own component so the
// per-frame progress repaint never re-renders the page behind it.
function RivalLoadingScreen({ onComplete }) {
  const [fill, setFill] = useState(0);
  const fillRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const next = Math.min(fillRef.current + Math.max(100 - fillRef.current, 0.8) * 0.16, 100);
      fillRef.current = next;
      setFill(next);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  return (
    <PixelPreloader
      mode="manual"
      progress={fill}
      fillMode="rise"
      pixelSize={14}
      gap={4}
      fill="#118d04"
      accent="#4ade80"
      background="#09090b"
      counterLabel="SYNCING YOUR RIVAL"
      icon="pulse"
      holdMs={400}
      fadeMs={500}
      onComplete={onComplete}
    />
  );
}

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
  const [acceptLoader, setAcceptLoader] = useState(false);
  const [acceptKey, setAcceptKey] = useState(0);
  // Skip the boot screen when this mount follows an accept-triggered reload —
  // the accept overlay already played, so replaying it would show two loaders.
  // The flag carries a timestamp and is consumed here, so a stale flag can
  // never suppress the screen on a later visit.
  const [bootHidden, setBootHidden] = useState(() => {
    try {
      if (typeof window === "undefined") return false;
      const ts = Number(window.sessionStorage.getItem("pushr:just-accepted") ?? 0);
      window.sessionStorage.removeItem("pushr:just-accepted");
      return Date.now() - ts < 60_000;
    } catch {
      // storage unavailable — fall through to showing the boot screen
      return false;
    }
  });
  const hideBootLoader = useCallback(() => setBootHidden(true), []);
  // Set when an accept succeeds — the page reloads once the accept overlay
  // has played out, so the locked-in rivalry boots fresh from the server.
  const acceptedRef = useRef(false);

  async function loadRequests() {
    try {
      const res = await fetch("/api/rivalry/requests", { cache: "no-store" });
      if (res.ok) setRequests(toRequestState(await res.json()));
    } catch {
      // keep previous lists on failure
    }
  }

  // One pass, both endpoints in parallel. The pixel loading screen holds until
  // each flag flips as its own payload lands.
  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      await Promise.all([
        fetch("/api/rivalry/active", { cache: "no-store" })
          .then((res) => (res.ok ? res.json() : { rivalry: null }))
          .then((data) => {
            if (!cancelled) setRivalry(data.rivalry ?? null);
          })
          .catch(() => {
            if (!cancelled) setRivalry(null);
          })
          .finally(() => {
            if (!cancelled) setRivalryChecked(true);
          }),
        fetch("/api/rivalry/requests", { cache: "no-store" })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (!cancelled && data) setRequests(toRequestState(data));
          })
          .catch(() => {
            // keep empty lists on failure
          })
          .finally(() => {
            if (!cancelled) setRequestsLoaded(true);
          }),
      ]);
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
        // Accepted locks the rivalry — refresh the active gate too. The boot
        // loading screen is only for a rivalry found on page entry, so keep it
        // hidden here — the accept overlay already covers this transition.
        // Flag the reload: it fires from the overlay's onComplete below.
        acceptedRef.current = true;
        setBootHidden(true);
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

  // Row currently playing its cancel exit animation. The row stays mounted for
  // the 300ms slide-out while the request fires underneath; on failure it
  // glides back in and the inline error explains why.
  const [leaving, setLeaving] = useState(null);

  const handleCancel = (id) => {
    const key = `rivalry:${id}`;
    if (acting === key || leaving === key) return;
    setListError(null);
    setLeaving(key);
    setTimeout(() => {
      respond(id, "cancel").finally(() => setLeaving(null));
    }, 300);
  };

  const handleAccept = (id) => {
    // Full-screen pixel fill while the rivalry locks in.
    // API runs underneath; overlay fades out on completion.
    console.debug("[rival] Accept clicked:", id);
    setAcceptKey((k) => k + 1);
    setAcceptLoader(true);
    respond(id, "accept");
  };

  return (
    < >
      <CommitGrid className="pointer-events-none fixed inset-0 z-0 bg-zinc-950" />
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

      {/* Verdict unknown — neutral spinner centered on the page, outside any box. */}
      {!rivalryChecked && (
        <div className="fixed top-1/2 left-1/2 z-40 -translate-x-1/2 -translate-y-1/2" role="status" aria-label="Checking for active rivalry">
          <Blocks size={44} color="#118d04"
                  duration={1600} 
                  sweep="columns" />
        </div>
      )}

      {/* Active rivalry confirmed — full-bleed pixel screen into the rivalry view. */}
      {!bootHidden && rivalry && (
        <RivalLoadingScreen onComplete={hideBootLoader} />
      )}

      {/* Mounts as soon as the verdict lands: with no rivalry the Blocks
          loader inside the box is the page loader until requests arrive. */}
      {rivalryChecked && !rivalry && (
        <div className="fixed top-1/2 left-1/2 z-40 mt-6 flex h-[80vh] w-[60vw] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/40 backdrop-blur-2xl">
          {listError && (
            <p className="px-6 pt-4 text-xs text-red-400">{listError}</p>
          )}
          <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
            {!requestsLoaded ? (
              <div className="flex min-h-0 flex-1 items-center justify-center" role="status" aria-label="Loading rivalry requests">
                <Blocks size={44} color="#118d04"
                  duration={1600} 
                  sweep="columns"
                />
              </div>
            ) : (
              <>
            <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10">
                <p className="shrink-0 px-4 pt-4 pb-2 text-sm font-semibold text-zinc-200">
                  Incoming
                </p>
                <div className="rival-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10">
                {requests.incoming.length === 0 ? (
                  <p className="mb-3 flex min-h-24 items-center justify-center p-3 text-center text-sm text-zinc-500">
                    No incoming requests.
                  </p>
                ) : (
                  <div className="mb-3 bg-zinc-950/40 p-3">
                  <ul className="flex flex-col gap-2">
                    {requests.incoming.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-zinc-950/60 px-3 py-2"
                      >
                        <a
                          href={`https://github.com/${r.fromUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Open @${r.fromUsername} on GitHub`}
                          className="group/link flex min-w-0 items-center gap-1 font-mono text-sm text-zinc-200 transition-colors hover:text-white hover:underline hover:decoration-white/40 hover:underline-offset-4"
                        >
                          <span className="min-w-0 truncate">@{r.fromUsername}</span>
                          <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-70" aria-hidden="true" />
                        </a>
                        <span className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            disabled={acting === `rivalry:${r.id}`}
                            onClick={() => handleAccept(r.id)}
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
                  </div>
                )}

                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-950 to-transparent" />
            </div>
            <div className={`flex min-h-0 flex-1 flex-col transition-[gap] duration-300 ease-in-out lg:flex-row ${requests.outgoing.length > 0 ? "gap-4" : "gap-0"}`}>
            <div
              aria-hidden={requests.outgoing.length === 0}
              inert={requests.outgoing.length === 0}
              className={`min-h-0 min-w-0 overflow-hidden transition-[flex-grow,opacity] duration-300 ease-in-out ${requests.outgoing.length > 0 ? "flex-1 opacity-100" : "pointer-events-none grow-0 basis-0 opacity-0"}`}
            >
              <div className="flex h-full min-h-0 flex-col rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/70">
                    Sent
                  </p>
                  <span className="rounded-full border border-amber-300/20 bg-amber-300/10 px-2 py-0.5 font-mono text-[11px] leading-4 text-amber-200/80">
                    {requests.outgoing.length} pending
                  </span>
                </div>
<ul className="rival-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                      {requests.outgoing.map((r) => (
                        <li
                          key={r.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border border-dashed border-white/15 bg-zinc-950/60 px-3 py-2 transition-all duration-300 ${leaving === `rivalry:${r.id}` ? "pointer-events-none -translate-x-6 opacity-0" : ""}`}
                        >
<span className="flex min-w-0 items-center gap-2">
                            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-300" aria-hidden="true" />
                            <a
                              href={`https://github.com/${r.toUsername}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={`Open @${r.toUsername} on GitHub`}
                              className="group/link flex min-w-0 items-center gap-1 font-mono text-sm text-zinc-300 transition-colors hover:text-white hover:underline hover:decoration-white/40 hover:underline-offset-4"
                            >
                              <span className="min-w-0 truncate">@{r.toUsername}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-70" aria-hidden="true" />
                            </a>
                          </span>
                          <span className="flex shrink-0 items-center gap-1.5">
                            <button
                          type="button"
disabled={acting === `rivalry:${r.id}` || leaving === `rivalry:${r.id}`}
                              onClick={() => handleCancel(r.id)}
                          className="shrink-0 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-zinc-400 transition-colors hover:border-red-400/40 hover:text-red-300 disabled:opacity-50 disabled:hover:border-white/15 disabled:hover:text-zinc-400"
                        >
                          Cancel
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10">
                <p className="shrink-0 px-4 pt-4 pb-2 text-sm font-semibold text-zinc-200">
                  Suggestions
                </p>
                <div className="rival-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10">
                <div className=" bg-zinc-950/40 p-3">
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
                          <a
                            href={`https://github.com/${s.login}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={`Open @${s.login} on GitHub`}
                            className="group/link flex min-w-0 items-center gap-1 font-mono text-sm text-zinc-200 transition-colors hover:text-white hover:underline hover:decoration-white/40 hover:underline-offset-4"
                          >
                            <span className="min-w-0 truncate">@{s.login}</span>
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover/link:opacity-70" aria-hidden="true" />
                          </a>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
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
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                </div>
                </div>
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-zinc-950 to-transparent" />
            </div>
            </div>
              </>
            )}
          </div>
        </div>
      )}

      {acceptLoader && (
        <PixelPreloader
          key={acceptKey}
          replayKey={acceptKey}
          fillMode="rise"
          duration={2200}
          pixelSize={14}
          gap={4}
          fill="#118d04"
          accent="#4ade80"
          background="#09090b"
          counterLabel="LOCKING IN YOUR RIVALRY"
          icon="pulse"
          onComplete={() => {
            setAcceptLoader(false);
            if (acceptedRef.current) {
              acceptedRef.current = false;
              // 2s grace so the PENDING → ACTIVE flip has room to settle
              // server-side before the fresh page re-reads it. The flag tells
              // the fresh page the accept overlay already played, so the boot
              // screen doesn't replay as a second loader.
              setTimeout(() => {
                try {
                  window.sessionStorage.setItem("pushr:just-accepted", Date.now().toString());
                } catch {
                  // storage unavailable — boot screen will simply replay
                }
                window.location.reload();
              }, 2000);
            }
          }}
        />
      )}
    </>

  );
}
