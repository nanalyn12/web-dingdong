import { useEffect, useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import {
  loadGuestVocab,
  removeGuestVocab,
  updateGuestVocabTags,
  gradeGuestVocab,
  listGuestVocabTags,
  type VocabItem,
} from "@/lib/vocab";
import {
  deleteVocabulary,
  gradeVocabulary,
  listVocabTags,
  listVocabulary,
  updateVocabularyTags,
} from "@/lib/vocab.functions";
import type { SrsGrade } from "@/lib/vocab-srs";

export function useAuthedFlag() {
  const { session, loading } = useSession();
  return loading ? null : !!session;
}

export function useVocabStore() {
  const authed = useAuthedFlag();
  const qc = useQueryClient();
  const [guestItems, setGuestItems] = useState<VocabItem[]>([]);
  const [guestReady, setGuestReady] = useState(false);
  const [guestTags, setGuestTags] = useState<string[]>([]);

  useEffect(() => {
    if (authed === false) {
      setGuestItems(loadGuestVocab());
      setGuestTags(listGuestVocabTags());
      setGuestReady(true);
    }
  }, [authed]);

  const authedQuery = useQuery({
    queryKey: ["vocabulary"],
    queryFn: () => listVocabulary(),
    enabled: authed === true,
  });
  const authedTags = useQuery({
    queryKey: ["vocabulary-tags"],
    queryFn: () => listVocabTags(),
    enabled: authed === true,
  });

  const del = useMutation({
    mutationFn: (zh: string) => deleteVocabulary({ data: { zh } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vocabulary"] });
      qc.invalidateQueries({ queryKey: ["vocabulary-tags"] });
    },
  });
  const grade = useMutation({
    mutationFn: ({ id, grade: g }: { id: string; grade: SrsGrade }) =>
      gradeVocabulary({ data: { id, grade: g } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vocabulary"] });
      // The home widgets read the same SRS rows. Without these, finishing a
      // review session leaves the widget panel showing the pre-session count
      // until its own staleTime lapses.
      qc.invalidateQueries({ queryKey: ["widget-stats"] });
      qc.invalidateQueries({ queryKey: ["widget-due-vocab"] });
    },
  });
  const setTags = useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) =>
      updateVocabularyTags({ data: { id, tags } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vocabulary"] });
      qc.invalidateQueries({ queryKey: ["vocabulary-tags"] });
    },
  });

  const loading = authed === null || (authed === true ? authedQuery.isLoading : !guestReady);
  const items: VocabItem[] = authed === true ? (authedQuery.data ?? []) : guestItems;
  const tags: string[] = authed === true ? (authedTags.data ?? []) : guestTags;

  const deleteByZh = useCallback(
    (zh: string) => {
      if (authed) {
        del.mutate(zh);
      } else {
        setGuestItems(removeGuestVocab(zh));
        setGuestTags(listGuestVocabTags());
      }
    },
    [authed, del],
  );

  const gradeById = useCallback(
    async (id: string, g: SrsGrade) => {
      if (authed) {
        await grade.mutateAsync({ id, grade: g });
      } else {
        setGuestItems(gradeGuestVocab(id, g));
      }
    },
    [authed, grade],
  );

  const setTagsById = useCallback(
    async (id: string, next: string[]) => {
      if (authed) {
        await setTags.mutateAsync({ id, tags: next });
      } else {
        setGuestItems(updateGuestVocabTags(id, next));
        setGuestTags(listGuestVocabTags());
      }
    },
    [authed, setTags],
  );

  return {
    authed,
    loading,
    items,
    tags,
    deleteByZh,
    gradeById,
    setTagsById,
    refresh: () => {
      if (authed) {
        qc.invalidateQueries({ queryKey: ["vocabulary"] });
      } else {
        setGuestItems(loadGuestVocab());
        setGuestTags(listGuestVocabTags());
      }
    },
  };
}
