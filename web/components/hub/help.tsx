"use client";
import Link from "next/link";
import { useData, type RecordData } from "./data";
import { Back, Heading, InlineError, Loading, Row } from "./ui";
export function Help({ section }: { section?: string }) {
  const query = useData<RecordData>("/api/help");
  const titles: Record<string, string> = {
    legal: "Условия и информация",
    team: "Что такое команда",
    payment: "Об оплате",
    other: "Другие сервисы",
  };
  return (
    <main className="page">
      <Back href="/more" />
      <Heading
        title={section ? titles[section] || "Помощь" : "Помощь и информация"}
        description="Информация из бота HUB"
      />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <InlineError error={query.error} />
      ) : section ? (
        <div className="card detail-card">
          <p className="whitespace-pre-wrap leading-7">
            {String(query.data?.[section] || "").replace(/\*/g, "")}
          </p>
          <Link className="accent-button full mt-6" href="/support">
            Остались вопросы
          </Link>
        </div>
      ) : (
        <div className="stack">
          {Object.entries(titles).map(([key, title]) => (
            <Row key={key} title={title} href={`/help/${key}`} />
          ))}
          <Row
            title="ProPresenter"
            description="Доступ, потоки и подписка"
            href="/catalog/propresenter"
          />
          <Row
            title="Контент для экранов"
            description="Медиаресурсы вашей команды"
            href="/catalog"
          />
          <Row
            title="Библиотека"
            description="Инструкции и видеоуроки"
            href="/library"
          />
          <a
            className="secondary-button"
            target="_blank"
            rel="noopener noreferrer"
            href="https://t.me/imacport"
          >
            Обучение в Telegram
          </a>
        </div>
      )}
    </main>
  );
}
