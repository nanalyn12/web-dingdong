// Daily learning-activity counters (KST). One row per user per day; every
// bump upserts the row so even a zero-count bump marks the day active
// (used by the dashboard streak).
import { sql } from "drizzle-orm";

export type ActivityField =
  | "reviews"
  | "words_added"
  | "lessons"
  | "videos"
  | "quizzes";

/** Today's date in KST as "YYYY-MM-DD". */
export function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

export async function bumpActivity(
  userId: string,
  counts: Partial<Record<ActivityField, number>>,
): Promise<void> {
  const { db, tables } = await import("@/db");
  const t = tables.learning_activity;
  const values = {
    user_id: userId,
    activity_date: kstToday(),
    reviews: counts.reviews ?? 0,
    words_added: counts.words_added ?? 0,
    lessons: counts.lessons ?? 0,
    videos: counts.videos ?? 0,
    quizzes: counts.quizzes ?? 0,
  };
  await db
    .insert(t)
    .values(values)
    .onConflictDoUpdate({
      target: [t.user_id, t.activity_date],
      set: {
        reviews: sql`${t.reviews} + ${values.reviews}`,
        words_added: sql`${t.words_added} + ${values.words_added}`,
        lessons: sql`${t.lessons} + ${values.lessons}`,
        videos: sql`${t.videos} + ${values.videos}`,
        quizzes: sql`${t.quizzes} + ${values.quizzes}`,
        updated_at: sql`now()`,
      },
    });
}
