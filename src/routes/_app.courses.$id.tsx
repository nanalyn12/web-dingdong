import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/courses/$id")({
  head: () => ({
    meta: [{ title: "코스 상세 — DingDong" }],
  }),
  component: CourseDetail,
});

function CourseDetail() {
  const { id } = Route.useParams();
  return (
    <section className="glass rounded-3xl p-8">
      <h1 className="text-3xl font-bold">코스 #{id}</h1>
      <p className="mt-2 text-muted-foreground">
        곧 여기에 코스 상세와 레슨 목록이 표시됩니다.
      </p>
    </section>
  );
}
