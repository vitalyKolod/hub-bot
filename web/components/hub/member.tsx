"use client";
import Link from "next/link";
import { useState } from "react";
import {
  BookOpen,
  CreditCard,
  MessageCircle,
  Monitor,
  Plus,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
} from "lucide-react";
import {
  useHub,
  useData,
  useList,
  useAction,
  date,
  money,
  type RecordData,
} from "./data";
import {
  ActionButton,
  Badge,
  Back,
  Download,
  Empty,
  Heading,
  InlineError,
  intField,
  Loading,
  Logo,
  Row,
  Section,
  textField,
} from "./ui";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { Subscription } from "@/lib/types";
const order = [
  "propresenter",
  "cmg",
  "storyloops",
  "procontent",
  "sunday_screens",
  "cgs",
];
function sortedSubscriptions(subscriptions: Subscription[]) {
  return [...subscriptions].sort((a, b) => {
    const ai = order.indexOf(a.productId),
      bi = order.indexOf(b.productId);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
}
export function SubscriptionCard({
  subscription: s,
}: {
  subscription: Subscription;
}) {
  return (
    <Link className="subscription card" href={`/subscriptions/${s.productId}`}>
      <Logo id={s.productId} />
      <div className="subscription-content">
        <div className="subscription-top">
          <b>{s.productId === "cmg" ? "CMG" : s.productName}</b>
          <Badge status={s.status} />
        </div>
        <p>
          {s.flowNumber ? `Поток ${s.flowNumber} · ` : ""}
          {s.expiresAt ? `до ${date(s.expiresAt)}` : "Срок не ограничен"}
        </p>
        <div className="progress">
          <i
            style={{
              width:
                s.status === "active"
                  ? `${Math.min(100, Math.max(4, ((s.daysLeft ?? 365) / 365) * 100))}%`
                  : "0%",
            }}
          />
        </div>
      </div>
    </Link>
  );
}
export function Home() {
  const { user, team, state } = useHub();
  const subscriptions =
    team?.subscriptions.filter(
      (s) => !["none", "rejected"].includes(s.status),
    ) || [];
  const next = [...subscriptions]
    .filter((s) => s.expiresAt)
    .sort(
      (a, b) =>
        new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime(),
    )[0];
  const pending =
    state?.payments.filter((p) =>
      ["pending", "processing", "rejected"].includes(p.status),
    ) || [];
  return (
    <main className="page">
      <Heading
        title={team?.name || `Привет, ${(user?.fio || "друг").split(" ")[0]}`}
        description="Главное сначала: что нужно сделать сегодня"
      />
      {next ? (
        <div className="hero">
          <small>Ближайшее продление</small>
          <h2>{next.productName}</h2>
          <p>
            до {date(next.expiresAt)} · осталось {next.daysLeft} дн.
          </p>
          <div className="hero-actions">
            <Link
              className="accent-button"
              href={
                next.productId === "propresenter"
                  ? "/renewals"
                  : `/subscriptions/${next.productId}`
              }
            >
              <ShoppingCart size={16} />
              Продлить
            </Link>
            <Link
              className="secondary-button"
              href={`/subscriptions/${next.productId}`}
            >
              Открыть
            </Link>
          </div>
        </div>
      ) : (
        <div className="hero">
          <small>Медиа для вашей команды</small>
          <h2>
            Всё для служения.
            <br />В одном месте.
          </h2>
          <p>Подписки, ресурсы и помощь вашей команде</p>
          <div className="hero-actions">
            <Link className="accent-button" href={team ? "/catalog" : "/teams"}>
              {team ? "Выбрать подписку" : "Создать команду"} <Plus size={16} />
            </Link>
          </div>
        </div>
      )}
      <Section title="Подписки" href="/subscriptions">
        <div className="stack">
          {subscriptions.length ? (
            sortedSubscriptions(subscriptions)
              .slice(0, 3)
              .map((s) => (
                <SubscriptionCard key={s.productId} subscription={s} />
              ))
          ) : (
            <Empty
              title="Подписки появятся здесь"
              description="Начните с каталога ресурсов HUB."
            />
          )}
        </div>
      </Section>
      <Section title="Требует внимания">
        <div className="card">
          {pending.map((p) => (
            <Link key={p.id} href={`/payments/${p.id}`} className="attention">
              <i className="attention-dot" />
              <div>
                <b>
                  {p.productName} ·{" "}
                  {p.status === "rejected"
                    ? "оплата отклонена"
                    : "оплата на проверке"}
                </b>
                <p className="muted">
                  {p.rejectionReason ||
                    "Администратор проверит чек и подтвердит доступ"}
                </p>
              </div>
            </Link>
          ))}
          {state?.renewals.map((r) => (
            <Link className="attention" key={r.id} href="/renewals">
              <i className="attention-dot" />
              <div>
                <b>Открыто продление потока {r.flowNumber}</b>
                <p className="muted">
                  Выберите устройства, которые будете продлевать
                </p>
              </div>
            </Link>
          ))}
          {!pending.length && !state?.renewals.length && (
            <div className="attention">
              <i
                className="attention-dot"
                style={{ background: "var(--green)" }}
              />
              <div>
                <b>Всё в порядке</b>
                <p className="muted">
                  Здесь появятся оплаты и заявки, требующие вашего внимания
                </p>
              </div>
            </div>
          )}
        </div>
      </Section>
      <Section title="Ресурсы команды">
        <div className="two-columns">
          <Row
            href="/library"
            icon={<BookOpen size={21} className="text-accent" />}
            title="Библиотека"
            description="Инструкции и видеоуроки"
          />
          <Row
            href="/devices"
            icon={<Monitor size={21} className="text-accent" />}
            title="Устройства"
            description="Рабочие места ProPresenter"
          />
        </div>
      </Section>
    </main>
  );
}
export function Subscriptions() {
  const { team } = useHub();
  const subscriptions =
    team?.subscriptions.filter((s) => s.status !== "none") || [];
  return (
    <main className="page">
      <Heading
        title="Подписки"
        description={`${subscriptions.filter((s) => s.status === "active").length} активных подписок команды`}
      />
      <div className="stack">
        {sortedSubscriptions(subscriptions).map((s) => (
          <SubscriptionCard key={s.productId} subscription={s} />
        ))}
        {!subscriptions.length && (
          <Empty
            title="Пока нет подписок"
            description="Выберите медиаресурсы для вашей команды"
          />
        )}
        <Link className="secondary-button full" href="/catalog">
          <Plus size={16} />
          Купить подписку
        </Link>
      </div>
    </main>
  );
}
export function SubscriptionDetail({ id }: { id: string }) {
  const hub = useHub();
  const toast = useToast();
  const sub = hub.team?.subscriptions.find((s) => s.productId === id);
  const product = hub.state?.products.find((p) => p.id === id);
  const [credentials, setCredentials] = useState<RecordData | null>(null);
  const [busy, setBusy] = useState(false);
  const show = async () => {
    setBusy(true);
    try {
      setCredentials(
        await api(`/api/teams/${hub.teamId}/subscriptions/${id}/credentials`),
      );
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const access = async () => {
    setBusy(true);
    try {
      const invite = await api<{ url: string }>(
        `/api/teams/${hub.teamId}/access/${id}`,
        { method: "POST", body: "{}" },
      );
      window.open(invite.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="page">
      <Back href="/subscriptions" />
      <Heading title={product?.name || sub?.productName || "Подписка"} />
      <div className="card detail-card">
        <Logo id={id} size={62} />
        <div className="button-row">
          <Badge status={sub?.status || "none"} />
        </div>
        <p className="muted mt-4">{product?.description}</p>
        {sub && (
          <dl className="kv">
            <div>
              <dt>Действует до</dt>
              <dd>{date(sub.expiresAt)}</dd>
            </div>
            {sub.flowNumber && (
              <div>
                <dt>Поток</dt>
                <dd>{sub.flowNumber}</dd>
              </div>
            )}
          </dl>
        )}
        {sub?.status === "active" ? (
          <div className="stack mt-5">
            {id === "propresenter" ? (
              <>
                <button
                  disabled={busy}
                  className="accent-button"
                  onClick={show}
                >
                  Показать данные доступа
                </button>
                <Link className="secondary-button" href="/devices">
                  Управлять устройствами
                </Link>
                <Link className="secondary-button" href="/renewals">
                  Продление
                </Link>
              </>
            ) : (
              <button
                className="accent-button"
                disabled={busy}
                onClick={access}
              >
                Открыть материалы в Telegram
              </button>
            )}
            {hub.team?.viewerRole === "owner" && id !== "propresenter" && (
              <p className="info">
                Для изменения срока действующей подписки напишите в поддержку.
              </p>
            )}
          </div>
        ) : (
          <Link href={`/catalog/${id}`} className="accent-button full mt-5">
            Открыть в каталоге
          </Link>
        )}
      </div>
      {credentials && (
        <div className="card detail-card mt-4">
          <h2>Данные доступа</h2>
          <dl className="kv">
            {Object.entries(credentials)
              .filter(([k]) => k !== "chatLink")
              .map(([k, v]) => (
                <div key={k}>
                  <dt>
                    {k === "email"
                      ? "Email"
                      : k === "password"
                        ? "Пароль"
                        : k === "flowNumber"
                          ? "Поток"
                          : k}
                  </dt>
                  <dd className="password">{String(v ?? "—")}</dd>
                </div>
              ))}
          </dl>
          {credentials.chatLink && (
            <a
              className="secondary-button full"
              target="_blank"
              rel="noopener noreferrer"
              href={credentials.chatLink}
            >
              Чат потока
            </a>
          )}
        </div>
      )}
    </main>
  );
}
export function Teams() {
  const hub = useHub();
  return (
    <main className="page">
      <Heading
        title="Мои команды"
        description="Выберите рабочую область для подписок и ресурсов"
      />
      <div className="stack">
        {hub.teams.map((t) => (
          <button
            className="row card"
            key={t.id}
            onClick={() => {
              hub.selectTeam(t.id);
              window.location.assign("/team");
            }}
          >
            <span className="avatar">
              <Users size={18} />
            </span>
            <div className="row-copy text-left">
              <b>{t.name}</b>
              <p className="muted">
                {t.membersCount} участников ·{" "}
                {t.viewerRole === "owner" ? "Владелец" : "Волонтёр"}
              </p>
            </div>
          </button>
        ))}
        <ActionButton
          className="accent-button"
          action={{
            title: "Создать команду",
            path: "/api/teams",
            fields: { name: { ...textField, maxLength: 50 } },
            required: ["name"],
          }}
        >
          <Plus size={16} />
          Создать команду
        </ActionButton>
      </div>
    </main>
  );
}
export function TeamPage() {
  const hub = useHub();
  const [tab, setTab] = useState("members");
  const invites = useData<RecordData[]>(
    hub.team?.viewerRole === "owner"
      ? `/api/teams/${hub.teamId}/invites`
      : undefined,
  );
  const toast = useToast();
  if (!hub.team) return <Teams />;
  return (
    <main className="page">
      <Heading
        title="Команда"
        description={`${hub.team.name} · ${hub.team.membersCount} участников`}
      />
      <div className="tabs">
        <button
          className={tab === "members" ? "selected" : ""}
          onClick={() => setTab("members")}
        >
          Волонтёры
        </button>
        <button
          className={tab === "chats" ? "selected" : ""}
          onClick={() => setTab("chats")}
        >
          Чаты
        </button>
        <button
          className={tab === "manage" ? "selected" : ""}
          onClick={() => setTab("manage")}
        >
          Управление
        </button>
      </div>
      {tab === "members" && (
        <div className="stack">
          {hub.team.members.map((member, i) => (
            <div className="row card" key={i}>
              <span className="avatar">
                {member.name
                  .split(" ")
                  .slice(0, 2)
                  .map((x) => x[0])
                  .join("")}
              </span>
              <div className="row-copy">
                <b>{member.name}</b>
                <p className="muted">
                  {member.role === "owner" ? "Владелец" : "Волонтёр"}
                </p>
              </div>
              {member.username && (
                <a
                  className="secondary-button"
                  href={`https://t.me/${member.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Написать
                </a>
              )}
            </div>
          ))}
          {hub.team.viewerRole === "owner" && (
            <>
              <Link
                className="secondary-button full"
                href="/checkout/add_member"
              >
                <Plus size={16} />
                Добавить место участника
              </Link>
              {invites.data
                ?.filter((invite) => invite.status === "active")
                .map((invite) => (
                  <div className="card detail-card" key={invite.code}>
                    <b>Оплаченное приглашение</b>
                    <p className="muted mt-2">
                      Одноразовая ссылка для нового участника
                    </p>
                    <button
                      className="secondary-button mt-3"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            invite.link ||
                              `${location.origin}/invites/${invite.code}`,
                          );
                          toast("Ссылка скопирована");
                        } catch {
                          toast("Не удалось скопировать ссылку");
                        }
                      }}
                    >
                      Скопировать ссылку
                    </button>
                  </div>
                ))}
            </>
          )}
        </div>
      )}
      {tab === "chats" && (
        <div className="stack">
          {hub.team.subscriptions
            .filter((s) => s.status === "active")
            .map((s) => (
              <Row
                key={s.productId}
                href={`/subscriptions/${s.productId}`}
                title={s.productName}
                description="Открыть доступ и чат"
                icon={<Logo id={s.productId} />}
              />
            ))}
          {!hub.team.subscriptions.some((s) => s.status === "active") && (
            <Empty
              title="Чаты пока недоступны"
              description="Они появятся после подтверждения подписки"
            />
          )}
        </div>
      )}
      {tab === "manage" && (
        <div className="stack">
          <Row
            title={hub.team.name}
            description={hub.team.city || hub.user?.city || ""}
            icon={<Users className="text-accent" />}
          />
          {hub.team.viewerRole === "owner" && (
            <ActionButton
              action={{
                title: "Переименовать команду",
                path: `/api/teams/${hub.teamId}`,
                method: "PATCH",
                fields: { name: { ...textField, maxLength: 50 } },
                required: ["name"],
                defaults: { name: hub.team.name },
              }}
            />
          )}
          <Link href="/teams" className="secondary-button">
            Мои команды
          </Link>
          <Link href="/devices" className="secondary-button">
            Устройства
          </Link>
          <Link href="/renewals" className="secondary-button">
            Продления
          </Link>
        </div>
      )}
    </main>
  );
}
export function Catalog({ id }: { id?: string }) {
  const hub = useHub();
  const mutation = useAction();
  const product = hub.state?.products.find((p) => p.id === id);
  if (id && !product) return <Empty title="Продукт не найден" />;
  const products = product
    ? [product]
    : hub.state?.products.filter((p) => p.id !== "add_member") || [];
  return (
    <main className="page">
      {id && <Back href="/catalog" />}
      <Heading
        title={product?.name || "Медиа для служения"}
        description={
          product
            ? "Всё необходимое для вашей команды"
            : "Выберите то, что поможет вашей команде"
        }
      />
      <div className={id ? "stack" : "resource-grid"}>
        {products.map((p) => {
          const sub = hub.team?.subscriptions.find((s) => s.productId === p.id);
          return (
            <div key={p.id} className="card catalog-card">
              <div className="flex items-center justify-between">
                <Logo id={p.id} size={55} />
                {sub?.status === "active" && <Badge status="active" />}
              </div>
              <h2>{p.name}</h2>
              <p className="muted">{p.description}</p>
              <div className="catalog-price">
                <span>{money(p.priceRub)}</span>
                <span className="muted text-xs">
                  {money(p.priceUsd, "usd")}
                </span>
              </div>
              <div className="stack mt-4">
                {!hub.team ? (
                  <Link className="accent-button" href="/teams">
                    Сначала создайте команду
                  </Link>
                ) : sub?.status === "active" ? (
                  <Link
                    className="accent-button"
                    href={`/subscriptions/${p.id}`}
                  >
                    Открыть подписку
                  </Link>
                ) : hub.team.viewerRole !== "owner" ? (
                  <p className="info">Покупку оформляет владелец команды</p>
                ) : p.id === "propresenter" ? (
                  <>
                    <ActionButton
                      className="accent-button"
                      action={{
                        title: "Записаться в поток",
                        path: `/api/teams/${hub.teamId}/propresenter-requests`,
                        fields: {},
                        description:
                          "Администратор подберёт поток и свяжется с вами.",
                      }}
                    />
                    <ActionButton
                      action={{
                        title: "Я уже состою в потоке",
                        path: `/api/teams/${hub.teamId}/stream-verifications`,
                        fields: { flowNumber: intField },
                        required: ["flowNumber"],
                      }}
                    />
                  </>
                ) : (
                  <>
                    <Link className="accent-button" href={`/checkout/${p.id}`}>
                      Купить подписку
                    </Link>
                    <button
                      className="secondary-button"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          path: `/api/teams/${hub.teamId}/cart/items`,
                          body: { productId: p.id },
                        })
                      }
                    >
                      <ShoppingCart size={15} />В корзину
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <Link className="secondary-button full mt-5" href="/cart">
        Открыть корзину
      </Link>
    </main>
  );
}
export function Profile({ registration = false }: { registration?: boolean }) {
  const hub = useHub();
  const action = useAction();
  const [fio, setFio] = useState(hub.user?.fio || "");
  const [city, setCity] = useState(hub.user?.city || "");
  const [church, setChurch] = useState(hub.user?.church || "");
  const [review, setReview] = useState(false);
  const path = registration ? "/api/registration" : "/api/me";
  return (
    <main className="page">
      <Heading
        title={registration ? "Добро пожаловать в HUB" : "Ваш профиль"}
        description={
          registration
            ? "Давайте познакомимся, чтобы открыть кабинет вашей команды"
            : "Контактные данные для поддержки и команды"
        }
      />
      <form
        className="card detail-card stack"
        onSubmit={async (e) => {
          e.preventDefault();
          if (action.isPending) return;
          try {
            await action.mutateAsync({
              path,
              method: "PATCH",
              body: { fio, city, church },
            });
            if (registration) setReview(true);
          } catch {}
        }}
      >
        <label className="field">
          <span>Имя и фамилия</span>
          <input
            value={fio}
            onChange={(e) => setFio(e.target.value)}
            required
            minLength={3}
            maxLength={200}
            autoComplete="name"
          />
        </label>
        <label className="field">
          <span>Город</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            required
            maxLength={200}
            autoComplete="address-level2"
          />
        </label>
        <label className="field">
          <span>Церковь</span>
          <input
            value={church}
            onChange={(e) => setChurch(e.target.value)}
            required
            maxLength={200}
          />
        </label>
        <button className="accent-button" disabled={action.isPending}>
          {registration ? "Проверить данные" : "Сохранить изменения"}
        </button>
      </form>
      {registration && review && (
        <div className="card detail-card mt-4">
          <h2>Всё верно?</h2>
          <p className="muted mt-3">
            {fio} · {city} · {church}
          </p>
          <ActionButton
            className="accent-button full mt-4"
            action={{
              title: "Подтвердить регистрацию",
              path: "/api/registration/confirm",
              fields: { confirmed: { type: "boolean" } },
              defaults: { confirmed: true },
              required: ["confirmed"],
              onSuccess: () => window.location.assign("/"),
            }}
          />
        </div>
      )}
      {!registration && (
        <div className="stack mt-5">
          <Row
            href="/teams"
            title="Рабочие команды"
            icon={<Users size={20} />}
          />
          <Row
            href="/more"
            title="Настройки и разделы"
            icon={<Settings size={20} />}
          />
          <p className="muted text-xs text-center">
            Авторизация через Telegram · HUB
          </p>
        </div>
      )}
    </main>
  );
}
export function More() {
  const hub = useHub();
  const links = [
    ["/help", "Помощь и условия", "Ответы и информация о HUB", BookOpen],
    ["/library", "Библиотека", "Инструкции и видеоуроки", BookOpen],
    ["/requests", "ProPresenter", "Заявки и проверки доступа", Monitor],
    ["/devices", "Устройства", "Компьютеры команды", Monitor],
    ["/renewals", "Продления", "Кампании ProPresenter", CreditCard],
    ["/yandex360", "Яндекс 360", "Адреса и заявки", CreditCard],
    ["/payments", "Оплата", "Чеки и история", CreditCard],
    ["/cart", "Корзина", "Выбранные подписки", ShoppingCart],
    ["/profile", "Настройки", "Ваш профиль", Settings],
    ["/teams", "Мои команды", "Переключение и создание", Users],
  ] as const;
  return (
    <main className="page">
      <Heading title="Ещё" description="Всё для вашей команды в одном месте" />
      <div className="stack">
        {links.map(([href, title, description, Icon]) => (
          <Row
            key={href}
            href={href}
            title={title}
            description={description}
            icon={<Icon size={21} className="text-accent" />}
          />
        ))}
        {hub.isAdmin && (
          <Row
            href="/admin"
            title="Администратор"
            description="Пользователи, заявки и ресурсы"
            icon={<ShieldCheck size={21} className="text-accent" />}
          />
        )}
      </div>
    </main>
  );
}
export function Notifications() {
  const { state } = useHub();
  const items = [
    ...(state?.payments
      .filter((p) => ["pending", "processing", "rejected"].includes(p.status))
      .map((p) => ({
        id: p.id,
        title: p.productName,
        description:
          p.status === "rejected"
            ? p.rejectionReason || "Оплата отклонена"
            : "Оплата на проверке",
        href: `/payments/${p.id}`,
      })) || []),
    ...(state?.deviceRequests
      .filter((r) => r.status === "pending")
      .map((r) => ({
        id: r.id,
        title: r.deviceName,
        description: "Заявка на устройство ожидает решения",
        href: "/devices",
      })) || []),
    ...(state?.renewals.map((r) => ({
      id: r.id,
      title: `Продление потока ${r.flowNumber}`,
      description: "Выберите устройства и подтвердите участие",
      href: "/renewals",
    })) || []),
  ];
  return (
    <main className="page">
      <Heading
        title="Требует внимания"
        description="Актуальные статусы из вашего кабинета"
      />
      <div className="stack">
        {items.map((item) => (
          <Row key={item.id} {...item} />
        ))}
        {!items.length && (
          <Empty
            title="Всё в порядке"
            description="Здесь появятся события, которым нужно ваше внимание"
          />
        )}
      </div>
    </main>
  );
}
export function Invite({ code }: { code: string }) {
  const query = useData<RecordData>(`/api/invites/${encodeURIComponent(code)}`);
  if (query.isLoading) return <Loading />;
  if (query.error) return <InlineError error={query.error} />;
  return (
    <main className="page">
      <Heading title="Приглашение в команду" />
      <div className="card detail-card">
        <h2>{query.data?.teamName || "Команда HUB"}</h2>
        <p className="muted mt-3">
          Приглашение одноразовое. Подтвердите участие в команде.
        </p>
        <ActionButton
          className="accent-button full mt-5"
          action={{
            title: "Присоединиться",
            path: `/api/invites/${encodeURIComponent(code)}/accept`,
            fields: {},
            onSuccess: () => window.location.assign("/team"),
          }}
        />
      </div>
    </main>
  );
}
