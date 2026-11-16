/** Framework-independent client. Supply a fresh authorization value for each request. */
export type Envelope<T> = { data: T; meta?: { page: number; limit: number; total: number }; applied?: boolean; delivery?: { status: string; code?: string } }
export type SyncState<T> = { revision: string; changed: boolean; pollAfterMs: number; snapshot: T | null }
export class HubApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string) { super(message) }
}
export class HubApiClient {
  constructor(private baseUrl: string, private authorization: () => string) {}
  async request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<Envelope<T>> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: options.method || 'GET', signal: options.signal,
      headers: { authorization: this.authorization(), ...(options.body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
    const envelope = await response.json() as any
    if (!response.ok) throw new HubApiError(response.status, envelope.error?.code || 'HTTP_ERROR', envelope.error?.message || 'Request failed', envelope.error?.requestId)
    return envelope
  }
  /** Returns a stop function; only one request runs at a time and 401/403 stops polling. */
  watchState<T>(admin: boolean, onChange: (snapshot: T) => void, onError: (error: unknown) => void) {
    let stopped = false; let revision = ''; let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const poll = async () => {
      let delay = 5000
      try {
        const { data } = await this.request<SyncState<T>>(`${admin ? '/api/admin/sync' : '/api/sync'}${revision ? `?since=${revision}` : ''}`, { signal: controller.signal })
        if (stopped) return
        revision = data.revision; delay = Math.max(5000, data.pollAfterMs)
        if (data.changed && data.snapshot) onChange(data.snapshot)
      } catch (error) {
        if (stopped) return
        onError(error); delay = 15000
        if (error instanceof HubApiError && [401, 403].includes(error.status)) stopped = true
      }
      if (!stopped) timer = setTimeout(poll, delay)
    }
    void poll()
    return () => { stopped = true; if (timer) clearTimeout(timer); controller.abort() }
  }
}
