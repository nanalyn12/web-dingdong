export type FaqCategory =
  | "platform"
  | "lesson"
  | "feature"
  | "dingdong";

export type FaqItem = {
  id: string;
  category: FaqCategory;
  q: string;
  a: string;
};

export const FAQ_CATEGORIES: { key: FaqCategory; label: string; emoji: string }[] = [
  { key: "platform", label: "플랫폼 이용 방법", emoji: "🏠" },
  { key: "lesson", label: "강의 수강 방법", emoji: "📚" },
  { key: "feature", label: "학습 기능 사용법", emoji: "🛠️" },
  { key: "dingdong", label: "叮叮 사용법", emoji: "🐼" },
];

export const FAQ_ITEMS: FaqItem[] = [
  // Platform
  {
    id: "p1",
    category: "platform",
    q: "DingDong은 어떻게 사용하나요?",
    a: "DingDong은 한국인 성인 학습자를 위한 AI 중국어 LMS예요. 회원가입 없이도 모든 강의를 둘러보고 학습할 수 있고, 가입하면 단어장·진도가 계정에 저장돼요. 加油! (jiā yóu, 화이팅!)",
  },
  {
    id: "p2",
    category: "platform",
    q: "꼭 로그인해야 하나요?",
    a: "아니요! 게스트로도 강의·드라마·학습송을 자유롭게 이용할 수 있어요. 다만 단어장 영구 저장, 진도 동기화, PDF 이력 등은 로그인 사용자만 가능해요.",
  },
  {
    id: "p3",
    category: "platform",
    q: "회원가입은 어떻게 하나요?",
    a: "우측 상단의 「로그인」을 누르면 아이디/비밀번호 또는 Google 계정으로 가입할 수 있어요. 이메일이 없어도 아이디만으로 가입 가능합니다.",
  },
  {
    id: "p4",
    category: "platform",
    q: "학생·교수자·관리자 차이가 뭔가요?",
    a: "🌱 학생은 모든 콘텐츠를 학습할 수 있어요. 🎓 교수자는 본인이 만든 강의를 관리하고, 👑 관리자는 모든 강의·사용자를 관리해요. 교수자 권한은 관리자가 승인합니다.",
  },

  // Lesson
  {
    id: "l1",
    category: "lesson",
    q: "강의는 어디서 찾나요?",
    a: "왼쪽 사이드바의 「강의」를 누르거나, 홈 화면의 카테고리 카드에서 시작할 수 있어요. 사이드바 아래쪽 「세부 강의 목록」에서 각 주차별 강의도 한눈에 볼 수 있어요.",
  },
  {
    id: "l2",
    category: "lesson",
    q: "강의 한 편에는 뭐가 들어있나요?",
    a: "본문 · 핵심표현 · 문화 노트 · 실전 대화 · 슬라이드 · 만화 · 동화 · 영상 · 퀴즈까지 9개 섹션이 있어요. 위쪽 탭으로 자유롭게 이동하세요.",
  },
  {
    id: "l3",
    category: "lesson",
    q: "진도는 자동으로 저장되나요?",
    a: "네! 로그인한 사용자는 서버에, 게스트는 브라우저(localStorage)에 자동 저장돼요. 같은 브라우저에서 이어 보면 마지막 위치로 돌아갈 수 있어요.",
  },
  {
    id: "l4",
    category: "lesson",
    q: "강의를 PDF로 저장할 수 있나요?",
    a: "각 강의 우측 상단의 「PDF 저장」 버튼을 누르면 학습 내용을 PDF로 내려받을 수 있어요. 게스트도 사용 가능해요.",
  },
  {
    id: "l5",
    category: "lesson",
    q: "퀴즈는 어떻게 푸나요?",
    a: "강의 페이지에서 「퀴즈」 탭을 열면 인터랙티브 퀴즈가 시작돼요. 연속 정답 스트릭이 표시되고, 틀려도 다시 시도할 수 있어요.",
  },

  // Feature
  {
    id: "f1",
    category: "feature",
    q: "단어장은 어떻게 쓰나요?",
    a: "강의 본문의 핵심표현 카드에서 「+ 단어장」 버튼을 누르면 저장돼요. 사이드바 「단어장」에서 모은 단어를 보고, AI 연습 다이얼로그로 예문·플래시카드를 풀 수 있어요.",
  },
  {
    id: "f2",
    category: "feature",
    q: "발음 테스트는 어떻게 하나요?",
    a: "단어 카드의 🎤 버튼을 누르고 중국어로 말해보세요. 브라우저 음성 인식이 결과를 비교해서 점수와 피드백을 알려줘요. (Chrome 권장)",
  },
  {
    id: "f3",
    category: "feature",
    q: "학습송은 뭔가요?",
    a: "사이드바 「학습송」에서 AI가 만든 중국어 노래로 어휘를 익혀요. 가사 줄을 클릭하면 해당 부분으로 점프하고, 영상은 다운로드도 가능해요.",
  },
  {
    id: "f4",
    category: "feature",
    q: "영상 학습은 어떻게 작동하나요?",
    a: "드라마·영상 YouTube 링크를 넣으면 AI가 영상을 4~8개 장면으로 나누고, 장면마다 어휘·문화팁·퀴즈를 만들어줘요. 타임라인의 칩을 누르면 해당 장면으로 이동해요.",
  },
  {
    id: "f5",
    category: "feature",
    q: "중국어 발음(TTS)은 어디서 들을 수 있나요?",
    a: "강의 본문·실전대화·핵심표현·단어장 어디서든 🔊 아이콘을 누르면 중국어 발음을 들려줘요. 한국어는 읽지 않고 중국어만 재생됩니다.",
  },

  // DingDong bot
  {
    id: "d1",
    category: "dingdong",
    q: "叮叮(딩딩)은 누구예요?",
    a: "안녕! 내가 바로 叮叮이야 🐼 DingDong의 판다 도우미예요. 중국어 공부하다가 막히면 언제든 우측 하단 판다를 눌러서 물어봐 주세요!",
  },
  {
    id: "d2",
    category: "dingdong",
    q: "음성으로 대화할 수 있나요?",
    a: "네! 입력창 옆 🎙 버튼을 누르면 한국어 또는 중국어로 말할 수 있어요. 언어 토글로 STT 언어를 바꿀 수 있고, 제 답변은 자동으로 읽어드려요.",
  },
  {
    id: "d3",
    category: "dingdong",
    q: "답변을 다시 듣고 싶어요.",
    a: "말풍선 아래 🔊 「다시 듣기」 버튼을 누르면 한국어 → 중국어 순서로 다시 읽어드려요. 멈추고 싶으면 같은 버튼을 한 번 더 눌러주세요.",
  },
  {
    id: "d4",
    category: "dingdong",
    q: "FAQ와 AI 채팅 차이는?",
    a: "FAQ는 자주 묻는 질문을 즉시 답해드려요(인터넷 없이도 OK). AI 채팅은 제가 직접 생각해서 답하는 자유 대화예요. 탭으로 전환할 수 있어요.",
  },
];

export function findFaq(id: string): FaqItem | undefined {
  return FAQ_ITEMS.find((f) => f.id === id);
}
