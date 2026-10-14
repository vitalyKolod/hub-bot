"use client";
import Link from "next/link";
import { useState } from "react";
import { useHub, useList, date } from "./data";
import {
  ActionButton,
  Badge,
  Empty,
  Heading,
  intField,
  Loading,
  InlineError,
  Pager,
  Row,
  Section,
} from "./ui";
export function Requests() {
  const hub = useHub();
  const [queuePage, setQueuePage] = useState(0);
  const [verificationPage, setVerificationPage] = useState(0);
  const queue = useList(
    hub.teamId ? `/api/teams/${hub.teamId}/propresenter-requests` : undefined,
    queuePage,
  );
  const verifications = useList(
    hub.teamId ? `/api/teams/${hub.teamId}/stream-verifications` : undefined,
    verificationPage,
  );
  return (
    <main className="page">
      <Heading
        title="Заявки ProPresenter"
        description={hub.team?.name || "Сначала выберите команду"}
      />
      {!hub.team ? (
        <Empty title="Нужна команда">
          <Link className="accent-button" href="/teams">
            Мои команды
          </Link>
        </Empty>
      ) : (
        <>
          <Section title="Новый поток">
            {queue.error && <InlineError error={queue.error} />}
            <div className="stack">
              {queue.isLoading ? (
                <Loading />
              ) : (
                queue.data?.data.map((r) => (
                  <Row
                    key={r.id}
                    title={
                      r.assignedFlowNumber
                        ? `Поток ${r.assignedFlowNumber}`
                        : "Заявка в очередь"
                    }
                    description={date(r.createdAt)}
                    end={<Badge status={r.status} />}
                  />
                ))
              )}
              {hub.team.viewerRole === "owner" && (
                <ActionButton
                  className="accent-button"
                  action={{
                    title: "Записаться в новый поток",
                    path: `/api/teams/${hub.teamId}/propresenter-requests`,
                    fields: {},
                  }}
                />
              )}
            </div>
          </Section>
          <Pager
            page={queuePage}
            total={queue.data?.meta?.totalPages || 1}
            onChange={setQueuePage}
          />
          <Section title="Проверка существующего доступа">
            {verifications.error && <InlineError error={verifications.error} />}
            <div className="stack">
              {verifications.data?.data.map((r) => (
                <Row
                  key={r.id}
                  title={`Поток ${r.flowNumber}`}
                  description={date(r.createdAt)}
                  end={<Badge status={r.status} />}
                />
              ))}
              {hub.team.viewerRole === "owner" && (
                <ActionButton
                  action={{
                    title: "Подтвердить мой поток",
                    path: `/api/teams/${hub.teamId}/stream-verifications`,
                    fields: { flowNumber: intField },
                    required: ["flowNumber"],
                  }}
                />
              )}
            </div>
          </Section>
          <Pager
            page={verificationPage}
            total={verifications.data?.meta?.totalPages || 1}
            onChange={setVerificationPage}
          />
        </>
      )}
    </main>
  );
}
