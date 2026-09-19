import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { toActivityRow } from "@/lib/github";

// GitHub webhook receiver: POST /api/webhook/github
// Configure in GitHub repo/org settings → Webhooks with content type
// application/json, secret = GITHUB_WEBHOOK_SECRET, and subscribed events:
// push, star, fork, create, pull_request, issues.

// --- signature verification (fail closed) ---
function verifySignature(rawBody, signature, secret) {
    if (!signature || !secret) return false;
    const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
}

// --- webhook delivery → Events-API shape (single mapping source: toActivityRow) ---
// Delivery payloads differ per event, so normalize to what toActivityRow()
// expects. Returns null for deliveries outside the MVP ActivityType enum.
function toEventsApiShape(deliveryId, githubEvent, payload) {
    const sender = payload.sender?.login ?? null;
    const repo = payload.repository
        ? {
              id: payload.repository.id ?? null,
              name: payload.repository.full_name ?? null,
              url: payload.repository.html_url ?? null,
          }
        : {};
    const now = new Date().toISOString();
    const base = { id: deliveryId, actor: { login: sender }, repo };

    switch (githubEvent) {
        case "push": {
            // Branch deletions carry no commits — nothing to score or notify.
            if (payload.deleted === true) return null;
            const commits = payload.commits || [];
            if (commits.length === 0) return null;
            return {
                ...base,
                type: "PushEvent",
                created_at: payload.head_commit?.timestamp ?? now,
                actor: { login: sender ?? payload.pusher?.name ?? null },
                payload: {
                    ref: payload.ref ?? null,
                    head: payload.after ?? null,
                    size: commits.length,
                    // Raw shape on purpose: toActivityRow() does the
                    // short-sha / first-line / author shaping exactly once.
                    commits: commits.slice(0, 10).map((c) => ({
                        sha: c.id ?? null,
                        message: c.message ?? null,
                        author: c.author ?? null,
                    })),
                },
            };
        }
        case "star":
            if (payload.action !== "created") return null;
            return {
                ...base,
                type: "WatchEvent",
                created_at: payload.starred_at ?? now,
                payload: { action: "started" },
            };
        case "fork":
            return {
                ...base,
                type: "ForkEvent",
                created_at: now,
                payload: {
                    forkee: {
                        full_name: payload.forkee?.full_name ?? null,
                        html_url: payload.forkee?.html_url ?? null,
                    },
                },
            };
        case "create":
            if (payload.ref_type !== "repository") return null;
            return {
                ...base,
                type: "CreateEvent",
                created_at: now,
                payload: {
                    ref_type: payload.ref_type,
                    description: payload.description ?? null,
                },
            };
        case "pull_request": {
            const pr = payload.pull_request || {};
            return {
                ...base,
                type: "PullRequestEvent",
                created_at: pr.updated_at ?? now,
                payload: {
                    action: payload.action ?? null,
                    number: payload.number ?? null,
                    pull_request: {
                        title: pr.title ?? null,
                        merged: pr.merged === true,
                        html_url: pr.html_url ?? null,
                    },
                },
            };
        }
        case "issues": {
            const issue = payload.issue || {};
            return {
                ...base,
                type: "IssuesEvent",
                created_at: issue.updated_at ?? now,
                payload: {
                    action: payload.action ?? null,
                    issue: {
                        number: issue.number ?? null,
                        title: issue.title ?? null,
                        html_url: issue.html_url ?? null,
                    },
                },
            };
        }
        default:
            return null;
    }
}

