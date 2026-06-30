#!/usr/bin/env node
import "dotenv/config";
import { createAdminClient } from "@/lib/db/admin";

const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || "90", 10);

async function cleanupOldEvents() {
  console.log(
    `[cleanup] Starting cleanup of events older than ${RETENTION_DAYS} days...`
  );

  const supabase = createAdminClient();
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);
  const cutoffISO = cutoffDate.toISOString();

  try {
    // Delete old page_events
    const eventsResult = await supabase
      .from("page_events")
      .delete()
      .lt("created_at", cutoffISO);

    if (eventsResult.error) {
      throw new Error(`Error deleting page_events: ${eventsResult.error.message}`);
    }

    console.log(
      `[cleanup] ✓ Deleted ${eventsResult.count || 0} old events`
    );

    // Delete old page_views
    const viewsResult = await supabase
      .from("page_views")
      .delete()
      .lt("created_at", cutoffISO);

    if (viewsResult.error) {
      throw new Error(`Error deleting page_views: ${viewsResult.error.message}`);
    }

    console.log(`[cleanup] ✓ Deleted ${viewsResult.count || 0} old views`);

    // Clean up old ip_activity_log
    const activityResult = await supabase
      .from("ip_activity_log")
      .delete()
      .lt("created_at", cutoffISO);

    if (activityResult.error) {
      throw new Error(
        `Error deleting ip_activity_log: ${activityResult.error.message}`
      );
    }

    console.log(
      `[cleanup] ✓ Deleted ${activityResult.count || 0} old activity logs`
    );

    console.log("[cleanup] ✓ Cleanup completed successfully");
    process.exit(0);
  } catch (error) {
    console.error("[cleanup] ✗ Error during cleanup:", error);
    process.exit(1);
  }
}

cleanupOldEvents();
