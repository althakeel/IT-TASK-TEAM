"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { BOARD_EVENTS, type BoardDetail, type BoardSummary, type Comment, type List, type LiveEvent } from "@shared/types";
import { api } from "@/lib/api";
import { applyCommentEvent, applyListEvent } from "@/lib/board-state";
import { apiUrl } from "@/lib/config";
import { getFirebaseAuth } from "@/lib/firebase";

export function useLiveBoard(boardId: string, enabled: boolean, viewerId = "", viewerIsAdmin = false) {
  const [detail, setDetail] = useState<BoardDetail | null>(null);
  const [lists, setListsState] = useState<List[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [openCardId, setOpenCardIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [channelError, setChannelError] = useState<string | null>(null);
  const listsRef = useRef<List[]>([]);
  const openCardRef = useRef<string | null>(null);
  const ignoreRef = useRef(new Set<string>());
  const queueRef = useRef<LiveEvent[]>([]);
  const draggingRef = useRef(false);
  const loadedRef = useRef(false);
  const applyRef = useRef<(event: LiveEvent) => void>(() => undefined);
  const updateBoardRef = useRef<(board: BoardSummary) => void>(() => undefined);
  const viewerRef = useRef({ id: viewerId, admin: viewerIsAdmin });

  const setLists = useCallback((updater: List[] | ((current: List[]) => List[])) => {
    const next = typeof updater === "function" ? updater(listsRef.current) : updater;
    listsRef.current = next;
    setListsState(next);
  }, []);

  const apply = useCallback(
    (event: LiveEvent) => {
      if (event.type === "board:updated") return;
      const mutationId = "clientMutationId" in event ? event.clientMutationId : undefined;
      if (mutationId && ignoreRef.current.has(mutationId)) {
        ignoreRef.current.delete(mutationId);
        return;
      }
      const viewer = viewerRef.current;
      if (!viewer.admin && (event.type === "card:created" || event.type === "card:updated" || event.type === "card:moved")) {
        const visible =
          event.card.approval === "approved" ||
          event.card.createdBy === viewer.id ||
          (event.card.approval !== "pending" && event.card.approval !== "rejected" && event.card.assigneeIds.includes(viewer.id));
        if (!visible) {
          setLists((current) => current.map((list) => ({ ...list, cards: list.cards.filter((card) => card.id !== event.card.id) })));
          return;
        }
      }
      setLists((current) => applyListEvent(current, event));
      setComments((current) => applyCommentEvent(current, event, openCardRef.current));
    },
    [setLists],
  );

  useEffect(() => {
    applyRef.current = apply;
  }, [apply]);

  useEffect(() => {
    viewerRef.current = { id: viewerId, admin: viewerIsAdmin };
  }, [viewerId, viewerIsAdmin]);

  const requestKey = enabled ? boardId : "";
  const [activeKey, setActiveKey] = useState(requestKey);
  if (activeKey !== requestKey) {
    setActiveKey(requestKey);
    setLoading(true);
    setError(null);
    setDetail(null);
    setListsState([]);
  }

  const flush = useCallback(() => {
    const events = queueRef.current.splice(0);
    for (const event of events) applyRef.current(event);
  }, []);

  const setDragging = useCallback(
    (value: boolean) => {
      draggingRef.current = value;
      if (!value) flush();
    },
    [flush],
  );

  const trackMutation = useCallback(() => {
    const id = crypto.randomUUID();
    ignoreRef.current.add(id);
    return id;
  }, []);

  const forgetMutation = useCallback((id: string) => {
    ignoreRef.current.delete(id);
  }, []);

  const setOpenCardId = useCallback((id: string | null) => {
    openCardRef.current = id;
    setOpenCardIdState(id);
    setComments([]);
  }, []);

  const updateBoard = useCallback((board: BoardSummary) => {
    setDetail((current) => (current ? { ...current, board } : current));
  }, []);

  useEffect(() => {
    updateBoardRef.current = updateBoard;
  }, [updateBoard]);

  const getLists = useCallback(() => listsRef.current, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadedRef.current = false;
    queueRef.current = [];
    listsRef.current = [];
    api
      .board(boardId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setLists(data.lists);
        loadedRef.current = true;
        setLoading(false);
        flush();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load this board.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [boardId, enabled, flush, setLists]);

  useEffect(() => {
    if (!openCardId) return;
    let cancelled = false;
    api
      .comments(openCardId)
      .then((rows) => {
        if (cancelled) return;
        setComments((current) => {
          const merged = new Map(rows.map((comment) => [comment.id, comment]));
          for (const comment of current) {
            if (comment.cardId === openCardId && !merged.has(comment.id)) merged.set(comment.id, comment);
          }
          return [...merged.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        });
      })
      .catch(() => {
        if (!cancelled) setComments([]);
      });
    return () => {
      cancelled = true;
    };
  }, [openCardId]);

  useEffect(() => {
    if (!enabled) return;
    const auth = getFirebaseAuth();
    const current = auth?.currentUser;
    if (!current) return;
    let socket: Socket | null = null;
    let cancelled = false;

    current.getIdToken().then((token) => {
      if (cancelled) return;
      socket = io(apiUrl(), { auth: { token } });
      socket.on("connect", () => {
        socket?.emit("board:join", boardId, (joinError?: string) => {
          setConnected(!joinError);
          setChannelError(joinError || null);
          if (joinError || draggingRef.current) return;
          api
            .board(boardId)
            .then((data) => {
              if (cancelled) return;
              setDetail(data);
              setLists(data.lists);
              loadedRef.current = true;
            })
            .catch(() => undefined);
        });
      });
      socket.on("disconnect", () => setConnected(false));
      socket.on("connect_error", async () => {
        setConnected(false);
        const nextToken = await getFirebaseAuth()?.currentUser?.getIdToken(true);
        if (nextToken && socket) socket.auth = { token: nextToken };
      });
      for (const name of BOARD_EVENTS) {
        socket.on(name, (payload: Omit<LiveEvent, "type">) => {
          const event = { ...payload, type: name } as LiveEvent;
          if (event.type === "board:updated") {
            if (event.board.id === boardId) updateBoardRef.current(event.board);
            return;
          }
          if (!loadedRef.current || draggingRef.current) {
            queueRef.current.push(event);
            return;
          }
          applyRef.current(event);
        });
      }
    });

    return () => {
      cancelled = true;
      socket?.emit("board:leave", boardId);
      socket?.disconnect();
      setConnected(false);
    };
  }, [boardId, enabled]);

  return {
    detail,
    lists,
    comments,
    openCardId,
    setOpenCardId,
    loading,
    error,
    connected,
    channelError,
    setLists,
    getLists,
    setComments,
    updateBoard,
    trackMutation,
    forgetMutation,
    setDragging,
  };
}
