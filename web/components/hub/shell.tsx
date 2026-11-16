"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  ChevronDown,
  CreditCard,
  Home,
  Menu,
  MessageCircle,
  Settings,
  ShieldCheck,
  Users,
  X,
  Monitor,
  Clock3,
  ShoppingCart,
} from "lucide-react";
import { useHub } from "./data";
import {
  haptic,
  initializeTelegramWebApp,
  telegramWebApp,
} from "@/lib/telegram";
const nav = [
  ["/", "Главная", Home],
  ["/subscriptions", "Подписки", CreditCard],
  ["/team", "Команда", Users],
  ["/support", "Поддержка", MessageCircle],
  ["/more", "Ещё", Settings],
] as const;
const menu = [
  ["/", "Главная", Home],
  ["/subscriptions", "Подписки", CreditCard],
  ["/catalog", "Купить подписку", ShoppingCart],
  ["/library", "Библиотека", BookOpen],
  ["/team", "Команда", Users],
  ["/devices", "Устройства", Monitor],
  ["/renewals", "Продления", Clock3],
  ["/payments", "Оплата", CreditCard],
  ["/support", "Поддержка", MessageCircle],
  ["/profile", "Настройки", Settings],
] as const;
const titles: Record<string, string> = {
  subscriptions: "Подписки",
  catalog: "Каталог",
  team: "Команда",
  teams: "Команды",
  support: "Поддержка",
  profile: "Профиль",
  more: "Ещё",
  devices: "Устройства",
  renewals: "Продления",
  payments: "Оплата",
  checkout: "Оплата",
  library: "Библиотека",
  notifications: "Уведомления",
  yandex360: "Яндекс 360",
  registration: "Регистрация",
  invites: "Приглашение",
  cart: "Корзина",
  requests: "Заявки",
  help: "Помощь",
  admin: "Управление HUB",
};
export function Shell({ children }: { children: React.ReactNode }) {
  const hub = useHub();
  const path = usePathname();
  const router = useRouter();
  const [drawer, setDrawer] = useState(false);
  useEffect(() => {
    initializeTelegramWebApp();
  }, []);
  useEffect(() => {
    setDrawer(false);
    const tg = telegramWebApp();
    const back = () => router.back();
    try {
      if (tg?.isVersionAtLeast("6.1")) {
        if (nav.some(([href]) => href === path)) tg.BackButton.hide();
        else {
          tg.BackButton.show();
          tg.BackButton.onClick(back);
        }
      }
    } catch {}
    return () => {
      try {
        tg?.BackButton.offClick(back);
      } catch {}
    };
  }, [path, router]);
  useEffect(() => {
    if (!drawer) return;
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", escape);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", escape);
    };
  }, [drawer]);
  const initials = (hub.user?.fio || "HUB")
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  const attention =
    (hub.state?.payments.filter((p) =>
      ["pending", "processing", "rejected"].includes(p.status),
    ).length || 0) + (hub.state?.renewals.length || 0);
  return (
    <div className="app-frame">
      <aside className="desktop-sidebar">
        <Link className="brand" href="/">
          HUB<span>.</span>
        </Link>
        <p className="sidebar-caption">ВАША РАБОЧАЯ ОБЛАСТЬ</p>
        {menu.map(([href, title, Icon]) => (
          <Link
            className={`side-link ${path === href ? "selected" : ""}`}
            href={href}
            key={href}
          >
            <Icon size={19} />
            {title}
          </Link>
        ))}
        {hub.isAdmin && (
          <Link className="side-link" href="/admin">
            <ShieldCheck size={19} />
            Администратор
          </Link>
        )}
        <div className="sidebar-bottom">
          <span className="avatar">{initials}</span>
          <div>
            <b>{hub.user?.fio || "Добро пожаловать"}</b>
            <p className="muted">
              {hub.team?.name || "HUB · медиа для служения"}
            </p>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="app-header">
          <button
            className="icon-button mobile-menu"
            aria-label="Открыть меню"
            onClick={() => setDrawer(true)}
          >
            <Menu size={21} />
          </button>
          <Link href="/" className="brand header-brand">
            HUB<span>.</span>
          </Link>
          <b className="header-title">
            {titles[path.split("/")[1]] || "Главная"}
          </b>
          <div className="header-actions">
            <Link
              className="icon-button"
              href="/notifications"
              aria-label="Уведомления"
            >
              <Bell size={19} />
              {attention > 0 && <i className="notification-dot" />}
            </Link>
            <Link className="avatar" aria-label="Профиль" href="/profile">
              {initials}
            </Link>
          </div>
        </header>
        {hub.teams.length > 1 && (
          <label className="team-select">
            <Users size={15} />
            <select
              aria-label="Текущая команда"
              value={hub.teamId}
              onChange={(e) => hub.selectTeam(e.target.value)}
            >
              {hub.teams.map((t) => (
                <option value={t.id} key={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </label>
        )}
        {children}
        <nav className="bottom-nav" aria-label="Основная навигация">
          {nav.map(([href, title, Icon]) => {
            const active =
              href === "/"
                ? path === href
                : href === "/more"
                  ? [
                      "/more",
                      "/profile",
                      "/library",
                      "/payments",
                      "/devices",
                      "/renewals",
                      "/admin",
                      "/yandex360",
                      "/cart",
                      "/catalog",
                    ].some((p) => path.startsWith(p))
                  : path.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={active ? "active" : ""}
                onClick={() => haptic()}
              >
                <span>
                  <Icon size={21} />
                </span>
                {title}
              </Link>
            );
          })}
        </nav>
        {path === "/" && (
          <Link
            className="floating-support"
            href="/support"
            aria-label="Написать в поддержку"
          >
            <MessageCircle size={22} />
          </Link>
        )}
      </div>
      {drawer && (
        <div className="drawer-overlay" onClick={() => setDrawer(false)}>
          <aside
            className="drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Меню HUB"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="drawer-header">
              <span className="brand">
                HUB<span>.</span>
              </span>
              <button
                autoFocus
                className="icon-button"
                aria-label="Закрыть меню"
                onClick={() => setDrawer(false)}
              >
                <X size={21} />
              </button>
            </div>
            <div className="drawer-profile">
              <span className="avatar">{initials}</span>
              <div>
                <b>{hub.user?.fio || "Ваш профиль"}</b>
                <p className="muted">
                  {hub.team?.viewerRole === "owner" ? "Владелец" : "Участник"} ·{" "}
                  {hub.team?.name || "HUB"}
                </p>
              </div>
            </div>
            <p className="sidebar-caption">РАБОЧАЯ ОБЛАСТЬ</p>
            {menu.map(([href, title, Icon], i) => (
              <div key={href}>
                {[3, 7].includes(i) && (
                  <p className="sidebar-caption">
                    {i === 3 ? "РЕСУРСЫ" : "УПРАВЛЕНИЕ"}
                  </p>
                )}
                <Link
                  onClick={() => setDrawer(false)}
                  className={`side-link ${path === href ? "selected" : ""}`}
                  href={href}
                >
                  <Icon size={19} />
                  {title}
                </Link>
              </div>
            ))}
            {hub.isAdmin && (
              <Link className="side-link" href="/admin">
                <ShieldCheck size={19} />
                Администратор
              </Link>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
