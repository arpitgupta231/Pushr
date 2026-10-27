import { NextResponse } from "next/server";
import { syncAllUserActivities } from "@/lib/activity";
import { updateAllRivalryScores } from "@/lib/rivalry";
import { syncGeneralUserData } from "@/lib/sync";

/**
 * Scheduled Activity Sync & Rivalry Scoring Cron (Runs every 5 min via Railway):
 *
 * GET /api/cron/activities
 *
 * Architecture:
 *   1. syncGeneralUserData():
 *      - Active-rivalry users: synced every 5 minutes
 *      - All other users: synced when last_synced_at is > 30 minutes old (or null)
 *      - Updates profile stats, commits, streaks, friends, following count, starred repos, repositories, last_synced_at
 *      - Non-rival users also ingest GitHub Events here, stored with 0 points and never applied to rivalry scores
 *   2. syncAllUserActivities({ onlyActive: true }):
 *      - Polls GitHub Events API strictly for active-rivalry users (5-minute cycle)
 *   3. updateAllRivalryScores():
 *      - Recalculates and updates scores for all active rivalries
 *
 * Protected with CRON_SECRET if configured.
 */
export async function GET(request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // 1. General user GitHub sync (active users every 5m; non-active users > 30m)
    const generalSync = await syncGeneralUserData();

    // 2. Rivalry activity tracking strictly for users in active rivalries
    const activitySyncResults = await syncAllUserActivities({ onlyActive: true });

    // 3. Recalculate scores for all active rivalries
    const updatedRivalries = await updateAllRivalryScores();

    return NextResponse.json({
      ok: true,
      generalSync: {
        activeUsersSynced: generalSync.activeCount,
        periodicUsersSynced: generalSync.periodicCount,
        totalUsersSynced: generalSync.totalSynced,
        nonRivalActivitySync: {
          usersSynced: generalSync.activityResults.length,
          results: generalSync.activityResults,
        },
      },
      activitySync: {
        usersSynced: activitySyncResults.length,
        results: activitySyncResults,
      },
      rivalries: {
        updatedCount: updatedRivalries.length,
        results: updatedRivalries,
      },
    });
  } catch (error) {
    console.error("[cron/activities] Error in scheduled sync pipeline:", error);
    return NextResponse.json(
      { error: "Internal server error", message: error?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}

export const POST = GET;
