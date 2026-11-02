"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, request, ApiError } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { Team, User, Product } from "@/lib/types";
export type RecordData = Record<string, any>;
export type Snapshot = {
  user: User;
  teams: Team[];
  products: Product[];
  admin: null | { role: string; permissions: string[] };
  payments: RecordData[];
  deviceRequests: RecordData[];
  devices: RecordData[];
  support: RecordData[];
  carts: RecordData[];
  streamVerifications: RecordData[];
  renewals: RecordData[];
  yandex360: RecordData | null;
  tutorials: { topics: RecordData[]; lessons: RecordData[] };
};
type Session = {
  user?: User;
  state?: Snapshot;
  team?: Team;
  teams: Team[];
  teamId: string;
  selectTeam: (id: string) => void;
  permissions: string[];
  isAdmin: boolean;
  loading: boolean;
  error: Error | null;
  connectionError: Error | null;
  retry: () => void;
  switchDemo: (id: string) => void;
};
const Context = createContext<Session>(null!);
export function HubData({ children }: { children: React.ReactNode }) {
  const client = useQueryClient();
  const [teamId, setTeamId] = useState("");
  const profile = useQuery({
    queryKey: ["registration"],
    queryFn: () => api<User>("/api/registration"),
  });
  const state = useQuery({
    queryKey: ["sync"],
    queryFn: () => api<{ snapshot: Snapshot }>("/api/sync"),
    enabled: profile.data?.registrationStatus === "done",
  });
  const snapshot = state.data?.snapshot;
  const teams = snapshot?.teams || [];
  const selected = teams.find((t) => t.id === teamId) || teams[0];
  useEffect(() => {
    setTeamId(localStorage.getItem("hub-team") || "");
  }, []);
  const selectTeam = (id: string) => {
    setTeamId(id);
    localStorage.setItem("hub-team", id);
  };
  const switchDemo = (id: string) => {
    sessionStorage.setItem("hub-demo-user", id);
    localStorage.removeItem("hub-team");
    client.clear();
    window.location.assign("/");
  };
  const value: Session = {
    user: profile.data,
    state: snapshot,
    team: selected,
    teams,
    teamId: selected?.id || "",
    selectTeam,
    permissions: snapshot?.admin?.permissions || [],
    isAdmin: Boolean(snapshot?.admin),
    loading:
      profile.isLoading ||
      (profile.data?.registrationStatus === "done" && state.isLoading),
    error: (profile.error &&
    (!profile.data ||
      (profile.error instanceof ApiError &&
        [401, 403].includes(profile.error.status)))
      ? profile.error
      : state.error &&
          (!snapshot ||
            (state.error instanceof ApiError &&
              [401, 403].includes(state.error.status)))
        ? state.error
        : null) as Error | null,
    connectionError: (profile.error || state.error) as Error | null,
    retry: () => {
      void profile.refetch();
      void state.refetch();
    },
    switchDemo,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useHub = () => useContext(Context);
export function useData<T = RecordData>(path: string | undefined) {
  return useQuery({
    queryKey: ["api", path],
    queryFn: () => api<T>(path!),
    enabled: Boolean(path),
  });
}
export function useList<T = RecordData>(path: string | undefined, page = 0) {
  return useQuery({
    queryKey: ["list", path, page],
    queryFn: () =>
      request<T[]>(
        `${path}${path?.includes("?") ? "&" : "?"}page=${page}&limit=25`,
      ),
    enabled: Boolean(path),
  });
}
export function useAction() {
  const client = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({
      path,
      method = "POST",
      body,
    }: {
      path: string;
      method?: string;
      body?: unknown;
    }) =>
      request<any>(path, {
        method,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    onSuccess: (result) => {
      toast(
        result.delivery?.status === "queued"
          ? "Изменения сохранены. Уведомление ожидает доставки"
          : result.applied === false
            ? "Уже обработано"
            : "Готово",
      );
      void client.invalidateQueries();
    },
    onError: (error) =>
      toast(
        error instanceof ApiError && [401, 403].includes(error.status)
          ? "Сессия или права изменились. Откройте приложение заново."
          : error.message,
      ),
  });
}
export const money = (value: number | null | undefined, currency = "rub") =>
  value == null
    ? "По запросу"
    : new Intl.NumberFormat("ru-RU", {
        style: "currency",
        currency: currency === "usd" ? "USD" : "RUB",
        maximumFractionDigits: 0,
      }).format(value);
export const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date(value))
    : "Без срока";
export const nameOf = (record: RecordData) =>
  record.fio ||
  record.name ||
  record.title ||
  record.productName ||
  record.deviceName ||
  (record.flowNumber
    ? `Поток ${record.flowNumber}`
    : record.email ||
      record.proposedEmail ||
      (record.telegramId && `Пользователь ${record.telegramId}`) ||
      "Запись");
