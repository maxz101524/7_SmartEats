import axios, { type AxiosRequestConfig } from "axios";
import { API_BASE } from "../../config";
import type {
  AiChatRequest,
  AiChatResponse,
  ConvoDetail,
  ConvoSummary,
} from "./types";

function authHeaders(): Record<string, string> | undefined {
  const token = localStorage.getItem("authToken");
  return token ? { Authorization: `Token ${token}` } : undefined;
}

export async function listConversations(): Promise<ConvoSummary[]> {
  const headers = authHeaders();
  if (!headers) return [];
  const { data } = await axios.get<ConvoSummary[]>(`${API_BASE}/conversations/`, { headers });
  return data;
}

export async function getConversation(id: number): Promise<ConvoDetail> {
  const { data } = await axios.get<ConvoDetail>(`${API_BASE}/conversations/${id}/`, {
    headers: authHeaders(),
  });
  return data;
}

export async function renameConversation(id: number, title: string): Promise<ConvoSummary> {
  const { data } = await axios.patch<ConvoSummary>(
    `${API_BASE}/conversations/${id}/`,
    { title },
    { headers: authHeaders() },
  );
  return data;
}

export async function deleteConversation(id: number): Promise<void> {
  await axios.delete(`${API_BASE}/conversations/${id}/`, { headers: authHeaders() });
}

export async function sendChatMessage(
  body: AiChatRequest,
  signal?: AbortSignal,
): Promise<AiChatResponse> {
  const config: AxiosRequestConfig = { signal };
  const headers = authHeaders();
  if (headers) config.headers = headers;
  const { data } = await axios.post<AiChatResponse>(`${API_BASE}/ai-chat/`, body, config);
  return data;
}
