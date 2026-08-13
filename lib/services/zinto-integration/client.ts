import { randomUUID } from "node:crypto";
import { getZintoIntegrationConfig, type ZintoIntegrationConfig } from "./config";
import { ZintoIntegrationApiError, isTransientError } from "./errors";
import type {
  Channel,
  Contact,
  ContactCreate,
  ContactUpdate,
  Conversation,
  ConversationCreate,
  Deal,
  DealCreate,
  DealMove,
  DealUpdate,
  ErpInvoice,
  ErpProduct,
  ErpPurchaseOrder,
  ErpSalesOrder,
  ErpStockLevel,
  ErpSupplier,
  ErpWarehouse,
  Flow,
  FlowExecution,
  FlowSession,
  FlowTemplate,
  IdentityResponse,
  InteractiveMessageInput,
  MediaMessageInput,
  Message,
  MessageDelivery,
  Note,
  NoteInput,
  PageResponse,
  Pipeline,
  PipelineStage,
  TemplateMessageInput,
  TextMessageInput,
  Task,
  TaskCreate,
  TaskUpdate,
  WebhookCreate,
  WebhookCreateResponse,
  WebhookEndpoint,
} from "./types";

export interface ListParams {
  cursor?: string;
  limit?: number;
  updated_since?: string;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined> | ListParams;
  body?: unknown;
  idempotencyKey?: string;
  /** Number of retry attempts for transient errors. Default 3. */
  maxRetries?: number;
}

export interface ZintoRequestLog {
  requestId?: string;
  method: string;
  path: string;
  status: number;
  zintoIds?: string[];
  at: string;
}

export type RequestLogger = (entry: ZintoRequestLog) => void | Promise<void>;

function buildQuery(query?: Record<string, string | number | undefined> | ListParams): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Client for the Zinto Integration API (contract:
 * docs/api/SMARTBC-INTEGRATION-GUIDE-2026-08-13.md, openapi/openapi.yaml).
 *
 * Deliberately NOT built on top of lib/services/zinto/client.ts (legacy
 * WhatsApp-send client hitting `/api/v1` without the `/_integration-api`
 * prefix, with its own reverse-engineered wire format). This is a fresh
 * layer against the documented contract; adapters live on top of it.
 */
export class ZintoIntegrationApiClient {
  private readonly config: ZintoIntegrationConfig;
  private readonly logger?: RequestLogger;

  constructor(config: ZintoIntegrationConfig, logger?: RequestLogger) {
    this.config = config;
    this.logger = logger;
  }

  static fromEnv(logger?: RequestLogger): ZintoIntegrationApiClient {
    const config = getZintoIntegrationConfig();
    if (!config) {
      throw new ZintoIntegrationApiError(500, "internal_error", "ZINTO_API_KEY is not configured");
    }
    return new ZintoIntegrationApiClient(config, logger);
  }

