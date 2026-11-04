"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, Paperclip, Send, X } from "lucide-react";
import {
  useAction,
  useData,
  useHub,
  useList,
  date,
  type RecordData,
} from "./data";
import {
  ActionButton,
  Back,
  Badge,
  Download,
  Empty,
  Heading,
  InlineError,
  Loading,
  Pager,
  Row,
} from "./ui";
import { filePayload } from "@/lib/api";
export function Messages({
  id,
  payment = false,
  admin = false,
}: {
  id?: string;
  payment?: boolean;
  admin?: boolean;
}) {
  const hub = useHub();
  const router = useRouter();
  const [page, setPage] = useState(0);
  const base = payment
    ? admin
      ? "/api/admin/conversations"
      : "/api/conversations"
    : admin
      ? "/api/admin/support"
      : "/api/support/conversations";
  const list = useList(!id ? base : undefined, page);
  const query = useData<RecordData>(id ? `${base}/${id}` : undefined);
  const adminSummary = useData<{ snapshot: RecordData }>(
    admin ? "/api/admin/sync" : undefined,
  );
  const userName = (userId: number) => {
    const users = adminSummary.data?.snapshot?.users;
    const rows = Array.isArray(users) ? users : users?.data || [];
    return (
      rows.find((u: RecordData) => u.telegramId === userId)?.fio ||
      `Telegram ${userId}`
    );
  };
  const action = useAction();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canReply =
    !admin ||
    hub.permissions.includes(payment ? "payments.manage" : "support.reply");
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [query.data?.messages?.length]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action.isPending || (!text.trim() && !file)) return;
    setError("");
    try {
      if (file) {
        const payload = await filePayload(file);
        await action.mutateAsync({
          path: `${base}/${id}/attachments`,
          body: { ...payload, ...(text.trim() ? { text: text.trim() } : {}) },
        });
      } else
        await action.mutateAsync({
          path: `${base}/${id}/messages`,
          body: { text: text.trim() },
        });
      setText("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (e) {
      setError((e as Error).message);
    }
  };
  if (!id)
    return (
      <main className="page">
        <Heading
          title={payment ? "Общение по оплатам" : "Поддержка"}
          description={
            payment
              ? "Уточнения от администраторов по вашим платежам"
              : "Мы рядом, когда нужна помощь"
          }
        />
        {!payment && !admin && (
          <ActionButton
            className="accent-button full mb-5"
            action={{
              title: "Начать обращение",
              path: base,
              fields: {},
              onSuccess: (data) => router.push(`/support/${data.id}`),
            }}
          >
            <MessageCircle size={17} />
            Написать в поддержку
          </ActionButton>
        )}
        {list.isLoading ? (
          <Loading />
        ) : list.error ? (
          <InlineError error={list.error} />
        ) : (
          <div className="stack">
            {list.data?.data.map((c) => (
              <Row
                key={c.id}
                href={
                  admin
                    ? `/admin/${payment ? "conversations" : "support"}/${c.id}`
                    : `/${payment ? "conversations" : "support"}/${c.id}`
                }
                title={payment ? "Уточнение оплаты" : "Обращение в HUB"}
                description={`${admin && c.userId ? `${userName(c.userId)} · ` : ""}${date(c.updatedAt)}`}
                icon={<MessageCircle size={20} className="text-accent" />}
                end={<Badge status={c.status} />}
              />
            ))}
            {!list.data?.data.length && (
              <Empty
                title={
                  payment ? "Нет открытых обсуждений" : "Пока нет обращений"
                }
                description={
                  payment
                    ? "Если администратору потребуются уточнения, здесь появится переписка"
                    : "Начните новое обращение — сообщение появится и в Telegram"
                }
              />
            )}
            <Pager
              page={page}
              total={list.data?.meta?.totalPages || 1}
              onChange={setPage}
            />
            {!payment && !admin && (
              <Link className="secondary-button" href="/conversations">
                Переписка по оплатам
              </Link>
            )}
          </div>
        )}
      </main>
    );
  return (
    <main className="page chat-page">
      <Back
        href={
          admin
            ? `/admin/${payment ? "conversations" : "support"}`
            : payment
              ? "/conversations"
              : "/support"
        }
      />
      <Heading
        title={
          admin && query.data?.userId
            ? userName(query.data.userId)
            : payment
              ? "Вопрос по оплате"
              : "Поддержка HUB"
        }
        description={
          query.data?.status === "closed"
            ? "Обращение завершено"
            : "Переписка синхронизируется с Telegram"
        }
      />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <InlineError error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <div className="messages">
            {query.data?.messages?.map((m: RecordData) => {
              const fromUser = payment
                ? m.direction === "user_to_admin"
                : m.senderType === "user";
              const mine = admin ? !fromUser : fromUser;
              return (
                <div className={`message ${mine ? "mine" : ""}`} key={m.id}>
                  {m.text && <p>{m.text}</p>}
                  {m.attachments?.map((a: RecordData, i: number) => (
                    <div key={i}>
                      <Download
                        path={
                          a.url ||
                          `${base}/${id}/messages/${m.id}/attachments/${i}`
                        }
                        name={a.fileName || `attachment-${i}`}
                      >
                        {a.fileName || "Открыть вложение"}
                      </Download>
                    </div>
                  ))}
                  <time dateTime={m.createdAt}>
                    {new Intl.DateTimeFormat("ru-RU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(m.createdAt))}
                  </time>
                </div>
              );
            })}
            {!query.data?.messages?.length && (
              <p className="muted text-center py-8">
                Напишите первое сообщение
              </p>
            )}
            <div ref={bottom} />
          </div>
          {query.data?.status === "open" && canReply && (
            <div className="composer">
              {!admin && (
                <div className="quick-replies">
                  {[
                    "Продлить подписку",
                    "Не пришёл доступ",
                    "Вопрос по оплате",
                  ].map((t) => (
                    <button key={t} onClick={() => setText(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              {file && (
                <div className="info flex items-center justify-between">
                  {file.name}
                  <button
                    className="icon-button"
                    aria-label="Убрать вложение"
                    onClick={() => {
                      setFile(null);
                      if (fileInput.current) fileInput.current.value = "";
                    }}
                  >
                    <X size={15} />
                  </button>
                </div>
              )}
              <form onSubmit={submit}>
                {!payment && (
                  <>
                    <input
                      ref={fileInput}
                      className="hidden-field"
                      type="file"
                      aria-label="Вложение"
                      accept="image/png,image/jpeg,application/pdf,video/mp4"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Прикрепить файл"
                      onClick={() => fileInput.current?.click()}
                    >
                      <Paperclip size={18} />
                    </button>
                  </>
                )}
                <textarea
                  aria-label="Сообщение"
                  placeholder="Сообщение"
                  rows={1}
                  maxLength={file ? 1000 : 4000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                />
                <button
                  className="send-button"
                  aria-label="Отправить сообщение"
                  disabled={action.isPending || (!text.trim() && !file)}
                >
                  <Send size={19} />
                </button>
              </form>
              {error && (
                <p className="error-text mt-2" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
          {query.data?.status === "open" && canReply && (!payment || admin) && (
            <ActionButton
              className="secondary-button mt-5"
              action={{
                title: "Завершить обращение",
                path: `${base}/${id}/close`,
                fields: {},
                danger: true,
              }}
            />
          )}
          {query.data?.status === "closed" &&
            canReply &&
            (admin || !payment) && (
              <ActionButton
                className="accent-button mt-5"
                action={{
                  title: admin ? "Возобновить обращение" : "Новое обращение",
                  path: admin ? `${base}/${id}/reopen` : base,
                  fields: {},
                  onSuccess: (data) => {
                    if (!admin) router.push(`/support/${data.id}`);
                  },
                }}
              />
            )}
        </>
      )}
    </main>
  );
}
