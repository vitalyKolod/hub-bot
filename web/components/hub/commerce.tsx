"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Check,
  CreditCard,
  FileCheck2,
  ShoppingCart,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useAction,
  useData,
  useHub,
  useList,
  date,
  money,
  type RecordData,
} from "./data";
import {
  Back,
  Badge,
  Download,
  Empty,
  Heading,
  InlineError,
  Loading,
  Logo,
  Pager,
  Row,
  ActionButton,
} from "./ui";
import { filePayload } from "@/lib/api";
export function Cart() {
  const hub = useHub();
  const query = useData<RecordData>(
    hub.teamId ? `/api/teams/${hub.teamId}/cart` : undefined,
  );
  if (!hub.team)
    return (
      <main className="page">
        <Empty title="Сначала нужна команда">
          <Link className="accent-button" href="/teams">
            Создать команду
          </Link>
        </Empty>
      </main>
    );
  return (
    <main className="page">
      <Heading title="Корзина" description={hub.team.name} />
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <InlineError error={query.error} />
      ) : (
        <div className="stack">
          {query.data?.items.length ? (
            query.data.items.map((item: RecordData) => {
              const p = hub.state?.products.find(
                (p) => p.id === item.productId,
              );
              return (
                <div className="card detail-card" key={item.id}>
                  <div className="row !p-0 !border-0 !bg-transparent">
                    <Logo id={item.productId} />
                    <div className="row-copy">
                      <b>{p?.name || item.productId}</b>
                      <p className="muted">
                        {money(item.priceRub)} · {money(item.priceUsd, "usd")}
                      </p>
                    </div>
                    <Badge status={item.status} />
                  </div>
                  {hub.team?.viewerRole === "owner" &&
                    item.status === "pending" && (
                      <div className="button-row">
                        <Link
                          className="accent-button"
                          href={`/checkout/${item.productId}?cart=${item.id}`}
                        >
                          Оплатить
                        </Link>
                        <ActionButton
                          action={{
                            title: "Удалить из корзины",
                            path: `/api/teams/${hub.teamId}/cart/items/${item.id}`,
                            method: "DELETE",
                            danger: true,
                          }}
                        >
                          <Trash2 size={16} />
                        </ActionButton>
                      </div>
                    )}
                </div>
              );
            })
          ) : (
            <Empty
              title="Корзина пуста"
              description="Выберите подписки для команды"
            />
          )}
          <Link className="secondary-button" href="/catalog">
            Открыть каталог
          </Link>
        </div>
      )}
    </main>
  );
}
export function Checkout({ id }: { id: string }) {
  const hub = useHub();
  const router = useRouter();
  const params = useSearchParams();
  const options = useData<RecordData[]>("/api/payment-options");
  const action = useAction();
  const [method, setMethod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const product = hub.state?.products.find((p) => p.id === id);
  const campaign = hub.state?.renewals.find(
    (c) => c.id === params.get("campaign"),
  );
  const selectedDevices = (params.get("devices") || "")
    .split(",")
    .filter(Boolean);
  const cartItemId = params.get("cart");
  const targetTeam = params.get("team") || hub.teamId;
  const team = hub.teams.find((t) => t.id === targetTeam);
  const selected = options.data?.find((o) => o.id === method);
  const price =
    selected?.currency === "usd"
      ? (campaign?.priceUsd ?? product?.priceUsd)
      : (campaign?.priceRub ?? product?.priceRub);
  const total = campaign
    ? Number(price || 0) * Math.max(1, selectedDevices.length)
    : price;
  if (!team || team.viewerRole !== "owner")
    return (
      <main className="page">
        <Empty title="Оплату оформляет владелец команды">
          <Link className="secondary-button" href="/teams">
            Мои команды
          </Link>
        </Empty>
      </main>
    );
  if (!product)
    return (
      <main className="page">
        <Empty title="Продукт не найден" />
      </main>
    );
  if (id === "propresenter" && !campaign)
    return (
      <main className="page">
        <Empty
          title="Продление через кампанию"
          description="Для новой подписки сначала запишитесь в поток."
        >
          <Link className="accent-button" href="/renewals">
            Продления
          </Link>
          <Link className="secondary-button" href="/catalog/propresenter">
            Открыть ProPresenter
          </Link>
        </Empty>
      </main>
    );
  const active =
    team.subscriptions.find((s) => s.productId === id)?.status === "active";
  if (active && !campaign)
    return (
      <main className="page">
        <Empty
          title="Подписка уже активна"
          description="Повторная покупка сейчас недоступна. Для изменения срока обратитесь в поддержку."
        >
          <Link className="accent-button" href="/support">
            Написать в поддержку
          </Link>
        </Empty>
      </main>
    );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (action.isPending) return;
    setError("");
    try {
      if (!file || !selected)
        throw Error("Выберите способ оплаты и прикрепите чек");
      if (!["image/png", "image/jpeg", "application/pdf"].includes(file.type))
        throw Error("Чек должен быть PDF, PNG или JPEG");
      const payload = await filePayload(file, 5);
      const result = await action.mutateAsync({
        path: "/api/payments",
        body: {
          teamId: targetTeam,
          productId: id,
          currency: selected.currency,
          paymentMethod: selected.id,
          operation: campaign ? "renewal" : "purchase",
          receiptBase64: payload.fileBase64,
          fileName: payload.fileName,
          ...(cartItemId ? { cartItemId } : {}),
          ...(campaign
            ? {
                renewalCampaignId: campaign.id,
                renewalDeviceIds: selectedDevices,
              }
            : {}),
        },
      });
      router.push(`/payments/${result.data.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <main className="page">
      <Back href={campaign ? "/renewals" : "/catalog"} />
      <Heading
        title="Оплата подписки"
        description="Переведите сумму и отправьте чек на проверку"
      />
      <div className="card detail-card">
        <div className="row !p-0 !border-0 !bg-transparent">
          <Logo id={id} />
          <div className="row-copy">
            <b>{product.name}</b>
            <p className="muted">
              {team.name}
              {campaign ? ` · ${selectedDevices.length} устройств` : ""}
            </p>
          </div>
        </div>
      </div>
      <form className="stack mt-5" onSubmit={submit}>
        <label className="field">
          <span>Способ оплаты</span>
          <select
            value={method}
            required
            onChange={(e) => setMethod(e.target.value)}
          >
            <option value="">Выберите способ</option>
            {options.data
              ?.filter((o) => o.configured)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label} · {o.currency === "usd" ? "USD" : "RUB"}
                </option>
              ))}
          </select>
        </label>
        {options.error && (
          <InlineError error={options.error} retry={() => options.refetch()} />
        )}
        {selected && (
          <div className="card detail-card">
            <h2>К переводу: {money(total, selected.currency)}</h2>
            <p className="muted mt-3 whitespace-pre-wrap">{selected.details}</p>
            <p className="muted mt-3">Получатель: {selected.recipient}</p>
          </div>
        )}
        <label className="field file-drop">
          <Upload className="text-accent" size={22} />
          <span>Прикрепить чек</span>
          <p className="muted text-xs">PDF, PNG или JPEG · до 5 МБ</p>
          <input
            aria-label="Чек об оплате"
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            required
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>Я проверил реквизиты и выполнил перевод</span>
        </label>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <button
          className="accent-button"
          disabled={action.isPending || !confirmed || !selected || !file}
        >
          <FileCheck2 size={17} />
          {action.isPending ? "Отправляем чек…" : "Отправить на проверку"}
        </button>
        <p className="muted text-xs leading-5">
          Доступ появится после подтверждения администратором. Здесь будет виден
          актуальный статус оплаты.
        </p>
      </form>
    </main>
  );
}
export function Payments({
  id,
  admin = false,
}: {
  id?: string;
  admin?: boolean;
}) {
  const [page, setPage] = useState(0);
  const base = admin ? "/api/admin/payments" : "/api/payments";
  const list = useList(!id ? base : undefined, page);
  const detail = useData<RecordData>(id ? `${base}/${id}` : undefined);
  const action = useAction();
  if (id)
    return (
      <main className="page">
        <Back href={admin ? "/admin/payments" : "/payments"} />
        <Heading title="Детали оплаты" />
        {detail.isLoading ? (
          <Loading />
        ) : detail.error ? (
          <InlineError error={detail.error} />
        ) : (
          detail.data && (
            <div className="card detail-card">
              <div className="flex items-center justify-between gap-3">
                <h2>{detail.data.productName}</h2>
                <Badge status={detail.data.status} />
              </div>
              <dl className="kv">
                <div>
                  <dt>Сумма</dt>
                  <dd>{money(detail.data.amount, detail.data.currency)}</dd>
                </div>
                <div>
                  <dt>Дата</dt>
                  <dd>{date(detail.data.createdAt)}</dd>
                </div>
                <div>
                  <dt>Операция</dt>
                  <dd>
                    {detail.data.operation === "renewal"
                      ? "Продление"
                      : "Покупка"}
                  </dd>
                </div>
              </dl>
              {detail.data.rejectionReason && (
                <p className="info">
                  Причина отклонения: {detail.data.rejectionReason}
                </p>
              )}
              <Download
                path={`${base}/${id}/receipt`}
                name={detail.data.receipt?.fileName || "receipt.pdf"}
              >
                Скачать чек
              </Download>
              {!admin && (
                <Link className="secondary-button ml-2" href="/support">
                  Задать вопрос
                </Link>
              )}
            </div>
          )
        )}
      </main>
    );
  return (
    <main className="page">
      <Heading title="Оплата" description="История и статусы ваших платежей" />
      {list.isLoading ? (
        <Loading />
      ) : list.error ? (
        <InlineError error={list.error} />
      ) : (
        <div className="stack">
          {list.data?.data.map((p) => (
            <Row
              key={p.id}
              href={`/payments/${p.id}`}
              title={p.productName}
              description={`${money(p.amount, p.currency)} · ${date(p.createdAt)}`}
              icon={<CreditCard size={20} className="text-accent" />}
              end={<Badge status={p.status} />}
            />
          ))}
          {!list.data?.data.length && (
            <Empty
              title="Пока нет оплат"
              description="Отправленные чеки и решения администратора появятся здесь"
            />
          )}
          <Pager
            page={page}
            total={list.data?.meta?.totalPages || 1}
            onChange={setPage}
          />
          <Link className="secondary-button" href="/conversations">
            Переписка по оплатам
          </Link>
        </div>
      )}
    </main>
  );
}
