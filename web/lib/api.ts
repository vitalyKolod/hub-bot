import { authHeader } from "./telegram";
export type Envelope<T> = {
  data: T;
  meta?: { page: number; limit: number; total: number; totalPages: number };
  applied?: boolean;
  delivery?: { status: string };
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<Envelope<T>> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { "content-type": "application/json" } : {}),
      authorization: authHeader(),
      ...init?.headers,
    },
    cache: "no-store",
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new ApiError(
      response.status,
      result.error?.code || "HTTP_ERROR",
      result.error?.message || "Не удалось выполнить запрос",
      result.error?.requestId,
    );
  return result;
}
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request<T>(path, init)).data;
}
export async function mediaBlob(path: string, signal?: AbortSignal) {
  const response = await fetch(path, {
    headers: { authorization: authHeader() },
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    const e = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      e.error?.code || "FILE_ERROR",
      e.error?.message || "Файл недоступен",
    );
  }
  return response.blob();
}
export async function downloadFile(path: string, name = "hub-file") {
  const blob = await mediaBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function filePayload(file: File, maxMB = 10) {
  if (file.size > maxMB * 1024 * 1024)
    throw new Error(`Файл должен быть меньше ${maxMB} МБ`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let value = "";
  for (let i = 0; i < bytes.length; i += 8192)
    value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const ext =
    file.type === "application/pdf"
      ? "pdf"
      : file.type === "image/png"
        ? "png"
        : file.type === "video/mp4"
          ? "mp4"
          : "jpg";
  return {
    fileBase64: btoa(value),
    fileName: `upload-${Date.now()}.${ext}`,
    mimeType: file.type,
  };
}
