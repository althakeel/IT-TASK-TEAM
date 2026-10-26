export type Role = "owner" | "admin" | "member";
export type MembershipStatus = "pending" | "active";
export type AttachmentType = "image" | "video";

export type User = {
  id: string;
  email: string;
  name: string;
  photo: string;
  isAdmin: boolean;
};

export type Membership = {
  id: string;
  workspaceId: string;
  userId: string | null;
  email: string;
  name: string;
  photo: string;
  role: Role;
  status: MembershipStatus;
  inviteToken: string | null;
};

export type BoardSummary = {
  id: string;
  workspaceId: string;
  title: string;
  background: string;
  backgroundImage: string;
  description: string;
  closed: boolean;
  createdAt: string;
};

export type KpiStatus = "onTime" | "late" | "overdue" | "open";

export type MemberKpiTask = {
  id: string;
  title: string;
  boardId: string;
  boardTitle: string;
  listTitle: string;
  dueDate: string | null;
  status: KpiStatus;
};

export type MemberKpis = {
  userId: string;
  name: string;
  email: string;
  photo: string;
  tasks: number;
  onTime: number;
  late: number;
  overdue: number;
  open: number;
  items: MemberKpiTask[];
};

export type KpiReport = {
  members: MemberKpis[];
  workspaces: { id: string; name: string }[];
};

export type TrashKind = "workspace" | "board" | "list" | "card";

export type TrashItem = {
  id: string;
  kind: TrashKind;
  title: string;
  detail: string;
  deletedAt: string;
  daysLeft: number;
};

export type MentionedTask = {
  id: string;
  title: string;
  boardId: string;
  boardTitle: string;
  listTitle: string;
  dueDate: string | null;
  updatedAt: string;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  boardId: string | null;
  cardId: string | null;
  read: boolean;
  createdAt: string;
};

export type WorkspaceSummary = {
  id: string;
  name: string;
  role: Role;
  memberCount: number;
  boards: BoardSummary[];
};

export type Label = {
  id: string;
  name: string;
  color: string;
};

export type ChecklistItem = {
  id: string;
  text: string;
  done: boolean;
};

export type Attachment = {
  id: string;
  name: string;
  url: string;
  fileId: string;
  type: AttachmentType;
  thumbnailUrl: string;
};

export type Card = {
  id: string;
  listId: string;
  boardId: string;
  title: string;
  description: string;
  position: number;
  dueDate: string | null;
  labels: Label[];
  assigneeIds: string[];
  checklist: ChecklistItem[];
  attachments: Attachment[];
  createdBy: string;
  createdAt: string;
};

export type List = {
  id: string;
  boardId: string;
  title: string;
  position: number;
  cards: Card[];
};

export type Comment = {
  id: string;
  cardId: string;
  boardId: string;
  authorId: string;
  authorName: string;
  authorPhoto: string;
  text: string;
  channel: "comment" | "chat";
  imageUrl: string;
  imageName: string;
  createdAt: string;
};

export type BoardDetail = {
  board: BoardSummary;
  lists: List[];
  members: Membership[];
  role: Role;
};

export type WorkspaceDetail = {
  id: string;
  name: string;
  role: Role;
  members: Membership[];
  boards: BoardSummary[];
};

export type InvitePreview = {
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: Role;
  status: MembershipStatus;
};

export type SessionResponse = {
  user: User;
  accepted: { workspaceId: string; workspaceName: string }[];
};

export type HealthResponse = {
  ok: boolean;
  mongo: boolean;
  firebase: boolean;
  imagekit: boolean;
  resend: boolean;
};

export type ImageKitAuth = {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
};

export const BOARD_BACKGROUNDS = [
  { id: "ocean", name: "Ocean", color: "#0079bf" },
  { id: "leaf", name: "Leaf", color: "#519839" },
  { id: "sunset", name: "Sunset", color: "#d29034" },
  { id: "berry", name: "Berry", color: "#89609e" },
  { id: "rose", name: "Rose", color: "#cd5a91" },
  { id: "slate", name: "Slate", color: "#4d6b82" },
  { id: "sky", name: "Sky", color: "#00aecc" },
  { id: "night", name: "Night", color: "#344563" },
] as const;

export const BOARD_GRADIENTS = [
  { id: "dusk", name: "Dusk", value: "linear-gradient(160deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
  { id: "aurora", name: "Aurora", value: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)" },
  { id: "ember", name: "Ember", value: "linear-gradient(135deg, #cb2d3e 0%, #ef473a 100%)" },
  { id: "violet", name: "Violet", value: "linear-gradient(135deg, #4776e6 0%, #8e54e9 100%)" },
  { id: "sand", name: "Sand", value: "linear-gradient(160deg, #c79081 0%, #dfa579 100%)" },
  { id: "forest", name: "Forest", value: "linear-gradient(160deg, #134e4a 0%, #1f7a4d 55%, #86c98a 100%)" },
] as const;

export const LABEL_PRESETS = [
  { name: "Green", color: "#61bd4f" },
  { name: "Yellow", color: "#f2d600" },
  { name: "Orange", color: "#ff9f1a" },
  { name: "Red", color: "#eb5a46" },
  { name: "Purple", color: "#c377e0" },
  { name: "Blue", color: "#0079bf" },
  { name: "Sky", color: "#00c2e0" },
  { name: "Lime", color: "#51e898" },
  { name: "Pink", color: "#ff78cb" },
  { name: "Black", color: "#344563" },
] as const;

export type BoardEventMap = {
  "list:created": { clientMutationId?: string; list: List };
  "list:updated": { clientMutationId?: string; list: Omit<List, "cards"> };
  "list:moved": { clientMutationId?: string; list: Omit<List, "cards"> };
  "list:deleted": { clientMutationId?: string; listId: string };
  "lists:reordered": { lists: { id: string; position: number }[] };
  "card:created": { clientMutationId?: string; card: Card };
  "card:updated": { clientMutationId?: string; card: Card };
  "card:moved": { clientMutationId?: string; card: Card };
  "card:deleted": { clientMutationId?: string; cardId: string; listId: string };
  "cards:reordered": { cards: { id: string; listId: string; position: number }[] };
  "comment:created": { clientMutationId?: string; comment: Comment };
  "comment:deleted": { clientMutationId?: string; commentId: string; cardId: string };
  "board:updated": { board: BoardSummary };
};

export type BoardEventName = keyof BoardEventMap;

export type LiveEvent = {
  [K in BoardEventName]: { type: K } & BoardEventMap[K];
}[BoardEventName];

export const BOARD_EVENTS = [
  "list:created",
  "list:updated",
  "list:moved",
  "list:deleted",
  "lists:reordered",
  "card:created",
  "card:updated",
  "card:moved",
  "card:deleted",
  "cards:reordered",
  "comment:created",
  "comment:deleted",
  "board:updated",
] as const satisfies readonly BoardEventName[];
