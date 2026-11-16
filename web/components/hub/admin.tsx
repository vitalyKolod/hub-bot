"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ChevronRight, Plus, ShieldCheck } from "lucide-react";
import { api, request } from "@/lib/api";
import {
  adminResources,
  actionDescriptions,
  type AdminResource,
} from "@/lib/admin-ui";
import { actionNames, label, valueLabel } from "@/lib/ui-meta";
import {
  useHub,
  useData,
  useAction,
  date,
  money,
  nameOf,
  type RecordData,
} from "./data";
import {
  ActionDialog,
  Back,
  Badge,
  Download,
  Empty,
  Heading,
  InlineError,
  Loading,
  Media,
  Pager,
  type Action,
  type Field,
} from "./ui";
import { Messages } from "./messaging";
import { useToast } from "@/components/toast";
type Operation = {
  path: string;
  method: string;
  permission: string;
  fields: Record<string, Field>;
  required: string[];
};
export function operationTitle(operation: Operation, collection = false) {
  const last = operation.path.split("/").at(-1)!;
  if (operation.method === "GET" && last === "teams") return "Команды потока";
  if (operation.method === "GET" && last === "seats")
    return "Решения о продлении";
  if (operation.method === "DELETE") return "Удалить";
  if (operation.method === "PATCH") return "Редактировать";
  if (collection && operation.path.endsWith("}")) return "Открыть";
  return (
    actionNames[last] || (operation.method === "POST" ? "Создать" : "Открыть")
  );
}
function Detail({ record }: { record: RecordData }) {
  const hub = useHub();
  const summary = useData<{ snapshot: RecordData }>(
    hub.isAdmin ? "/api/admin/sync" : undefined,
  );
  const lookup = (key: string, value: any) => {
    const snapshot = summary.data?.snapshot;
    const records = (name: string) =>
      Array.isArray(snapshot?.[name])
        ? snapshot?.[name]
        : snapshot?.[name]?.data || [];
    if (key === "teamId")
      return (
        records("teams").find((r: RecordData) => r.id === value)?.name ||
        record.teamName ||
        "Команда HUB"
      );
    if (
      [
        "userId",
        "ownerId",
        "requestedBy",
        "adminId",
        "decidedBy",
        "actorTelegramId",
      ].includes(key)
    )
      return (
        records("users").find((r: RecordData) => r.telegramId === value)?.fio ||
        `Telegram ${value}`
      );
    if (key === "productId")
      return (
        hub.state?.products.find((p) => p.id === value)?.name ||
        valueLabel(value)
      );
    return valueLabel(value);
  };
  const ignored = [
    "id",
    "messages",
    "mediaUrl",
    "telegramPreviews",
    "members",
    "subscriptions",
    "permissions",
    "devices",
    "recipients",
    "sourceChatId",
    "sourceMessageIds",
    "telegramFileId",
    "password",
    "contextId",
    "apiNotification",
    "receipt",
    "avatarUrl",
    "telegramId",
  ];
  return (
    <dl className="kv">
      {Object.entries(record)
        .filter(
          ([key, value]) =>
            !ignored.includes(key) &&
            !(key === "productId" && record.productName) &&
            value != null &&
            typeof value !== "object",
        )
        .map(([key, value]) => (
          <div key={key}>
            <dt>{label(key)}</dt>
            <dd>
              {/At$|Through$|EndsAt$/.test(key) && typeof value === "string"
                ? date(value)
                : key === "amount"
                  ? money(value as number, record.currency)
                  : lookup(key, value)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function Admin({ parts }: { parts: string[] }) {
  const hub = useHub();
  const router = useRouter();
  const client = useQueryClient();
  const toast = useToast();
  const search = useSearchParams();
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [result, setResult] = useState<{ title: string; data: any } | null>(
    null,
  );
  const [mediaRecords, setMediaRecords] = useState<RecordData[]>([]);
  const [topicId, setTopicId] = useState(search.get("topic") || "");
  const schema = useQuery({
    queryKey: ["contract"],
    queryFn: () =>
      fetch("/api/openapi.json").then((r) => {
        if (!r.ok) throw Error("Не удалось загрузить формы");
        return r.json();
      }),
    staleTime: Infinity,
  });
  const summary = useData<{ snapshot: RecordData }>(
    hub.isAdmin ? "/api/admin/sync" : undefined,
  );
  const snapshot = summary.data?.snapshot;
  const resource = adminResources.find((r) => r.key === parts[0]);
  const id = parts[1];
  const topics = snapshot?.tutorials?.topics || [];
  useEffect(() => {
    try {
      setMediaRecords(
        JSON.parse(sessionStorage.getItem("hub-admin-media") || "[]"),
      );
    } catch {}
  }, []);
  useEffect(() => {
    if (!topicId && topics[0]) setTopicId(topics[0].id);
  }, [topicId, topics]);
  useEffect(() => {
    setPage(0);
    setFilter("");
    setStatus("");
    setResult(null);
  }, [parts[0]]);
  const allowed = (permission: string) =>
    permission === "admin"
      ? hub.isAdmin
      : permission === "superadmin"
        ? hub.state?.admin?.role === "superadmin"
        : hub.permissions.includes(permission);
  const operations: Operation[] = Object.entries(schema.data?.paths || {})
    .flatMap(([path, methods]) =>
      Object.entries(methods as RecordData).map(([method, op]) => ({
        path,
        method: method.toUpperCase(),
        permission: op["x-hub-permission"],
        fields:
          op.requestBody?.content?.["application/json"]?.schema?.properties ||
          {},
        required:
          op.requestBody?.content?.["application/json"]?.schema?.required || [],
      })),
    )
    .filter(
      (op) => op.path.startsWith("/api/admin/") && allowed(op.permission),
    );
  const collection = resource ? `/api/admin${resource.path}` : "";
  const listPath =
    resource?.key === "lessons"
      ? topicId
        ? `/api/admin/tutorials/topics/${topicId}/lessons`
        : ""
      : resource?.key === "media"
        ? ""
        : collection;
  const list = useQuery({
    queryKey: ["admin-list", listPath, page, filter, status],
    queryFn: async () => {
      const response = await request<RecordData[]>(
        `${listPath}?page=${page}&limit=25${filter ? `&q=${encodeURIComponent(filter)}` : ""}${status ? `&status=${encodeURIComponent(status)}` : ""}`,
      );
      if (resource?.key === "subscriptions")
        response.data = response.data.flatMap((team) =>
          team.subscriptions.map((sub: RecordData) => ({
            ...sub,
            teamId: team.teamId,
            teamName: team.teamName,
            productName:
              hub.state?.products.find((p) => p.id === sub.productId)?.name ||
              sub.productId,
          })),
        );
      return response;
    },
    enabled:
      Boolean(listPath) && Boolean(resource && allowed(resource.permission)),
  });
  const keyFor = (record: RecordData) =>
    String(
      resource?.key === "subscriptions"
        ? `${record.teamId}~${record.productId}`
        : resource?.param === "userId"
          ? record.telegramId
          : resource?.param === "flow"
            ? record.flowNumber
            : record.id,
    );
  const detailPath =
    resource && id
      ? resource.key === "subscriptions"
        ? `${collection}/${id.replace("~", "/")}`
        : `${collection}/${id}`
      : "";
  const hasDetail = operations.some(
    (op) =>
      (op.method === "GET" &&
        op.path === `${collection}/{${resource?.param}}`) ||
      (resource?.key === "subscriptions" &&
        op.path === `${collection}/{teamId}/{productId}`),
  );
  const detail = useData<RecordData>(id && hasDetail ? detailPath : undefined);
  const record =
    detail.data ||
    list.data?.data.find((r) => keyFor(r) === id) ||
    client.getQueryData<RecordData>(["admin-record", resource?.key, id]);
  const parameterOptions = (key: string): Field => {
    const get = (name: string) => {
      const data = snapshot?.[name];
      return Array.isArray(data) ? data : data?.data || [];
    };
    const list =
      key === "teamId"
        ? get("teams")
        : ["userId", "ownerId", "telegramId"].includes(key)
          ? get("users")
          : ["flow", "flowNumber", "toFlow"].includes(key)
            ? get("streams")
            : ["deviceId", "replacesDeviceId"].includes(key)
              ? get("devices")
              : key === "streamId"
                ? get("yandexStreams")
                : key === "productId"
                  ? hub.state?.products || []
                  : key === "uploadId" || key === "mediaId"
                    ? mediaRecords.filter((m) =>
                        key === "uploadId"
                          ? m.purpose === "tutorial"
                          : m.purpose === "broadcast",
                      )
                    : key === "emailId" || key === "oldEmailId"
                      ? record?.emails || []
                      : [];
    return {
      type: [
        "userId",
        "ownerId",
        "telegramId",
        "flow",
        "flowNumber",
        "toFlow",
      ].includes(key)
        ? "integer"
        : "string",
      options: list.map((r: RecordData) => ({
        value: String(
          ["userId", "ownerId", "telegramId"].includes(key)
            ? r.telegramId
            : ["flow", "flowNumber", "toFlow"].includes(key)
              ? r.flowNumber
              : r.id || r._id,
        ),
        label: r.address || nameOf(r),
      })),
    };
  };
  const bindings: RecordData = record
    ? {
        [resource!.param]:
          resource?.key === "subscriptions" ? record.teamId : keyFor(record),
        ...(resource?.key === "subscriptions"
          ? { teamId: record.teamId, productId: record.productId }
          : {}),
        ...(resource?.key === "teams" ? { teamId: record.id } : {}),
        ...(resource?.key === "streams" ? { flow: record.flowNumber } : {}),
      }
    : {};
  const belongs = (op: Operation) => {
    if (!resource) return false;
    if (
      resource.key === "propresenter-requests" &&
      op.path.startsWith("/api/admin/propresenter-batches/")
    )
      return true;
    if (resource.key === "subscriptions")
      return op.path.startsWith(
        "/api/admin/teams/{teamId}/subscriptions/{productId}/",
      );
    if (resource.key === "lessons")
      return (
        op.path.startsWith(collection + "/") ||
        (!id &&
          op.path === "/api/admin/tutorials/topics/{id}/lessons" &&
          op.method === "POST")
      );
    return op.path === collection || op.path.startsWith(collection + "/");
  };
  const relevant = operations.filter(
    (op) =>
      belongs(op) &&
      op.method !== "GET" &&
      !op.path.includes("/attachments/") &&
      !op.path.endsWith("/messages") &&
      !op.path.endsWith("/attachments") &&
      (!id
        ? !op.path.includes("{") ||
          (resource?.key === "propresenter-requests" &&
            op.path.startsWith("/api/admin/propresenter-batches/")) ||
          (resource?.key === "lessons" &&
            op.path === "/api/admin/tutorials/topics/{id}/lessons")
        : (op.path.includes("{") && !op.path.includes("/subscriptions/")) ||
          resource?.key === "subscriptions"),
  );
  const visibleActions = relevant.filter((op) => {
    if (!record) return true;
    const last = op.path.split("/").at(-1);
    if (
      resource?.key === "payments" &&
      ["accept", "reject"].includes(last || "")
    )
      return record.status === "pending";
    if (resource?.key === "payments" && last === "retry")
      return record.status === "rejected";
    if (
      ["device-requests", "stream-verifications", "yandex-requests"].includes(
        resource?.key || "",
      )
    )
      return record.status === "pending";
    if (resource?.key === "broadcasts") {
      if (record.source !== "api") return false;
      if (op.method === "PATCH" || last === "send")
        return record.status === "draft";
      if (last === "cancel")
        return ["draft", "running"].includes(record.status);
    }
    if (
      resource?.key === "devices" &&
      ["replace", "release"].includes(last || "")
    )
      return record.status === "active";
    return true;
  });
  const openOperation = (op: Operation) => {
    let path = op.path;
    const params: Record<string, Field> = {};
    for (const match of path.matchAll(/\{([^}]+)\}/g)) {
      const key = match[1];
      const known =
        resource?.key === "lessons" &&
        op.path.includes("/topics/") &&
        key === "id"
          ? topicId
          : bindings[key];
      if (known)
        path = path.replace(`{${key}}`, encodeURIComponent(String(known)));
      else params[key] = parameterOptions(key);
    }
    const fields = Object.fromEntries(
      Object.entries(op.fields).map(([key, field]) => [
        key,
        {
          ...field,
          ...(parameterOptions(key).options?.length
            ? { options: parameterOptions(key).options }
            : {}),
        },
      ]),
    );
    const title =
      op.method === "DELETE"
        ? `Удалить: ${record ? nameOf(record) : ""}`
        : operationTitle(op, !id);
    const last = op.path.split("/").at(-1)!;
    setAction({
      title,
      path,
      method: op.method,
      params,
      fields,
      required: op.required,
      defaults:
        op.method === "PATCH"
          ? Object.fromEntries(
              Object.keys(fields)
                .filter(
                  (k) =>
                    record?.[k] !== undefined &&
                    ["string", "number", "boolean"].includes(
                      typeof record?.[k],
                    ),
                )
                .map((k) => [k, record?.[k]]),
            )
          : last === "send"
            ? { confirmed: true }
            : undefined,
      danger:
        resource?.key === "admins" ||
        op.method === "DELETE" ||
        [
          "accept",
          "reject",
          "approve",
          "reset",
          "send",
          "complete",
          "release",
          "remove-from-stream",
        ].includes(last),
      description: actionDescriptions[op.method === "DELETE" ? "delete" : last],
      onSuccess: (data) => {
        if (resource?.key === "media") {
          const next = [...mediaRecords, { ...data, purpose: data.purpose }];
          setMediaRecords(next);
          sessionStorage.setItem("hub-admin-media", JSON.stringify(next));
        }
        if (last === "conversation" && data.id)
          router.push(`/admin/conversations/${data.id}`);
        else if (data && typeof data === "object")
          setResult({ title: "Результат", data });
        void client.invalidateQueries();
      },
    });
  };
  const readOperation = async (op: Operation) => {
    let path = op.path;
    for (const [key, val] of Object.entries(bindings))
      path = path.replace(`{${key}}`, encodeURIComponent(String(val)));
    if (path.includes("{")) {
      toast("Сначала выберите запись");
      return;
    }
    try {
      setResult({ title: operationTitle(op), data: await api(path) });
    } catch (e) {
      toast((e as Error).message);
    }
  };
  if (!hub.isAdmin)
    return (
      <main className="page">
        <Empty
          title="Нет доступа"
          description="Административные разделы доступны только назначенным администраторам"
        />
      </main>
    );
  if (resource && !allowed(resource.permission))
    return (
      <main className="page">
        <Empty title="Недостаточно прав" />
      </main>
    );
  if (!resource && parts.length)
    return (
      <main className="page">
        <Empty title="Раздел не найден" />
      </main>
    );
  if (!resource)
    return (
      <main className="page">
        <Heading
          title="Управление HUB"
          description="Заявки, пользователи и ресурсы вашей команды"
        />
        <div className="admin-stats">
          {[
            ["payments", "Оплаты на проверке"],
            ["deviceRequests", "Заявки устройств"],
            ["support", "Открытые обращения"],
            ["streamVerifications", "Проверки потоков"],
          ]
            .filter(([key]) => snapshot?.[key])
            .map(([key, title]) => (
              <div className="card stat" key={key}>
                <b>
                  {
                    (snapshot?.[key]?.data || []).filter((r: RecordData) =>
                      ["pending", "open"].includes(r.status),
                    ).length
                  }
                </b>
                <p className="muted">{title} · последние 100</p>
              </div>
            ))}
        </div>
        <div className="resource-grid admin-grid">
          {adminResources
            .filter((r) => allowed(r.permission))
            .map((r) => (
              <Link
                className="card resource-tile"
                href={`/admin/${r.key}`}
                key={r.key}
              >
                <r.icon size={24} />
                <div>
                  <h2>{r.title}</h2>
                  <p className="muted mt-2">{r.description}</p>
                </div>
              </Link>
            ))}
        </div>
        {summary.error && <InlineError error={summary.error} />}
      </main>
    );
  if (["support", "conversations"].includes(resource.key))
    return (
      <Messages id={id} admin payment={resource.key === "conversations"} />
    );
  return (
    <main className="page">
      <Back
        href={id ? `/admin/${resource.key}` : "/admin"}
        text={id ? "К списку" : "Управление HUB"}
      />
      <Heading
        title={id && record ? nameOf(record) : resource.title}
        description={
          id ? "Карточка и доступные действия" : resource.description
        }
      />
      {schema.error && (
        <InlineError error={schema.error} retry={() => schema.refetch()} />
      )}
      {!id && resource.key === "lessons" && (
        <label className="field mb-5">
          <span>Тема библиотеки</span>
          <select
            value={topicId}
            onChange={(e) => {
              setTopicId(e.target.value);
              setPage(0);
            }}
          >
            {topics.map((t: RecordData) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
        </label>
      )}
      {!id && ["users", "teams"].includes(resource.key) && (
        <input
          className="search"
          aria-label="Поиск"
          placeholder="Поиск по имени или названию"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(0);
          }}
        />
      )}
      {!id &&
        [
          "payments",
          "support",
          "device-requests",
          "stream-verifications",
          "yandex-requests",
          "broadcasts",
        ].includes(resource.key) && (
          <select
            className="mb-4"
            aria-label="Фильтр статуса"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Все статусы</option>
            {(resource.key === "payments"
              ? ["pending", "processing", "accepted", "rejected"]
              : resource.key === "broadcasts"
                ? ["draft", "running", "completed", "cancelled"]
                : ["pending", "approved", "rejected"]
            ).map((v) => (
              <option value={v} key={v}>
                {valueLabel(v)}
              </option>
            ))}
          </select>
        )}
      {id ? (
        detail.isLoading ? (
          <Loading />
        ) : detail.error ? (
          <InlineError error={detail.error} />
        ) : record ? (
          <>
            <div className="card detail-card">
              {record.status && <Badge status={record.status} />}
              <Detail record={record} />
              {record.subscriptions &&
                hub.permissions.includes("subscriptions.view") && (
                  <div className="stack">
                    {record.subscriptions.map((sub: RecordData) => (
                      <Link
                        className="row card"
                        key={sub.productId}
                        href={`/admin/subscriptions/${record.id}~${sub.productId}`}
                      >
                        <div className="row-copy">
                          <b>
                            {sub.productName ||
                              hub.state?.products.find(
                                (p) => p.id === sub.productId,
                              )?.name ||
                              sub.productId}
                          </b>
                        </div>
                        <Badge status={sub.status} />
                      </Link>
                    ))}
                  </div>
                )}
              {record.members && (
                <div className="stack mt-4">
                  {record.members.map((member: RecordData, i: number) => (
                    <div key={i} className="row !p-0 !border-0 !bg-transparent">
                      <div className="row-copy">
                        <b>{member.name}</b>
                        <p className="muted">{valueLabel(member.role)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {record.emails && (
                <div className="stack">
                  {record.emails.map((email: RecordData) => (
                    <div
                      key={email._id || email.id}
                      className="row !border-0 !bg-transparent"
                    >
                      <div className="row-copy">
                        <b>{email.address}</b>
                      </div>
                      <Badge status={email.status} />
                    </div>
                  ))}
                </div>
              )}
              {record.permissions && (
                <p className="muted text-xs leading-6">
                  {record.permissions
                    .map((p: string) => valueLabel(p))
                    .join(" · ")}
                </p>
              )}
              {record.mediaUrl && (
                <Download
                  path={
                    resource.key === "lessons"
                      ? `/api/admin/tutorials/lessons/${record.id}/media`
                      : record.mediaUrl
                  }
                >
                  Скачать медиа
                </Download>
              )}
              {resource.key === "payments" && (
                <Download
                  path={`${collection}/${id}/receipt`}
                  name={record.receipt?.fileName || "receipt.pdf"}
                >
                  Скачать чек
                </Download>
              )}
              {resource.key === "topics" && (
                <Link
                  className="accent-button"
                  href={`/admin/lessons?topic=${record.id}`}
                >
                  Уроки этой темы
                </Link>
              )}
              {record.telegramPreviews?.map(
                (preview: RecordData, mi: number) => (
                  <div className="info" key={mi}>
                    {preview.text}
                    {preview.attachments.map((a: RecordData, ai: number) => (
                      <Download
                        key={ai}
                        path={`${collection}/${id}/telegram-media/${mi}/${ai}`}
                      >
                        {a.fileName || "Вложение"}
                      </Download>
                    ))}
                  </div>
                ),
              )}
            </div>
            <div className="button-row">
              {operations
                .filter(
                  (op) =>
                    belongs(op) &&
                    op.method === "GET" &&
                    op.path.split("/").length ===
                      collection.split("/").length + 2 &&
                    !/receipt|media|lessons/.test(op.path),
                )
                .map((op) => (
                  <button
                    className="secondary-button"
                    key={op.path}
                    onClick={() => readOperation(op)}
                  >
                    {operationTitle(op)}
                  </button>
                ))}
            </div>
          </>
        ) : (
          <Empty title="Запись не найдена" />
        )
      ) : list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <InlineError error={list.error} retry={() => list.refetch()} />
      ) : resource.key === "media" ? (
        <div className="stack">
          {mediaRecords.map((m) => (
            <div className="card detail-card" key={m.id}>
              <b>{m.fileName}</b>
              <p className="muted mt-2">
                {valueLabel(m.type)} · готово для прикрепления
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="stack">
          {list.data?.data.map((r) => (
            <Link
              className="row card"
              key={keyFor(r)}
              href={`/admin/${resource.key}/${keyFor(r)}${resource.key === "lessons" ? `?topic=${topicId}` : ""}`}
              onClick={() =>
                client.setQueryData(
                  ["admin-record", resource.key, keyFor(r)],
                  r,
                )
              }
            >
              <div className="row-copy">
                <b>{nameOf(r)}</b>
                <p className="muted">
                  {r.userId ? `Пользователь ${r.userId} · ` : ""}
                  {r.teamName ||
                    r.city ||
                    (r.createdAt && date(r.createdAt)) ||
                    ""}
                </p>
              </div>
              {r.status ? (
                <Badge status={r.status} />
              ) : (
                <ChevronRight size={16} />
              )}
            </Link>
          ))}
          {!list.data?.data.length && (
            <Empty
              title="Пока нет записей"
              description="Изменения в Telegram появятся в этом разделе"
            />
          )}
          <Pager
            page={page}
            total={
              list.data?.meta?.totalPages ||
              Math.ceil((list.data?.meta?.total || 0) / 25) ||
              1
            }
            onChange={setPage}
          />
        </div>
      )}
      <div className="button-row">
        {visibleActions.map((op) => (
          <button
            className={
              op.method === "DELETE"
                ? "danger-button"
                : !id
                  ? "accent-button"
                  : "secondary-button"
            }
            key={`${op.method}${op.path}`}
            disabled={Boolean(id && !record)}
            onClick={() => openOperation(op)}
          >
            {!id && <Plus size={15} />} {operationTitle(op, !id)}
          </button>
        ))}
      </div>
      {result && (
        <div className="card detail-card mt-5">
          <h2>{result.title}</h2>
          {Array.isArray(result.data) ? (
            result.data.map((r: RecordData, i: number) => (
              <div key={i} className="card detail-card mt-3">
                <Detail record={r} />
                {r.devices?.map((d: RecordData) => (
                  <div className="row" key={d.deviceId}>
                    <div className="row-copy">
                      <b>{d.name}</b>
                      <p className="muted">{valueLabel(d.vote)}</p>
                    </div>
                    <Badge status={d.paymentStatus} />
                  </div>
                ))}
              </div>
            ))
          ) : (
            <>
              <Detail record={result.data} />
              {result.data.password && (
                <p className="password">Пароль: {result.data.password}</p>
              )}
            </>
          )}
          <button className="secondary-button" onClick={() => setResult(null)}>
            Скрыть
          </button>
        </div>
      )}
      {action && (
        <ActionDialog action={action} onClose={() => setAction(null)} />
      )}
    </main>
  );
}
