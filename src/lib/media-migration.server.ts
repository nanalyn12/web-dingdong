// One-shot rescue for media still hosted on Supabase Storage (signed URLs
// left over from the Lovable era). Downloads each file onto the persistent
// media volume and rewrites the DB to site-relative /media/* URLs, so the
// Supabase project can be deleted without breaking content.
// Idempotent: it only touches rows that still contain a supabase.co URL,
// so after one successful run it becomes a cheap no-op.
import { ilike, or, eq, sql } from "drizzle-orm";

declare global {
  // eslint-disable-next-line no-var
  var __supabaseMediaMigrationStarted: boolean | undefined;
}

const SUPABASE_URL_RE = /https:\/\/[^\s"')\\]+\.supabase\.co\/storage\/[^\s"')\\]*/g;

function destPath(sourceUrl: string, prefix: string): string {
  const base = new URL(sourceUrl).pathname.split("/").pop() || "file";
  return `${prefix}/${base}`;
}

export async function migrateSupabaseMedia(): Promise<void> {
  if (globalThis.__supabaseMediaMigrationStarted) return;
  globalThis.__supabaseMediaMigrationStarted = true;

  // Local dev shares the production DATABASE_URL, so running this anywhere
  // but Railway would rewrite prod URLs while saving files to a local disk.
  if (!process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_PROJECT_ID) return;

  const { db, tables } = await import("@/db");
  const { downloadAndStore } = await import("@/lib/suno.server");

  // Download each distinct URL once, even if referenced from several places.
  const moved = new Map<string, string>();
  const move = async (sourceUrl: string, prefix: string): Promise<string> => {
    const hit = moved.get(sourceUrl);
    if (hit) return hit;
    const { url } = await downloadAndStore(sourceUrl, destPath(sourceUrl, prefix), "");
    moved.set(sourceUrl, url);
    console.log(`[media-migration] ${sourceUrl.split("?")[0]} → ${url}`);
    return url;
  };

  let migrated = 0;
  let failed = 0;

  // Songs: plain URL columns.
  const urlCols = ["media_url", "cover_url", "video_url"] as const;
  const songs = await db
    .select({
      id: tables.songs.id,
      media_url: tables.songs.media_url,
      cover_url: tables.songs.cover_url,
      video_url: tables.songs.video_url,
    })
    .from(tables.songs)
    .where(
      or(...urlCols.map((c) => ilike(tables.songs[c], "%supabase.co/storage%"))),
    );
  for (const song of songs) {
    for (const col of urlCols) {
      const current = song[col];
      if (!current?.includes("supabase.co/storage")) continue;
      try {
        const local = await move(current, `songs/${song.id}`);
        await db
          .update(tables.songs)
          .set({ [col]: local })
          .where(eq(tables.songs.id, song.id));
        migrated++;
      } catch (e) {
        failed++;
        console.error(`[media-migration] songs.${col} ${song.id} failed:`, e);
      }
    }
  }

  // Lessons: URLs embedded in jsonb content (comic panels, storybook, slides).
  const jsonCols = ["comic_panels", "storybook_pages", "slides"] as const;
  const lessons = await db
    .select({
      id: tables.lessons.id,
      comic_panels: tables.lessons.comic_panels,
      storybook_pages: tables.lessons.storybook_pages,
      slides: tables.lessons.slides,
    })
    .from(tables.lessons)
    .where(
      or(
        ...jsonCols.map(
          (c) => sql`${tables.lessons[c]}::text ILIKE '%supabase.co/storage%'`,
        ),
      ),
    );
  for (const lesson of lessons) {
    for (const col of jsonCols) {
      const text = JSON.stringify(lesson[col] ?? null);
      if (!text.includes("supabase.co/storage")) continue;
      try {
        let out = text;
        for (const url of new Set(text.match(SUPABASE_URL_RE) ?? [])) {
          const local = await move(JSON.parse(`"${url}"`), `lessons/${lesson.id}`);
          out = out.replaceAll(url, local);
        }
        await db
          .update(tables.lessons)
          .set({ [col]: JSON.parse(out) })
          .where(eq(tables.lessons.id, lesson.id));
        migrated++;
      } catch (e) {
        failed++;
        console.error(`[media-migration] lessons.${col} ${lesson.id} failed:`, e);
      }
    }
  }

  if (migrated || failed) {
    console.log(
      `[media-migration] done: ${migrated} column(s) migrated, ${failed} failed, ${moved.size} file(s) downloaded`,
    );
  }
}
