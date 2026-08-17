import { createFileRoute } from "@tanstack/react-router";

// 백업 파일 다운로드. URL의 id만으로는 아무것도 내주지 않는다:
//
//   세션에서 사용자 확인 → 그 사용자가 소유한 백업인지 DB에서 확인 → 파일 전송
//
// 남의 백업 id를 넣으면 소유자 조건이 붙은 조회가 0행을 돌려주므로 404가 된다.
// 존재하지 않는 id와 남의 id를 같은 응답으로 처리해 존재 여부도 흘리지 않는다.
// 파일은 공개 URL이 없는 볼륨 경로에 있고, 이 라우트만이 유일한 출구다.
export const Route = createFileRoute("/api/backups/$id/download")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const { auth } = await import("@/lib/auth.server");
        const session = await auth.api.getSession({ headers: request.headers });
        if (!session?.user) return new Response("Unauthorized", { status: 401 });

        const backupId = (params as { id?: string }).id ?? "";
        const { assertOwnedBackup } = await import("@/lib/tenant-backup.functions");
        const row = await assertOwnedBackup(session.user.id, backupId);
        if (!row || row.status !== "completed" || !row.file_name) {
          return new Response("Not found", { status: 404 });
        }

        const { readBackupGzip, writeAudit } = await import("@/lib/tenant-backup.server");
        let body: Buffer;
        try {
          body = await readBackupGzip(session.user.id, backupId);
        } catch {
          return new Response("Not found", { status: 404 });
        }

        await writeAudit({
          userId: session.user.id,
          backupId,
          action: "backup_downloaded",
          detail: { bytes: body.byteLength },
        });

        const stamp = row.created_at.slice(0, 19).replace(/[:T]/g, "").replace(/-/g, "");
        return new Response(new Uint8Array(body), {
          headers: {
            "content-type": "application/gzip",
            "content-length": String(body.byteLength),
            "content-disposition": `attachment; filename="dingdong-backup-${stamp}.json.gz"`,
            // 백업은 개인 데이터다 — 중간 캐시에 절대 남기지 않는다.
            "cache-control": "no-store, private",
          },
        });
      },
    },
  },
});
