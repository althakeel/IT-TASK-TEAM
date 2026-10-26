import type {
  AppNotification,
  BoardDetail,
  BoardSummary,
  Card,
  Comment,
  HealthResponse,
  ImageKitAuth,
  KpiReport,
  InvitePreview,
  List,
  MentionedTask,
  TrashItem,
  TrashKind,
  Membership,
  SessionResponse,
  User,
  WorkspaceDetail,
  WorkspaceSummary,
} from "@shared/types";
import { apiUrl } from "@/lib/config";
import { getFirebaseAuth } from "@/lib/firebase";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const current = getFirebaseAuth()?.currentUser;
  if (!current) throw new ApiError(401, "Sign in required.");
  const token = await current.getIdToken();
  let response: Response;
  try {
    response = await fetch(`${apiUrl()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the API. Start it with npm run dev.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) throw new ApiError(response.status, data.error || "Request failed.");
  return data as T;
}

export async function fetchHealth(): Promise<HealthResponse | null> {
  try {
    const response = await fetch(`${apiUrl()}/api/health`);
    if (!response.ok) return null;
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

export const api = {
  session: (body: { name?: string | null; photo?: string | null }) =>
    request<SessionResponse>("/api/auth/session", "POST", body),
  updatePhoto: (photo: string) => request<User>("/api/me/photo", "POST", { photo }),
  updateProfile: (name: string) => request<User>("/api/me", "PATCH", { name }),
  workspaces: () => request<WorkspaceSummary[]>("/api/workspaces"),
  kpis: () => request<KpiReport>("/api/kpis"),
  workspace: (id: string) => request<WorkspaceDetail>(`/api/workspaces/${id}`),
  createWorkspace: (name: string) => request<WorkspaceSummary>("/api/workspaces", "POST", { name }),
  renameWorkspace: (id: string, name: string) =>
    request<{ id: string; name: string }>(`/api/workspaces/${id}`, "PATCH", { name }),
  deleteWorkspace: (id: string) => request<{ ok: true }>(`/api/workspaces/${id}`, "DELETE"),
  trash: () => request<TrashItem[]>("/api/trash"),
  restoreTrash: (kind: TrashKind, id: string) => request<{ ok: true }>(`/api/trash/${kind}/${id}/restore`, "POST", {}),
  invite: (workspaceId: string, email: string, role: "admin" | "member") =>
    request<Membership & { emailSent?: boolean }>(`/api/workspaces/${workspaceId}/invites`, "POST", { email, role }),
  setRole: (workspaceId: string, membershipId: string, role: "admin" | "member") =>
    request<Membership>(`/api/workspaces/${workspaceId}/members/${membershipId}`, "PATCH", { role }),
  removeMember: (workspaceId: string, membershipId: string) =>
    request<{ ok: true }>(`/api/workspaces/${workspaceId}/members/${membershipId}`, "DELETE"),
  invitePreview: (token: string) => request<InvitePreview & { matchesAccount: boolean }>(`/api/invites/${token}`),
  acceptInvite: (token: string) =>
    request<{ workspaceId: string; workspaceName: string }>(`/api/invites/${token}/accept`, "POST", {}),
  createBoard: (workspaceId: string, title: string, background: string, backgroundImage = "") =>
    request<BoardSummary>(`/api/workspaces/${workspaceId}/boards`, "POST", { title, background, backgroundImage }),
  board: (id: string) => request<BoardDetail>(`/api/boards/${id}`),
  updateBoard: (id: string, patch: { title?: string; background?: string; backgroundImage?: string; description?: string; closed?: boolean }) =>
    request<BoardSummary>(`/api/boards/${id}`, "PATCH", patch),
  myTasks: () => request<MentionedTask[]>("/api/me/tasks"),
  notifications: () => request<AppNotification[]>("/api/notifications"),
  readNotification: (id: string) => request<AppNotification>(`/api/notifications/${id}/read`, "POST", {}),
  readAllNotifications: () => request<{ ok: true }>("/api/notifications/read-all", "POST", {}),
  deleteBoard: (id: string) => request<{ ok: true }>(`/api/boards/${id}`, "DELETE"),
  createList: (boardId: string, title: string, clientMutationId: string) =>
    request<List>(`/api/boards/${boardId}/lists`, "POST", { title, clientMutationId }),
  updateList: (listId: string, patch: { title?: string; position?: number; clientMutationId?: string }) =>
    request<Omit<List, "cards">>(`/api/lists/${listId}`, "PATCH", patch),
  deleteList: (listId: string, clientMutationId: string) =>
    request<{ ok: true }>(`/api/lists/${listId}`, "DELETE", { clientMutationId }),
  createCard: (listId: string, title: string, clientMutationId: string) =>
    request<Card>(`/api/lists/${listId}/cards`, "POST", { title, clientMutationId }),
  updateCard: (cardId: string, patch: Record<string, unknown>) => request<Card>(`/api/cards/${cardId}`, "PATCH", patch),
  deleteCard: (cardId: string, clientMutationId: string) =>
    request<{ ok: true }>(`/api/cards/${cardId}`, "DELETE", { clientMutationId }),
  addAttachment: (cardId: string, body: Record<string, unknown>) =>
    request<Card>(`/api/cards/${cardId}/attachments`, "POST", body),
  deleteAttachment: (cardId: string, attachmentId: string, clientMutationId: string) =>
    request<Card>(`/api/cards/${cardId}/attachments/${attachmentId}`, "DELETE", { clientMutationId }),
  comments: (cardId: string) => request<Comment[]>(`/api/cards/${cardId}/comments`),
  addComment: (
    cardId: string,
    body: {
      text: string;
      clientMutationId: string;
      channel?: "comment" | "chat";
      imageUrl?: string;
      imageFileId?: string;
      imageName?: string;
      mentionIds?: string[];
    },
  ) => request<Comment>(`/api/cards/${cardId}/comments`, "POST", body),
  deleteComment: (commentId: string, clientMutationId: string) =>
    request<{ ok: true }>(`/api/comments/${commentId}`, "DELETE", { clientMutationId }),
  imageKitAuth: () => request<ImageKitAuth>("/api/imagekit/auth"),
};
