"use client";
import Link from "next/link";
import { useState } from "react";
import { BookOpen, Mail, Monitor, Plus } from "lucide-react";
import {
  useHub,
  useData,
  useAction,
  date,
  money,
  type RecordData,
} from "./data";
import {
  ActionButton,
  Back,
  Badge,
  Empty,
  Heading,
  InlineError,
  intField,
  Loading,
  Media,
  Row,
  Section,
  textField,
} from "./ui";
export function Devices() {
  const hub = useHub();
  const query = useData<{ devices: RecordData[]; requests: RecordData[] }>(
    hub.teamId ? `/api/teams/${hub.teamId}/devices` : undefined,
  );
  const flows = useData<RecordData[]>("/api/device-flows");
  if (!hub.team)
    return (
      <main className="page">
        <Empty title="Выберите команду">
          <Link href="/teams" className="accent-button">
            Мои команды
          </Link>
        </Empty>
      </main>
    );
  return (
    <main className="page">
      <Heading
        title="Устройства"
        description="Рабочие места вашей команды в ProPresenter"
      />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <InlineError error={query.error} />
      ) : (
        <>
          <div className="stack">
            {query.data?.devices.map((d) => (
              <div key={d.id} className="card detail-card">
                <div className="row !p-0 !border-0 !bg-transparent">
                  <Monitor className="text-accent" size={24} />
                  <div className="row-copy">
                    <b>{d.name}</b>
                    <p>
                      Поток {d.flowNumber} · оплачено до {date(d.paidThrough)}
                    </p>
                  </div>
                  <Badge status={d.status} />
                </div>
                {hub.team?.viewerRole === "owner" && d.status === "active" && (
                  <div className="button-row">
                    <ActionButton
                      action={{
                        title: "Заменить устройство",
                        path: `/api/teams/${hub.teamId}/devices/${d.id}/replace`,
                        fields: { name: { ...textField, maxLength: 80 } },
                        required: ["name"],
                        description:
                          "Оплаченное место сохранится; новое устройство пройдёт подтверждение.",
                      }}
                    />
                    <ActionButton
                      action={{
                        title: "Освободить устройство",
                        path: `/api/teams/${hub.teamId}/device-requests`,
                        fields: {
                          action: { type: "string", enum: ["release"] },
                          deviceId: textField,
                        },
                        defaults: { action: "release", deviceId: d.id },
                        required: ["action", "deviceId"],
                        danger: true,
                      }}
                    />
                  </div>
                )}
              </div>
            ))}
            {!query.data?.devices.length && (
              <Empty
                title="Устройства ещё не добавлены"
                description="Запросите рабочее место в потоке ProPresenter"
              />
            )}
          </div>
          {hub.team.viewerRole === "owner" && (
            <ActionButton
              className="accent-button full mt-4"
              action={{
                title: "Добавить устройство",
                path: `/api/teams/${hub.teamId}/device-requests`,
                fields: {
                  action: { type: "string", enum: ["add"] },
                  deviceName: { ...textField, maxLength: 80 },
                  toFlow: {
                    ...intField,
                    options: flows.data?.map((f) => ({
                      value: f.flowNumber,
                      label: `Поток ${f.flowNumber}`,
                    })),
                  },
                },
                defaults: { action: "add" },
                required: ["action", "deviceName"],
              }}
            >
              <Plus size={16} />
              Запросить устройство
            </ActionButton>
          )}
          <Section title="Заявки">
            <div className="stack">
              {query.data?.requests.map((r) => (
                <Row
                  key={r.id}
                  title={r.deviceName || "Устройство"}
                  description={`${r.action === "add" ? "Добавление" : "Освобождение"} · ${date(r.createdAt)}`}
                  end={<Badge status={r.status} />}
                />
              ))}
              {!query.data?.requests.length && (
                <p className="muted text-sm">Пока нет заявок</p>
              )}
            </div>
          </Section>
        </>
      )}
    </main>
  );
}
export function Renewals() {
  const hub = useHub();
  const query = useData<RecordData[]>("/api/renewals");
  const action = useAction();
  return (
    <main className="page">
      <Heading
        title="Продления"
        description="Выберите устройства для следующего периода"
      />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <InlineError error={query.error} />
      ) : (
        <div className="stack">
          {query.data?.map((campaign) => (
            <div key={campaign.id} className="card detail-card">
              <h2>ProPresenter · поток {campaign.flowNumber}</h2>
              <p className="muted mt-2">
                Период до {date(campaign.cycleEndsAt)} ·{" "}
                {money(campaign.priceRub)} за место
              </p>
              {campaign.seats.map((seat: RecordData) => {
                const selected = seat.devices.filter(
                  (d: RecordData) =>
                    d.active !== false &&
                    d.vote === "yes" &&
                    d.paymentStatus === "none",
                );
                return (
                  <section key={seat.teamId} className="mt-5">
                    <h3>
                      {seat.teamName ||
                        hub.teams.find((t) => t.id === seat.teamId)?.name ||
                        "Команда"}
                    </h3>
                    {campaign.billingMode !== "device" && (
                      <div className="stack mt-4">
                        <p className="info">
                          Продление команды. Оплата появится после расчёта
                          устройств администратором.
                        </p>
                        <select
                          aria-label="Решение по продлению команды"
                          value={seat.vote}
                          disabled={
                            action.isPending || seat.paymentStatus === "paid"
                          }
                          onChange={(e) =>
                            action.mutate({
                              path: `/api/renewals/${campaign.id}/teams/${seat.teamId}/vote`,
                              body: { vote: e.target.value },
                            })
                          }
                        >
                          <option value="none" disabled>
                            Выберите решение
                          </option>
                          <option value="yes">Продлеваем</option>
                          <option value="no">Не продлеваем</option>
                        </select>
                      </div>
                    )}
                    {seat.devices
                      .filter((d: RecordData) => d.active !== false)
                      .map((d: RecordData) => (
                        <div
                          key={d.deviceId}
                          className="row !px-0 !border-0 !bg-transparent"
                        >
                          <div className="row-copy">
                            <b>{d.name || d.deviceName || "Устройство"}</b>
                            <p className="muted">
                              {d.paymentStatus === "paid"
                                ? "Оплачено"
                                : d.paymentStatus === "pending"
                                  ? "Чек на проверке"
                                  : "Выберите продление"}
                            </p>
                          </div>
                          <select
                            aria-label={`Продление ${d.name || d.deviceName}`}
                            disabled={
                              action.isPending ||
                              ["paid", "pending"].includes(d.paymentStatus)
                            }
                            style={{ width: 135 }}
                            value={d.vote || "none"}
                            onChange={(e) =>
                              action.mutate({
                                path: `/api/renewals/${campaign.id}/devices/${d.deviceId}/vote`,
                                body: { vote: e.target.value },
                              })
                            }
                          >
                            <option value="none">Не выбрано</option>
                            <option value="yes">Продлеваем</option>
                            <option value="no">Не продлеваем</option>
                          </select>
                        </div>
                      ))}
                    {campaign.billingMode === "device" &&
                      selected.length > 0 &&
                      seat.paymentStatus !== "pending" && (
                        <Link
                          className="accent-button full"
                          href={`/checkout/propresenter?campaign=${campaign.id}&team=${seat.teamId}&devices=${selected.map((d: RecordData) => d.deviceId).join(",")}`}
                        >
                          Оплатить {selected.length} мест ·{" "}
                          {money(campaign.priceRub * selected.length)}
                        </Link>
                      )}
                  </section>
                );
              })}
            </div>
          ))}
          {!query.data?.length && (
            <Empty
              title="Сейчас нет открытых продлений"
              description="Кампания появится здесь, когда администратор откроет новый период"
            />
          )}
        </div>
      )}
    </main>
  );
}
export function Yandex() {
  const query = useData<RecordData | null>("/api/yandex360");
  return (
    <main className="page">
      <Heading
        title="Яндекс 360"
        description="Адреса вашей команды и заявки на доступ"
      />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <InlineError error={query.error} />
      ) : !query.data ? (
        <Empty
          title="Доступ пока не подключён"
          description="Напишите в поддержку, чтобы привязать вашу команду к потоку."
        >
          <Link className="accent-button" href="/support">
            Написать в поддержку
          </Link>
        </Empty>
      ) : (
        <>
          <div className="card detail-card">
            <h2>{query.data.stream?.name || "Яндекс 360"}</h2>
            <p className="muted mt-2">
              Действует до {date(query.data.stream?.endsAt)}
            </p>
          </div>
          <Section title="Ваши адреса">
            <div className="stack">
              {query.data.emails.map((email: RecordData) => (
                <div className="card detail-card" key={email.id}>
                  <div className="row !p-0 !border-0 !bg-transparent">
                    <Mail size={20} className="text-accent" />
                    <div className="row-copy">
                      <b>{email.address}</b>
                    </div>
                    <Badge status={email.status} />
                  </div>
                  <ActionButton
                    className="secondary-button mt-4"
                    action={{
                      title: "Заменить email",
                      path: "/api/yandex360/email-requests",
                      fields: { email: textField, oldEmailId: textField },
                      defaults: { oldEmailId: email.id },
                      required: ["email", "oldEmailId"],
                    }}
                  />
                </div>
              ))}
              <ActionButton
                className="accent-button"
                action={{
                  title: "Запросить email",
                  path: "/api/yandex360/email-requests",
                  fields: { email: textField },
                  required: ["email"],
                }}
              />
            </div>
          </Section>
          <Section title="Заявки">
            <div className="stack">
              {query.data.requests.map((r: RecordData) => (
                <Row
                  key={r.id}
                  title={r.proposedEmail}
                  description={date(r.createdAt)}
                  end={<Badge status={r.status} />}
                />
              ))}
            </div>
          </Section>
        </>
      )}
    </main>
  );
}
export function Library({
  topicId,
  lessonId,
}: {
  topicId?: string;
  lessonId?: string;
}) {
  const query = useData<RecordData[]>(
    !topicId && !lessonId
      ? "/api/tutorials/topics"
      : topicId
        ? `/api/tutorials/topics/${topicId}/lessons`
        : undefined,
  );
  const detail = useData<RecordData>(
    lessonId ? `/api/tutorials/lessons/${lessonId}` : undefined,
  );
  return (
    <main className="page">
      {(topicId || lessonId) && <Back href="/library" />}
      <Heading
        title={
          lessonId
            ? detail.data?.title || "Урок"
            : topicId
              ? "Уроки"
              : "Библиотека"
        }
        description="Инструкции, ответы и материалы для служения"
      />
      {query.isLoading || detail.isLoading ? (
        <Loading />
      ) : query.error || detail.error ? (
        <InlineError error={query.error || detail.error} />
      ) : lessonId && detail.data ? (
        <div className="stack">
          {detail.data.mediaUrl && (
            <Media path={detail.data.mediaUrl} type={detail.data.mediaType} />
          )}
          <p className="muted whitespace-pre-wrap leading-7">
            {detail.data.description ||
              "К этому уроку пока нет текстового описания."}
          </p>
          <Link className="secondary-button" href="/support">
            Нужна помощь с этим уроком
          </Link>
        </div>
      ) : (
        <div className="stack">
          {query.data?.map((item) => (
            <Row
              key={item.id}
              href={
                topicId
                  ? `/library/lessons/${item.id}`
                  : `/library/topics/${item.id}`
              }
              title={item.title}
              description={
                topicId ? item.description?.slice(0, 100) : "Открыть уроки"
              }
              icon={<BookOpen size={21} className="text-accent" />}
            />
          ))}
          {!query.data?.length && (
            <Empty
              title="Материалы скоро появятся"
              description="Опубликованные администратором уроки будут доступны здесь"
            />
          )}
        </div>
      )}
    </main>
  );
}
