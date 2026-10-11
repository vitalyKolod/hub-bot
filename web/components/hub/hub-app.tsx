"use client";
import { Suspense, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useHub } from "./data";
import { Empty, InlineError, Loading } from "./ui";
import {
  Catalog,
  Home,
  Invite,
  More,
  Notifications,
  Profile,
  SubscriptionDetail,
  Subscriptions,
  TeamPage,
  Teams,
} from "./member";
import { Cart, Checkout, Payments } from "./commerce";
import { Devices, Library, Renewals, Yandex } from "./resources";
import { Messages } from "./messaging";
import { Help } from "./help";
import { Requests } from "./requests";
import { Admin } from "./admin";
function Content() {
  const hub = useHub();
  const path = usePathname();
  const parts = path.split("/").filter(Boolean);
  useEffect(() => {
    if (
      parts[0] === "teams" &&
      parts[1] &&
      hub.teams.some((team) => team.id === parts[1]) &&
      hub.teamId !== parts[1]
    )
      hub.selectTeam(parts[1]);
  }, [parts[0], parts[1], hub.teamId, hub.teams]);
  if (hub.loading)
    return (
      <main className="page">
        <Loading />
      </main>
    );
  if (hub.error)
    return (
      <main className="page">
        <InlineError error={hub.error} retry={hub.retry} />
      </main>
    );
  if (hub.user?.registrationStatus !== "done") return <Profile registration />;
  let content: React.ReactNode;
  switch (parts[0]) {
    case undefined:
      content = <Home />;
      break;
    case "subscriptions":
      content = parts[1] ? (
        <SubscriptionDetail id={parts[1]} />
      ) : (
        <Subscriptions />
      );
      break;
    case "team":
      content = <TeamPage />;
      break;
    case "teams":
      content = parts[1] ? <TeamPage /> : <Teams />;
      break;
    case "catalog":
      content = <Catalog id={parts[1]} />;
      break;
    case "cart":
      content = <Cart />;
      break;
    case "checkout":
      content = <Checkout id={parts[1]} />;
      break;
    case "payments":
      content = <Payments id={parts[1]} />;
      break;
    case "support":
      content = <Messages id={parts[1]} />;
      break;
    case "conversations":
      content = <Messages payment id={parts[1]} />;
      break;
    case "library":
      content = (
        <Library
          topicId={parts[1] === "topics" ? parts[2] : undefined}
          lessonId={parts[1] === "lessons" ? parts[2] : undefined}
        />
      );
      break;
    case "profile":
    case "registration":
      content = <Profile />;
      break;
    case "more":
      content = <More />;
      break;
    case "help":
      content = <Help section={parts[1]} />;
      break;
    case "requests":
      content = <Requests />;
      break;
    case "devices":
      content = <Devices />;
      break;
    case "renewals":
      content = <Renewals />;
      break;
    case "yandex360":
      content = <Yandex />;
      break;
    case "notifications":
      content = <Notifications />;
      break;
    case "invites":
      content = <Invite code={parts[1]} />;
      break;
    case "admin":
      content = <Admin parts={parts.slice(1)} />;
      break;
    default:
      content = (
        <main className="page">
          <Empty title="Экран не найден" description="Выберите раздел в меню" />
        </main>
      );
  }
  return (
    <>
      {process.env.NODE_ENV === "development" &&
        process.env.NEXT_PUBLIC_ALLOW_DEV_AUTH === "true" && (
          <div className="demo-banner">
            <span>Демо · временная база · без реальных отправок</span>
            <button
              onClick={() => hub.switchDemo(hub.isAdmin ? "1001" : "9001")}
            >
              {hub.isAdmin ? "Открыть как пользователь" : "Открыть как админ"}
            </button>
          </div>
        )}
      {hub.connectionError && !hub.error && (
        <div className="info mx-5" role="status">
          Не удалось обновить данные. Показана последняя загруженная версия.{" "}
          <button className="text-accent" onClick={hub.retry}>
            Повторить
          </button>
        </div>
      )}
      {content}
    </>
  );
}
export function HubApp() {
  return (
    <Suspense
      fallback={
        <main className="page">
          <Loading />
        </main>
      }
    >
      <Content />
    </Suspense>
  );
}
