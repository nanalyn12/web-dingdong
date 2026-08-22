// 관리자 > 데이터 관리. 백업 생성·다운로드·업로드·복원·삭제를 한 화면에서.
//
// 여기 있는 권한 표시는 편의일 뿐이다 — 실제 차단은 tenant-backup.functions.ts가
// 한다. 이 컴포넌트는 서버가 이미 "내 것"으로 걸러 준 목록만 그린다.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import {
  AlertTriangle,
  Database,
  Download,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BACKUP_TABLES, type BackupTableName, type RestoreMode } from "@/lib/tenant-backup";
import {
  createMyBackup,
  deleteMyBackup,
  importMyBackup,
  listMyBackups,
  previewMyRestore,
  restoreMyBackup,
  type BackupListItem,
} from "@/lib/tenant-backup.functions";

const KIND_LABEL: Record<string, string> = {
  manual: "수동 백업",
  pre_restore: "복원 전 자동 백업",
  imported: "업로드한 백업",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "대기",
  running: "백업 중",
  completed: "완료",
  failed: "실패",
};

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/** 파일을 base64로 읽는다. FileReader의 data URL 앞부분을 잘라낸다. */
function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("파일을 읽지 못했어요."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export function AdminDataManager() {
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [target, setTarget] = useState<BackupListItem | null>(null);

  const callList = useServerFn(listMyBackups);
  const callCreate = useServerFn(createMyBackup);
  const callDelete = useServerFn(deleteMyBackup);
  const callImport = useServerFn(importMyBackup);

  const { data: backups, isLoading } = useQuery({
    queryKey: ["my-backups"],
    queryFn: () => callList({}),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-backups"] });

  const create = useMutation({
    mutationFn: () => callCreate({ data: { label: label.trim() || undefined } }),
    onSuccess: (r) => {
      setLabel("");
      toast.success(`백업을 만들었어요 — ${r.totalRows.toLocaleString("ko-KR")}건`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "백업에 실패했어요."),
  });

  const remove = useMutation({
    mutationFn: (backupId: string) => callDelete({ data: { backupId } }),
    onSuccess: () => {
      toast.success("백업을 삭제했어요.");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "삭제하지 못했어요."),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const contentBase64 = await readAsBase64(file);
      return callImport({ data: { contentBase64 } });
    },
    onSuccess: (r) => {
      toast.success(`백업 파일을 목록에 추가했어요 — ${r.totalRows.toLocaleString("ko-KR")}건`);
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "업로드한 파일을 쓸 수 없어요."),
  });

  return (
    <div className="space-y-6">
      <section className="glass rounded-3xl p-4 sm:p-6">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Database className="size-5 text-primary" /> 데이터 백업
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          내 계정으로 만든 콘텐츠(코스·레슨·영상·학습송·수업 계획서·자동 생성 예약)만 백업합니다.
          다른 제작자의 콘텐츠, 학습자의 단어장·진행률, 계정·인증 정보, 개인 API 키는 백업에
          포함되지 않아요.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="설명 (선택) — 예: 2학기 개편 전"
            maxLength={120}
            className="max-w-xs"
          />
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <HardDriveDownload className="size-4" />
            )}
            백업하기
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
          >
            {upload.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
            백업 파일 업로드
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".gz,.json,application/gzip,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload.mutate(file);
            }}
          />
        </div>
      </section>

      <section className="glass rounded-3xl p-4">
        <div className="flex items-center justify-between px-2 pb-3">
          <h2 className="text-lg font-bold">백업 목록</h2>
          <Button variant="ghost" size="sm" onClick={invalidate}>
            <RefreshCw className="size-4" /> 새로고침
          </Button>
        </div>

        {isLoading && <p className="p-4 text-sm text-muted-foreground">불러오는 중…</p>}
        {backups && backups.length === 0 && (
          <p className="p-6 text-sm text-muted-foreground text-center">
            아직 백업이 없어요. 위에서 첫 백업을 만들어 보세요.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {backups?.map((backup) => (
            <li
              key={backup.id}
              className="rounded-2xl bg-white/70 border border-border p-4 flex flex-wrap items-start gap-4"
            >
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">
                    {new Date(backup.created_at).toLocaleString("ko-KR")}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                    {KIND_LABEL[backup.kind] ?? backup.kind}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border ${
                      backup.status === "completed"
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : backup.status === "failed"
                          ? "bg-red-100 text-red-700 border-red-200"
                          : "bg-amber-100 text-amber-700 border-amber-200"
                    }`}
                  >
                    {STATUS_LABEL[backup.status] ?? backup.status}
                  </span>
                </div>
                {backup.label && <p className="text-sm text-foreground/90">{backup.label}</p>}
                <p className="text-xs text-muted-foreground">
                  {backup.total_rows.toLocaleString("ko-KR")}건 · {formatBytes(backup.bytes)} · 포맷
                  v{backup.backup_version}
                  {backup.app_version ? ` · 앱 ${backup.app_version}` : ""}
                </p>
                {backup.error && <p className="text-xs text-red-600">오류: {backup.error}</p>}
              </div>

              <div className="flex gap-2 shrink-0">
                {backup.restorable ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={`/api/backups/${backup.id}/download`} download>
                      <Download className="size-4" /> 다운로드
                    </a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" disabled>
                    <Download className="size-4" /> 다운로드
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => setTarget(backup)}
                  disabled={!backup.restorable}
                  title={backup.restorable ? undefined : "완료된 백업만 복원할 수 있어요."}
                >
                  <RefreshCw className="size-4" /> 복원
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (confirm("이 백업을 삭제할까요? 되돌릴 수 없어요."))
                      remove.mutate(backup.id);
                  }}
                  disabled={remove.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {target && (
        <RestoreDialog
          backup={target}
          onClose={() => setTarget(null)}
          onDone={() => {
            setTarget(null);
            invalidate();
          }}
        />
      )}
    </div>
  );
}

function RestoreDialog({
  backup,
  onClose,
  onDone,
}: {
  backup: BackupListItem;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<RestoreMode>("merge");
  const [selected, setSelected] = useState<BackupTableName[]>(
    BACKUP_TABLES.map((spec) => spec.name),
  );
  const callPreview = useServerFn(previewMyRestore);
  const callRestore = useServerFn(restoreMyBackup);

  const tables = selected.length > 0 ? selected : undefined;

  const { data: preview, isLoading: previewing } = useQuery({
    queryKey: ["restore-preview", backup.id, mode, selected.join(",")],
    queryFn: () => callPreview({ data: { backupId: backup.id, mode, tables } }),
    enabled: selected.length > 0,
  });

  const restore = useMutation({
    mutationFn: () => callRestore({ data: { backupId: backup.id, mode, tables } }),
    onSuccess: (r) => {
      toast.success(
        `복원 완료 — 추가 ${r.totals.inserts}건, 수정 ${r.totals.updates}건, 삭제 ${r.totals.deletes}건`,
      );
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "복원에 실패했어요."),
  });

  function toggle(name: BackupTableName, on: boolean) {
    setSelected((prev) => (on ? [...prev, name] : prev.filter((t) => t !== name)));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !restore.isPending && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500" /> 데이터 복원
          </DialogTitle>
          <DialogDescription>
            백업일: {new Date(backup.created_at).toLocaleString("ko-KR")} · 데이터 수:{" "}
            {backup.total_rows.toLocaleString("ko-KR")}건
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <p className="font-medium">복원 방식</p>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="restore-mode"
                className="mt-1"
                checked={mode === "merge"}
                onChange={() => setMode("merge")}
              />
              <span>
                <span className="font-medium">병합 (권장)</span>
                <span className="block text-xs text-muted-foreground">
                  백업에 있는 항목만 되살리거나 덮어씁니다. 아무것도 삭제하지 않아요.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="restore-mode"
                className="mt-1"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
              />
              <span>
                <span className="font-medium">전체 교체</span>
                <span className="block text-xs text-muted-foreground">
                  백업에 없는 내 콘텐츠를 삭제합니다. 삭제된 레슨·영상에 딸린{" "}
                  <strong>학습자의 진행 기록도 함께 사라집니다.</strong>
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-2">
            <p className="font-medium">복원할 항목</p>
            <div className="grid grid-cols-2 gap-1.5">
              {BACKUP_TABLES.map((spec) => (
                <label
                  key={spec.name}
                  // The box stays 16px; the label is what takes the tap.
                  className="flex min-h-11 cursor-pointer items-center gap-2 text-xs md:min-h-0"
                >
                  <Checkbox
                    checked={selected.includes(spec.name)}
                    onCheckedChange={(v) => toggle(spec.name, v === true)}
                  />
                  {spec.label}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded-xl bg-muted/60 border border-border p-3 space-y-1">
            {previewing && <p className="text-xs text-muted-foreground">변경 내용 계산 중…</p>}
            {preview && (
              <>
                <p className="text-xs">
                  추가 <strong>{preview.totals.inserts.toLocaleString("ko-KR")}</strong>건 · 수정{" "}
                  <strong>{preview.totals.updates.toLocaleString("ko-KR")}</strong>건 · 삭제{" "}
                  <strong>{preview.totals.deletes.toLocaleString("ko-KR")}</strong>건 · 건너뜀{" "}
                  <strong>{preview.totals.skipped.toLocaleString("ko-KR")}</strong>건
                </p>
                {preview.totals.skipped > 0 && (
                  <p className="text-xs text-muted-foreground">
                    건너뛴 항목은 다른 사람이 소유했거나 참조 대상이 사라진 데이터예요.
                  </p>
                )}
                {preview.sharedDeletes > 0 && (
                  <p className="text-xs text-red-600">
                    공유 콘텐츠 {preview.sharedDeletes}건이 삭제됩니다 — 여기에 딸린 학습자 진행
                    기록도 함께 사라져요.
                  </p>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            복원하면 현재 데이터가 백업 시점의 상태로 변경될 수 있습니다. 복원 전에 현재 데이터를
            자동으로 백업하고, 도중에 실패하면 전체를 되돌립니다.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={restore.isPending}>
            취소
          </Button>
          <Button
            onClick={() => restore.mutate()}
            disabled={restore.isPending || selected.length === 0}
          >
            {restore.isPending && <Loader2 className="size-4 animate-spin" />}
            복원하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
