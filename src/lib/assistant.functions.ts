import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";

import { createTextProvider } from "./ai-gateway.server";

const MessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});

const InputSchema = z.object({
  messages: z.array(MessageSchema).min(1).max(40),
});

// Allowed navigation targets. Keep in sync with app-sidebar.
const NAV_TARGETS: Record<string, string> = {
  "/": "홈",
  "/courses": "강의 목록",
  "/dramas": "영상 학습",
  "/songs": "학습송",
  "/vocabulary": "단어장",
  "/curriculum": "커리큘럼 생성기 (교수자 전용)",
  "/admin": "관리자 (관리자 전용)",
};

const SYSTEM_PROMPT = `너는 [DingDong 중국어 학습 플랫폼]의 판다 도우미 叮叮(딩딩)이야. 한국인 학습자를 친근하고 따뜻하게 도와줘.

[말투 규칙 — 음성으로 읽히니 매우 중요]
- 답변은 자연스러운 대화체로, 2~3문장. 필요하면 짧은 중국어 예문 1개.
- 절대 마크다운 문법을 쓰지 마: **, __, *, _, \`, #, >, -, 리스트, 표 금지.
- 절대 대괄호/괄호로 강조하지 마: [강의 목록], 【단어장】 같이 쓰지 말고 그냥 "강의 목록"이라고 말해.
- 이모지/이모티콘 사용 금지. (얼굴 표정, 손 모양, 사물 이모지 전부 금지)
- 중국어는 간체자만 사용.

[페이지 이동 기능]
사용자가 특정 페이지로 이동하고 싶다고 하면(예: "강의 목록 보여줘", "단어장으로 가", "드라마 페이지 열어줘"),
답변 맨 마지막 줄에 반드시 아래 형식으로 정확히 한 줄을 추가해:
<<NAV:/경로>>

사용 가능한 경로:
${Object.entries(NAV_TARGETS).map(([p, l]) => `- ${p} → ${l}`).join("\n")}

예시)
사용자: "학습송 페이지 열어줘"
답변: "좋아, 학습송 페이지로 이동할게. 노래로 즐겁게 배워보자!
<<NAV:/songs>>"

이동 요청이 아닐 때는 절대 <<NAV:...>>를 붙이지 마.`;

const NAV_RE = /<<NAV:(\/[a-zA-Z0-9/_-]*)>>/;

export const assistantChat = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const gateway = createTextProvider();
    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      system: SYSTEM_PROMPT,
      messages: data.messages,
    });

    const match = text.match(NAV_RE);
    let navigateTo: string | null = null;
    if (match && NAV_TARGETS[match[1]]) navigateTo = match[1];

    const reply = text.replace(NAV_RE, "").trim();
    return { reply, navigateTo };
  });
