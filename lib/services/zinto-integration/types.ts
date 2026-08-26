/**
 * Types mirroring openapi/openapi.yaml (Zinto Integration API, contract
 * version 0.1.0). Hand-transcribed from the schemas — keep in sync manually
 * until we wire up a codegen step; do not infer fields from the CRM's web UI.
 */

export interface PageMeta {
  request_id: string;
  next_cursor: string | null;
  has_more: boolean;
}

export interface PageResponse<T> {
  data: T[];
  meta: PageMeta;
}

export interface RequestMeta {
  request_id: string;
}

export interface IdentityResponse {
  data: {
    api_key: { id: string; name: string };
    company: { id: string; name: string };
    scopes: string[];
  };
  meta: RequestMeta;
}

export interface Channel {
  id: string;
  type: string;
  name: string;
  status: string;
  capabilities: string[];
}

export interface Flow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "inactive" | "archived";
  nodes: unknown[];
  edges: unknown[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface FlowSession {
  id: string;
  session_id: string;
  flow_id: string;
  conversation_id: string;
  contact_id: string;
  status: string;
  current_node_id: string | null;
  trigger_node_id: string;
  execution_path: unknown[];
  session_data: Record<string, unknown>;
  started_at: string;
  last_activity_at: string;
  completed_at: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowExecution {
  id: string;
  execution_id: string;
  flow_id: string;
  conversation_id: string;
  contact_id: string;
  status: string;
  trigger_node_id: string;
  current_node_id: string | null;
  execution_path: unknown[];
  started_at: string;
  completed_at: string | null;
  last_activity_at: string;
  total_duration_ms: number | null;
  completion_rate: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface FlowTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  business_type: string;
  nodes: unknown[];
  edges: unknown[];
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactFields {
  name?: string;
  email?: string | null;
  phone?: string | null;
  avatar_url?: string | null;
  company?: string | null;
  tags?: string[];
  source?: string | null;
  notes?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface ContactCreate extends ContactFields {
  name: string;
}

export type ContactUpdate = ContactFields;

export interface Contact extends ContactFields {
  id: string;
  name: string;
  tags: string[];
  custom_fields: Record<string, unknown>;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Pipeline {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  is_template: boolean;
  template_category: string | null;
  order_num: number;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  color: string;
  order_num: number;
  created_at: string;
  updated_at: string;
}

export interface Deal {
  id: string;
  pipeline_id: string;
  contact_id: string;
  title: string;
  stage_key: string;
  stage_id: string | null;
  stage_name: string | null;
  value: number | null;
  priority: string | null;
  status: string | null;
  due_date: string | null;
  assigned_to_user_id: string | null;
  description: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DealCreate {
  contact_id: string;
  pipeline_id: string;
  stage_id: string;
  title: string;
  value?: number | null;
  priority?: string | null;
  status?: string | null;
  due_date?: string | null;
  assigned_to_user_id?: string | null;
  description?: string | null;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
}

export type DealUpdate = Partial<Omit<DealCreate, "contact_id" | "pipeline_id" | "stage_id">> & {
  stage_id?: string;
};

export interface DealMove {
  pipeline_id: string;
  stage_id: string;
}

export interface Task {
  id: string;
  contact_id: string;
  title: string;
  description: string | null;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  /** Free text in the schema — not a validated user reference. */
  assigned_to: string | null;
  category: string | null;
  tags: string[];
  background_color: string | null;
  created_by_user_id: string | null;
  updated_by_user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskCreate {
  contact_id: string;
  title: string;
  description?: string | null;
  priority?: string;
  status?: string;
  due_date?: string | null;
  assigned_to?: string | null;
  category?: string | null;
  tags?: string[];
  background_color?: string | null;
}

export type TaskUpdate = Partial<Omit<TaskCreate, "contact_id">> & { completed_at?: string | null };

export interface Note {
  id: string;
  contact_id: string;
  created_by_id: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface NoteInput {
  content: string;
}

export interface Conversation {
  id: string;
  contact_id: string | null;
  channel_id: string;
  channel_type: string;
  status: string;
  assigned_to_user_id: string | null;
  last_message_at: string | null;
  unread_count: number;
  bot_disabled: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ConversationCreate {
  contact_id: string;
  channel_id: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  external_id: string | null;
  direction: "incoming" | "outgoing";
  type: string;
  content: string;
  status: string;
  sender_id: string | null;
  sender_type: string | null;
  from_bot: boolean;
  media_url: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
}

export interface TextMessageInput {
  channel_id: string;
  to: string;
  message: string;
}

export interface MediaMessageInput {
  channel_id: string;
  to: string;
  media_type: "image" | "video" | "audio" | "document";
  media_url: string;
  caption?: string;
  filename?: string;
}

export interface TemplateMessageInput {
  channel_id: string;
  to: string;
  template_name: string;
  template_language?: string;
  components?: unknown[];
}

export interface InteractiveMessageInput {
  channel_id: string;
  to: string;
  interactive_type: "button" | "list";
  body: string;
  header?: string;
  footer?: string;
  action: Record<string, unknown>;
}

export interface MessageDelivery {
  id: string;
  external_id: string | null;
  status: string;
  timestamp: string;
  channel_type: string;
  conversation_id: string;
}

export const WEBHOOK_EVENT_TYPES = [
  "contact.created",
  "contact.updated",
  "contact.deleted",
  "conversation.created",
  "conversation.updated",
  "message.created",
  "message.status.updated",
  "note.created",
  "note.updated",
  "note.deleted",
  "tag.attached",
  "tag.detached",
  "deal.created",
  "deal.updated",
  "deal.stage.changed",
  "deal.deleted",
  "task.created",
  "task.updated",
  "task.completed",
  "task.deleted",
  "channel.connection.updated",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookCreate {
  url: string;
  event_types: WebhookEventType[];
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  event_types: WebhookEventType[];
  active: boolean;
  created_at: string;
}

/** Only returned once, at creation time — never persisted in plaintext logs. */
export interface WebhookCreateResponse {
  data: WebhookEndpoint & { secret: string };
  meta: RequestMeta;
}

export interface WebhookEvent<T = unknown> {
  id: string;
  type: WebhookEventType;
  schema_version: 1;
  occurred_at: string;
  data: T;
}

export const ZINTO_SCOPES = [
  "channels:read",
  "contacts:read",
  "contacts:write",
  "conversations:read",
  "conversations:write",
  "messages:read",
  "messages:send",
  "notes:read",
  "notes:write",
  "tags:write",
  "pipelines:read",
  "pipelines:write",
  "deals:read",
  "deals:write",
  "tasks:read",
  "tasks:write",
  "webhooks:manage",
  "flows:read",
  "erp:read",
  "inventory:read",
  "*",
] as const;

export type ZintoScope = (typeof ZINTO_SCOPES)[number];

/** Scopes SmartBC requests for the bcousinoprop pilot key (never `*`). */
export const SMARTBC_PILOT_SCOPES: ZintoScope[] = [
  "contacts:read",
  "contacts:write",
  "conversations:read",
  "conversations:write",
  "messages:read",
  "messages:send",
  "channels:read",
  "notes:read",
  "notes:write",
  "tags:write",
  "pipelines:read",
  "deals:read",
  "tasks:read",
  "webhooks:manage",
];

// ---- ERP (read-only) ----
export interface ErpProduct {
  id: string;
  [key: string]: unknown;
}
export interface ErpWarehouse {
  id: string;
  [key: string]: unknown;
}
export interface ErpStockLevel {
  id: string;
  [key: string]: unknown;
}
export interface ErpSupplier {
  id: string;
  [key: string]: unknown;
}
export interface ErpSalesOrder {
  id: string;
  [key: string]: unknown;
}
export interface ErpPurchaseOrder {
  id: string;
  [key: string]: unknown;
}
export interface ErpInvoice {
  id: string;
  [key: string]: unknown;
}

/** Entities SmartBC maps to a local `zinto_id` — drives the id-mapping table. */
export type ZintoMappedEntity =
  | "contact"
  | "conversation"
  | "deal"
  | "task"
  | "pipeline";