export async function POST(req) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
        console.error("GITHUB_WEBHOOK_SECRET is not configured");
        return NextResponse.json({ error: "webhook not configured" }, { status: 500 });
    }

    const signature = req.headers.get("x-hub-signature-256");
    const githubEvent = req.headers.get("x-github-event");
    const deliveryId = req.headers.get("x-github-delivery");
    const rawBody = await req.text();

    if (!deliveryId || !verifySignature(rawBody, signature, secret)) {
        return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }

    // Health-check handshake when the webhook is first saved in GitHub.
    if (githubEvent === "ping") {
        return NextResponse.json({ msg: "pong" });
    }

    let payload;
    try {
        payload = JSON.parse(rawBody);
    } catch {
        return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
    }

    // Only store activity for users already in our DB — outsiders are skipped
    // (200, so GitHub doesn't waste retries on them).
    const username = payload.sender?.login ?? payload.pusher?.name ?? null;
    if (!username) {
        return NextResponse.json({ stored: false, reason: "no-actor" });
    }
    const user = await prisma.user.findUnique({
        where: { github_username: username },
        select: { id: true },
    });
    if (!user) {
        return NextResponse.json({ stored: false, reason: "unknown-user" });
    }

    const shaped = toEventsApiShape(deliveryId, githubEvent, payload);
    if (!shaped) {
        return NextResponse.json({ stored: false, reason: "unsupported-event" });
    }
    const row = toActivityRow(shaped);
    if (!row) {
        return NextResponse.json({ stored: false, reason: "unsupported-event" });
    }

    // Link the activity to its repository, auto-creating the row from the
    // delivery when it was never synced. user_id must reference an existing
    // user, so creation only happens when the repo owner (or the sender)
    // is in our DB — otherwise repository_id stays null.
    let repository_id = null;
    const repoPayload = payload.repository;
    if (repoPayload && typeof repoPayload.id === "number") {
        const dbRepo = await prisma.repository.findUnique({
            where: { github_repo_id: repoPayload.id },
            select: { id: true },
        });
        if (dbRepo) {
            repository_id = dbRepo.id;
        } else {
            const ownerLogin = repoPayload.owner?.login ?? null;
            let ownerRow = null;
            for (const login of [ownerLogin, username]) {
                if (!login) continue;
                ownerRow = await prisma.user.findUnique({
                    where: { github_username: login },
                    select: { github_username: true },
                });
                if (ownerRow) break;
            }
            if (ownerRow) {
                const createdAt =
                    typeof repoPayload.created_at === "number"
                        ? new Date(repoPayload.created_at * 1000) // webhook sends unix seconds
                        : repoPayload.created_at
                          ? new Date(repoPayload.created_at)
                          : new Date();
                const shortName =
                    repoPayload.name ?? repoPayload.full_name?.split("/")[1] ?? "unknown";
                try {
                    const createdRepo = await prisma.repository.create({
                        data: {
                            github_repo_id: repoPayload.id,
                            user_id: ownerRow.github_username,
                            name: shortName,
                            full_name:
                                repoPayload.full_name ??
                                `${ownerRow.github_username}/${shortName}`,
                            description: repoPayload.description ?? null,
                            private: repoPayload.private ?? false,
                            language: repoPayload.language ?? null,
                            is_fork: repoPayload.fork ?? false,
                            github_url:
                                repoPayload.html_url ??
                                `https://github.com/${repoPayload.full_name ?? ""}`,
                            github_created_at: createdAt,
                        },
                        select: { id: true },
                    });
                    repository_id = createdRepo.id;
                } catch (e) {
                    // Raced with the repo sync — re-read the winner.
                    if (e?.code === "P2002") {
                        const reread = await prisma.repository.findUnique({
                            where: { github_repo_id: repoPayload.id },
                            select: { id: true },
                        });
                        repository_id = reread?.id ?? null;
                    } else {
                        console.error("webhook auto-create repo failed:", e);
                    }
                }
            }
        }
    }

    try {
        const created = await prisma.activity.create({
            data: {
                ...row,
                user_id: user.id,
                repository_id,
                // Scoring is not finalized — keep neutral (see AGENTS.md).
                points_awarded: 0,
            },
        });
        return NextResponse.json({ stored: true, id: created.id, type: row.type });
    } catch (e) {
        // GitHub redelivers on failure — the delivery id dedups retries.
        if (e?.code === "P2002") {
            return NextResponse.json({ stored: false, reason: "duplicate" });
        }
        console.error("webhook/github store failed:", e);
        return NextResponse.json({ error: "store failed" }, { status: 500 });
    }
}