  /** Low-level request. Retries only genuinely transient failures (see isTransientError). */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { method = "GET", query, body, idempotencyKey, maxRetries = 3 } = options;
    const url = `${this.config.apiUrl}${path}${buildQuery(query)}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.config.apiKey}`,
      "Content-Type": "application/json",
    };
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

    let attempt = 0;
    let lastError: unknown;

    while (attempt <= maxRetries) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });

        const requestId = response.headers.get("x-request-id") || undefined;

        if (!response.ok) {
          let code = "internal_error";
          let message = `Zinto Integration API error (${response.status})`;
          let details: unknown[] | undefined;
          let parsedRequestId = requestId;
          try {
            const parsed = await response.json();
            if (parsed?.error) {
              code = parsed.error.code ?? code;
              message = parsed.error.message ?? message;
              details = parsed.error.details;
              parsedRequestId = parsed.error.request_id ?? parsedRequestId;
            }
          } catch {
            // non-JSON error body; keep generic message
          }

          const err = new ZintoIntegrationApiError(response.status, code, message, {
            requestId: parsedRequestId,
            details,
          });

          await this.log(method, path, response.status, parsedRequestId);

          if (isTransientError(err) && attempt < maxRetries) {
            attempt++;
            await sleep(backoffMs(attempt));
            lastError = err;
            continue;
          }
          throw err;
        }

        await this.log(method, path, response.status, requestId);

        if (response.status === 204) return undefined as T;
        return (await response.json()) as T;
      } catch (err) {
        if (err instanceof ZintoIntegrationApiError) throw err;
        // Network-level failure (fetch threw): treat as transient.
        const transportErr = new ZintoIntegrationApiError(
          0,
          "internal_error",
          err instanceof Error ? err.message : "Network error calling Zinto Integration API",
          { transportError: true }
        );
        if (attempt < maxRetries) {
          attempt++;
          lastError = transportErr;
          await sleep(backoffMs(attempt));
          continue;
        }
        throw transportErr;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Zinto Integration API request failed");
  }

  private async log(method: string, path: string, status: number, requestId?: string) {
    if (!this.logger) return;
    await this.logger({ method, path, status, requestId, at: new Date().toISOString() });
  }

  /** Yields pages until `has_more` is false. Caller decides checkpoint persistence. */
  async *paginate<T>(path: string, params: ListParams = {}): AsyncGenerator<PageResponse<T>> {
    let cursor = params.cursor;
    while (true) {
      const page = await this.request<PageResponse<T>>(path, {
        query: { cursor, limit: params.limit, updated_since: params.updated_since },
      });
      yield page;
      if (!page.meta.has_more || !page.meta.next_cursor) break;
      cursor = page.meta.next_cursor;
    }
  }

  /** Collects every page into one array. Only use for bounded resources (e.g. pipelines). */
  async paginateAll<T>(path: string, params: ListParams = {}): Promise<T[]> {
    const items: T[] = [];
    for await (const page of this.paginate<T>(path, params)) {
      items.push(...page.data);
    }
    return items;
  }

  newIdempotencyKey(prefix: string): string {
    return `smartbc-${prefix}-${randomUUID()}`;
  }

  // ---- Identity & channels ----
  getMe(): Promise<IdentityResponse> {
    return this.request("/api/v1/me");
  }

  listChannels(): Promise<{ data: Channel[]; meta: { request_id: string } }> {
    return this.request("/api/v1/channels");
  }

  // ---- Contacts, notes, tags ----
  listContacts(params?: ListParams): Promise<PageResponse<Contact>> {
    return this.request("/api/v1/contacts", { query: params });
  }

  getContact(id: string): Promise<{ data: Contact }> {
    return this.request(`/api/v1/contacts/${encodeURIComponent(id)}`);
  }

  createContact(body: ContactCreate, idempotencyKey: string): Promise<{ data: Contact }> {
    return this.request("/api/v1/contacts", { method: "POST", body, idempotencyKey });
  }

  updateContact(id: string, body: ContactUpdate): Promise<{ data: Contact }> {
    return this.request(`/api/v1/contacts/${encodeURIComponent(id)}`, { method: "PATCH", body });
  }

  deleteContact(id: string): Promise<void> {
    return this.request(`/api/v1/contacts/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  listContactNotes(contactId: string, params?: ListParams): Promise<PageResponse<Note>> {
    return this.request(`/api/v1/contacts/${encodeURIComponent(contactId)}/notes`, { query: params });
  }

  createNote(contactId: string, body: NoteInput, idempotencyKey: string): Promise<{ data: Note }> {
    return this.request(`/api/v1/contacts/${encodeURIComponent(contactId)}/notes`, {
      method: "POST",
      body,
      idempotencyKey,
    });
  }

  updateNote(id: string, body: NoteInput): Promise<{ data: Note }> {
    return this.request(`/api/v1/notes/${encodeURIComponent(id)}`, { method: "PATCH", body });
  }

  deleteNote(id: string): Promise<void> {
    return this.request(`/api/v1/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  tagContact(contactId: string, tag: string): Promise<void> {
    return this.request(
      `/api/v1/contacts/${encodeURIComponent(contactId)}/tags/${encodeURIComponent(tag)}`,
      { method: "PUT" }
    );
  }

  untagContact(contactId: string, tag: string): Promise<void> {
    return this.request(
      `/api/v1/contacts/${encodeURIComponent(contactId)}/tags/${encodeURIComponent(tag)}`,
      { method: "DELETE" }
    );
  }

  // ---- Conversations & messages ----
  listConversations(params?: ListParams): Promise<PageResponse<Conversation>> {
    return this.request("/api/v1/conversations", { query: params });
  }

  createConversation(
    body: ConversationCreate,
    idempotencyKey: string
  ): Promise<{ data: Conversation }> {
    return this.request("/api/v1/conversations", { method: "POST", body, idempotencyKey });
  }

  updateConversation(id: string, body: Partial<ConversationCreate>): Promise<{ data: Conversation }> {
    return this.request(`/api/v1/conversations/${encodeURIComponent(id)}`, { method: "PATCH", body });
  }

  /** Full history, not limited to today — paginate to the end. */
  listConversationMessages(
    conversationId: string,
    params?: ListParams
  ): Promise<PageResponse<Message>> {
    return this.request(`/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, {
      query: params,
    });
  }

  getMessage(id: string): Promise<{ data: Message }> {
    return this.request(`/api/v1/messages/${encodeURIComponent(id)}`);
  }

  sendMessage(
    body: TextMessageInput,
    idempotencyKey: string
  ): Promise<{ data: MessageDelivery }> {
    return this.request("/api/v1/messages/send", { method: "POST", body, idempotencyKey });
  }

  sendMediaMessage(
    body: MediaMessageInput,
    idempotencyKey: string
  ): Promise<{ data: MessageDelivery }> {
    return this.request("/api/v1/messages/send-media", { method: "POST", body, idempotencyKey });
  }

  sendTemplateMessage(
    body: TemplateMessageInput,
    idempotencyKey: string
  ): Promise<{ data: MessageDelivery }> {
    return this.request("/api/v1/messages/send-template", { method: "POST", body, idempotencyKey });
  }

  sendInteractiveMessage(
    body: InteractiveMessageInput,
    idempotencyKey: string
  ): Promise<{ data: MessageDelivery }> {
    return this.request("/api/v1/messages/send-interactive", {
      method: "POST",
      body,
      idempotencyKey,
    });
  }

  // ---- Pipelines, deals, tasks ----
  listPipelines(params?: ListParams): Promise<PageResponse<Pipeline>> {
    return this.request("/api/v1/pipelines", { query: params });
  }

  listPipelineStages(pipelineId: string, params?: ListParams): Promise<PageResponse<PipelineStage>> {
    return this.request(`/api/v1/pipelines/${encodeURIComponent(pipelineId)}/stages`, {
      query: params,
    });
  }

  listDeals(params?: ListParams): Promise<PageResponse<Deal>> {
    return this.request("/api/v1/deals", { query: params });
  }

  getDeal(id: string): Promise<{ data: Deal }> {
    return this.request(`/api/v1/deals/${encodeURIComponent(id)}`);
  }

  createDeal(body: DealCreate, idempotencyKey: string): Promise<{ data: Deal }> {
    return this.request("/api/v1/deals", { method: "POST", body, idempotencyKey });
  }

  updateDeal(id: string, body: DealUpdate): Promise<{ data: Deal }> {
    return this.request(`/api/v1/deals/${encodeURIComponent(id)}`, { method: "PATCH", body });
  }

  deleteDeal(id: string): Promise<void> {
    return this.request(`/api/v1/deals/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  /** Use `/move` with real pipeline_id + stage_id — never write `stage` directly. */
  moveDeal(id: string, body: DealMove): Promise<{ data: Deal }> {
    return this.request(`/api/v1/deals/${encodeURIComponent(id)}/move`, { method: "POST", body });
  }

  listTasks(params?: ListParams): Promise<PageResponse<Task>> {
    return this.request("/api/v1/tasks", { query: params });
  }

  createTask(body: TaskCreate, idempotencyKey: string): Promise<{ data: Task }> {
    return this.request("/api/v1/tasks", { method: "POST", body, idempotencyKey });
  }

  updateTask(id: string, body: TaskUpdate): Promise<{ data: Task }> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(id)}`, { method: "PATCH", body });
  }

  deleteTask(id: string): Promise<void> {
    return this.request(`/api/v1/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // ---- Webhooks ----
  listWebhooks(): Promise<PageResponse<WebhookEndpoint>> {
    return this.request("/api/v1/webhooks");
  }

  /** Secret is returned once, in the response — persist it immediately, never log it. */
  createWebhook(body: WebhookCreate): Promise<WebhookCreateResponse> {
    return this.request("/api/v1/webhooks", { method: "POST", body });
  }

  deleteWebhook(id: string): Promise<void> {
    return this.request(`/api/v1/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
  }

  // ---- Flows (read-only per contract) ----
  listFlows(params?: ListParams): Promise<PageResponse<Flow>> {
    return this.request("/api/v1/flows", { query: params });
  }

  getFlow(id: string): Promise<Flow> {
    return this.request(`/api/v1/flows/${encodeURIComponent(id)}`);
  }

  listFlowSessions(flowId: string, params?: ListParams): Promise<PageResponse<FlowSession>> {
    return this.request(`/api/v1/flows/${encodeURIComponent(flowId)}/sessions`, { query: params });
  }

  listFlowExecutions(flowId: string, params?: ListParams): Promise<PageResponse<FlowExecution>> {
    return this.request(`/api/v1/flows/${encodeURIComponent(flowId)}/executions`, { query: params });
  }

  listFlowTemplates(params?: ListParams): Promise<PageResponse<FlowTemplate>> {
    return this.request("/api/v1/flow-templates", { query: params });
  }

  // ---- ERP (read-only per contract) ----
  readonly erp = {
    listProducts: (params?: ListParams): Promise<PageResponse<ErpProduct>> =>
      this.request("/api/v1/erp/products", { query: params }),
    listWarehouses: (params?: ListParams): Promise<PageResponse<ErpWarehouse>> =>
      this.request("/api/v1/erp/inventory/warehouses", { query: params }),
    listStockLevels: (params?: ListParams): Promise<PageResponse<ErpStockLevel>> =>
      this.request("/api/v1/erp/inventory/stock-levels", { query: params }),
    listSuppliers: (params?: ListParams): Promise<PageResponse<ErpSupplier>> =>
      this.request("/api/v1/erp/suppliers", { query: params }),
    listSalesOrders: (params?: ListParams): Promise<PageResponse<ErpSalesOrder>> =>
      this.request("/api/v1/erp/sales-orders", { query: params }),
    listPurchaseOrders: (params?: ListParams): Promise<PageResponse<ErpPurchaseOrder>> =>
      this.request("/api/v1/erp/purchase-orders", { query: params }),
    listInvoices: (params?: ListParams): Promise<PageResponse<ErpInvoice>> =>
      this.request("/api/v1/erp/invoices", { query: params }),
  };
}

function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** (attempt - 1), 8000);
  const jitter = Math.random() * 250;
  return base + jitter;
}
