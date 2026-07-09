import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getMyProfile, saveOnboarding } from "@/lib/profile.functions";
import { requestTeacher } from "@/lib/admin.functions";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_app/onboarding")({
  head: () => ({ meta: [{ title: "프로필 설정 — DingDong" }] }),
  component: OnboardingPage,
});

const JOBS: { value: "high_school" | "university" | "teacher" | "worker" | "other"; label: string }[] = [
  { value: "high_school", label: "고등학생" },
  { value: "university", label: "대학생" },
  { value: "teacher", label: "교사" },
  { value: "worker", label: "직장인" },
  { value: "other", label: "기타" },
];

const INTERESTS = [
  "여행", "비즈니스", "드라마/영화", "음악", "음식",
  "역사·문화", "시험 대비(HSK)", "일상 회화", "유학",
];

function OnboardingPage() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const save = useServerFn(saveOnboarding);
  const apply = useServerFn(requestTeacher);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile({}),
  });

  const [realName, setRealName] = useState("");
  const [nickname, setNickname] = useState("");
  const [job, setJob] = useState<typeof JOBS[number]["value"]>("worker");
  const [goal, setGoal] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [hsk, setHsk] = useState(3);

  useEffect(() => {
    if (!profile) return;
    setRealName(profile.real_name ?? "");
    setNickname(profile.nickname ?? "");
    if (profile.job) setJob(profile.job);
    setGoal(profile.learning_goal ?? "");
    setInterests(profile.interest_categories ?? []);
    if (profile.hsk_goal) setHsk(profile.hsk_goal);
  }, [profile]);

  useEffect(() => {
    // If not signed in, kick to auth.
    authClient.getSession().then(({ data }) => {
      if (!data?.user) navigate({ to: "/auth", search: { redirect: "/onboarding" } });
    });
  }, [navigate]);

  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          real_name: realName.trim(),
          nickname: nickname.trim(),
          job,
          learning_goal: goal.trim(),
          interest_categories: interests,
          hsk_goal: hsk,
        },
      }),
    onSuccess: () => {
      toast.success("프로필을 저장했어요!");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
      navigate({ to: "/" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "저장 실패"),
  });

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyName, setApplyName] = useState("");
  const [applyPhone, setApplyPhone] = useState("");
  const [applyJob, setApplyJob] = useState<typeof JOBS[number]["value"]>("teacher");
  const [applySchool, setApplySchool] = useState("");
  const [applyDepartment, setApplyDepartment] = useState("");
  const [myEmail, setMyEmail] = useState<string>("");

  useEffect(() => {
    authClient.getSession().then(({ data }) => {
      setMyEmail(data?.user?.email ?? "");
    });
  }, []);

  function openApplyDialog() {
    setApplyName(profile?.real_name ?? realName ?? "");
    setApplyPhone(profile?.phone ?? "");
    setApplyJob(profile?.job ?? job);
    setApplySchool(profile?.teacher_school ?? "");
    setApplyDepartment(profile?.teacher_department ?? "");
    setApplyOpen(true);
  }

  const applyMutation = useMutation({
    mutationFn: (v: {
      realName: string;
      phone: string;
      job: typeof JOBS[number]["value"];
      school: string;
      department: string;
    }) => apply({ data: v }),
    onSuccess: (r) => {
      if (r && (r as { already?: boolean }).already) {
        toast.info("이미 신청했거나 권한이 있어요.");
      } else {
        toast.success("교사 권한을 신청했어요. 관리자 승인 후 사용 가능해요.");
      }
      setApplyOpen(false);
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "신청 실패"),
  });

  function toggleInterest(name: string) {
    setInterests((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name],
    );
  }

  if (isLoading) return <p className="p-8 text-muted-foreground">불러오는 중…</p>;

  return (
    <div className="max-w-2xl mx-auto">
      <section className="glass rounded-3xl p-8 space-y-6">
        <header>
          <h1 className="text-3xl font-bold">叮叮과 처음 만나요</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            맞춤 학습을 위해 간단한 정보를 알려주세요.
          </p>
        </header>

        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!realName.trim() || !nickname.trim()) {
              toast.error("실명과 닉네임은 필수예요.");
              return;
            }
            mutation.mutate();
          }}
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rn">실명 *</Label>
              <Input id="rn" value={realName} onChange={(e) => setRealName(e.target.value)} required maxLength={80} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nn">닉네임 *</Label>
              <Input id="nn" value={nickname} onChange={(e) => setNickname(e.target.value)} required maxLength={40} />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>직업</Label>
              <Select value={job} onValueChange={(v) => setJob(v as typeof job)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOBS.map((j) => (
                    <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hsk">HSK 목표 급수 ({hsk}급)</Label>
              <input
                id="hsk"
                type="range"
                min={1}
                max={9}
                value={hsk}
                onChange={(e) => setHsk(Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal">학습 목표</Label>
            <Textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="예: 출장에서 일상 회화를 자신 있게 하고 싶어요"
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <Label>관심 카테고리 (복수 선택)</Label>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((name) => {
                const active = interests.includes(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleInterest(name)}
                    className={[
                      "rounded-full px-3 py-1.5 text-sm border transition",
                      active
                        ? "gradient-primary text-primary-foreground border-transparent"
                        : "bg-white/60 border-border hover:bg-white",
                    ].join(" ")}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
            저장하고 시작하기
          </Button>
        </form>
      </section>

      <section className="glass rounded-3xl p-6 mt-6 space-y-3">
        <h2 className="font-bold text-lg">교사(교수) 권한 신청</h2>
        <p className="text-sm text-muted-foreground">
          강의/세부 강의를 직접 만들고 싶다면 신청해 주세요. 관리자 승인 후 활성화됩니다.
          승인 전까지는 학생과 동일한 권한으로 학습할 수 있어요.
        </p>
        {profile?.role === "teacher" || profile?.role === "admin" ? (
          <p className="text-sm font-medium text-primary">
            ✅ 이미 {profile.role === "admin" ? "관리자" : "교사"} 권한이 있어요.
          </p>
        ) : profile?.teacher_status === "pending" ? (
          <p className="text-sm font-medium text-amber-600">⏳ 승인 대기 중이에요.</p>
        ) : profile?.teacher_status === "rejected" ? (
          <>
            <p className="text-sm font-medium text-rose-600">이전 신청이 거절되었어요.</p>
            <Button variant="outline" onClick={openApplyDialog}>다시 신청하기</Button>
          </>
        ) : (
          <Button variant="outline" onClick={openApplyDialog}>교사 권한 신청하기</Button>
        )}
      </section>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>교사 권한 신청</DialogTitle>
            <DialogDescription>
              관리자가 검토할 수 있도록 아래 정보를 입력해 주세요. 이메일은 현재 로그인
              계정으로 자동 전송돼요.
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              const name = applyName.trim();
              const phone = applyPhone.trim();
              const school = applySchool.trim();
              const department = applyDepartment.trim();
              if (name.length < 2) return toast.error("실명을 입력해 주세요.");
              if (!/^[0-9+\-\s()]{9,20}$/.test(phone))
                return toast.error("올바른 전화번호를 입력해 주세요.");
              if (school.length < 2)
                return toast.error("재직/강의 중인 학교 이름을 입력해 주세요.");
              if (!department)
                return toast.error("학과를 입력해 주세요.");
              applyMutation.mutate({
                realName: name,
                phone,
                job: applyJob,
                school,
                department,
              });
            }}
          >
            <div className="space-y-2">
              <Label>이메일</Label>
              <Input value={myEmail} readOnly disabled />
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ap-name">실명 *</Label>
                <Input
                  id="ap-name"
                  value={applyName}
                  onChange={(e) => setApplyName(e.target.value)}
                  required
                  maxLength={80}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-phone">전화번호 *</Label>
                <Input
                  id="ap-phone"
                  value={applyPhone}
                  onChange={(e) => setApplyPhone(e.target.value)}
                  placeholder="010-1234-5678"
                  required
                  maxLength={20}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>직업 *</Label>
              <Select
                value={applyJob}
                onValueChange={(v) => setApplyJob(v as typeof applyJob)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JOBS.map((j) => (
                    <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ap-school">재직/강의 중인 학교 *</Label>
                <Input
                  id="ap-school"
                  value={applySchool}
                  onChange={(e) => setApplySchool(e.target.value)}
                  placeholder="예: 서울고등학교"
                  required
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ap-department">학과 *</Label>
                <Input
                  id="ap-department"
                  value={applyDepartment}
                  onChange={(e) => setApplyDepartment(e.target.value)}
                  placeholder="예: 중국어과"
                  required
                  maxLength={100}
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setApplyOpen(false)}
                disabled={applyMutation.isPending}
              >
                취소
              </Button>
              <Button type="submit" disabled={applyMutation.isPending}>
                {applyMutation.isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
                신청 제출
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
