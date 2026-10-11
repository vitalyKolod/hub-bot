"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  LoaderCircle,
  Plus,
  X,
} from "lucide-react";
import { useAction, useHub, type RecordData } from "./data";
import { label, valueLabel } from "@/lib/ui-meta";
import { filePayload, downloadFile, mediaBlob } from "@/lib/api";
import { useToast } from "@/components/toast";
export function Heading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="heading">
      <div>
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Section({
  title,
  href,
  children,
}: {
  title: string;
  href?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-heading">
        <h2>{title}</h2>
        {href && (
          <Link className="text-accent" href={href}>
            Все →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge status-${status}`}>
      <i />
      {valueLabel(status)}
    </span>
  );
}
export function Logo({ id, size = 44 }: { id: string; size?: number }) {
  const text: Record<string, string> = {
    propresenter: "◧",
    cmg: "CMG",
    storyloops: "〰",
    procontent: "C",
    sunday_screens: "S¹",
    cgs: "CGS",
    add_member: "+",
  };
  return (
    <span
      className={`product-logo logo-${id}`}
      style={{
        width: size,
        height: size,
        fontSize: id === "cmg" || id === "cgs" ? size / 3 : size / 1.7,
      }}
    >
      {text[id] || id.slice(0, 2).toUpperCase()}
    </span>
  );
}
export function Empty({
  title = "Пока ничего нет",
  description,
  children,
}: {
  title?: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty card">
      <div className="empty-symbol">＋</div>
      <h3>{title}</h3>
      {description && <p className="muted">{description}</p>}
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="stack">
      <div className="skeleton h-8 w-2/3" />
      <div className="skeleton h-24" />
      <div className="skeleton h-24" />
    </div>
  );
}
export function InlineError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error card" role="alert">
      <b>Не удалось выполнить запрос</b>
      <p>{error instanceof Error ? error.message : "Попробуйте ещё раз"}</p>
      {retry && (
        <button className="secondary-button" onClick={retry}>
          Повторить
        </button>
      )}
    </div>
  );
}
export function Row({
  href,
  icon,
  title,
  description,
  end,
}: {
  href?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  end?: React.ReactNode;
}) {
  const content = (
    <>
      {icon}
      <div className="row-copy">
        <b>{title}</b>
        {description && <p className="muted">{description}</p>}
      </div>
      {end || <ChevronRight size={18} className="muted" />}
    </>
  );
  return href ? (
    <Link className="row card" href={href}>
      {content}
    </Link>
  ) : (
    <div className="row card">{content}</div>
  );
}
export function Back({
  href = "/",
  text = "Назад",
}: {
  href?: string;
  text?: string;
}) {
  return (
    <Link className="back muted" href={href}>
      <ArrowLeft size={16} />
      {text}
    </Link>
  );
}
export function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (p: number) => void;
}) {
  return total > 1 ? (
    <div className="pager">
      <button
        className="secondary-button"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        Назад
      </button>
      <span>
        {page + 1} / {total}
      </span>
      <button
        className="secondary-button"
        disabled={page + 1 >= total}
        onClick={() => onChange(page + 1)}
      >
        Далее
      </button>
    </div>
  ) : null;
}
export type Field = {
  type?: string;
  enum?: any[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  items?: Field;
  maxItems?: number;
  options?: { value: string; label: string }[];
};
export type Action = {
  title: string;
  path: string;
  method?: string;
  fields?: Record<string, Field>;
  required?: string[];
  defaults?: RecordData;
  danger?: boolean;
  description?: string;
  onSuccess?: (data: any) => void;
  params?: Record<string, Field>;
};
function FieldInput({
  name,
  field,
  value,
  onChange,
  required,
}: {
  name: string;
  field: Field;
  value: any;
  onChange: (v: any) => void;
  required: boolean;
}) {
  const hub = useHub();
  const [custom, setCustom] = useState(false);
  let options = field.options;
  if (
    !options &&
    [
      "teamId",
      "ownerId",
      "productId",
      "deviceId",
      "replacesDeviceId",
      "oldEmailId",
      "mediaId",
      "uploadId",
    ].includes(name)
  ) {
    if (name === "teamId")
      options = hub.teams.map((t) => ({ value: t.id, label: t.name }));
    if (name === "productId")
      options = hub.state?.products.map((p) => ({
        value: p.id,
        label: p.name,
      }));
    if (name === "deviceId" || name === "replacesDeviceId")
      options = hub.state?.devices.map((d) => ({ value: d.id, label: d.name }));
    if (name === "oldEmailId")
      options = hub.state?.yandex360?.emails.map((e: RecordData) => ({
        value: e.id,
        label: e.address,
      }));
  }
  if (field.type === "boolean")
    return (
      <label className="check-row">
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span>{label(name)}</span>
      </label>
    );
  if (field.type === "array" && field.items?.enum)
    return (
      <fieldset className="field">
        <legend>{label(name)}</legend>
        <div className="checks">
          {field.items.enum.map((v) => (
            <label className="check-row" key={v}>
              <input
                type="checkbox"
                checked={(value || []).includes(v)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...(value || []), v]
                      : (value || []).filter((x: any) => x !== v),
                  )
                }
              />
              {valueLabel(v)}
            </label>
          ))}
        </div>
      </fieldset>
    );
  return (
    <label className="field">
      <span>
        {label(name)}
        {required && <i> *</i>}
      </span>
      {field.enum || options?.length ? (
        <select
          value={custom ? "__custom" : (value ?? "")}
          required={required}
          onChange={(e) => {
            if (e.target.value === "__custom") {
              setCustom(true);
              onChange("");
              return;
            }
            setCustom(false);
            onChange(
              field.type === "integer"
                ? e.target.value
                  ? Number(e.target.value)
                  : ""
                : e.target.value,
            );
          }}
        >
          <option value="">Выберите</option>
          {(
            options ||
            field.enum!.map((v) => ({ value: v, label: valueLabel(v) }))
          ).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
          {options?.length && !field.enum && (
            <option value="__custom">Указать другой ID</option>
          )}
        </select>
      ) : name === "text" || name === "description" ? (
        <textarea
          rows={4}
          required={required}
          maxLength={field.maxLength}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === "array" ? (
        <input
          value={(value || []).join(", ")}
          required={required}
          placeholder="Через запятую"
          onChange={(e) =>
            onChange(
              e.target.value
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
            )
          }
        />
      ) : (
        <input
          type={
            field.type === "integer"
              ? "number"
              : name === "password"
                ? "password"
                : name === "email"
                  ? "email"
                  : /At$/.test(name)
                    ? "datetime-local"
                    : "text"
          }
          value={
            /At$/.test(name) && value
              ? new Date(
                  new Date(value).getTime() -
                    new Date(value).getTimezoneOffset() * 60000,
                )
                  .toISOString()
                  .slice(0, 16)
              : (value ?? "")
          }
          required={required}
          min={field.minimum}
          max={field.maximum}
          minLength={field.minLength}
          maxLength={field.maxLength}
          pattern={field.pattern}
          autoComplete={name === "password" ? "new-password" : "off"}
          onChange={(e) =>
            onChange(
              field.type === "integer"
                ? e.target.value === ""
                  ? ""
                  : Number(e.target.value)
                : /At$/.test(name) && e.target.value
                  ? new Date(e.target.value).toISOString()
                  : e.target.value,
            )
          }
        />
      )}
      {custom && !field.enum && (
        <input
          aria-label={`${label(name)}: другой ID`}
          required={required}
          type={field.type === "integer" ? "number" : "text"}
          min={field.minimum}
          pattern={field.pattern}
          value={value ?? ""}
          onChange={(e) =>
            onChange(
              field.type === "integer"
                ? e.target.value
                  ? Number(e.target.value)
                  : ""
                : e.target.value,
            )
          }
        />
      )}
    </label>
  );
}
export function ActionDialog({
  action,
  onClose,
}: {
  action: Action;
  onClose: () => void;
}) {
  const [data, setData] = useState<RecordData>(action.defaults || {});
  const [params, setParams] = useState<RecordData>({});
  const [confirmed, setConfirmed] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const mutation = useAction();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    const handler = (e: Event) => {
      e.preventDefault();
      if (!mutation.isPending) onClose();
    };
    dialog?.addEventListener("cancel", handler);
    return () => dialog?.removeEventListener("cancel", handler);
  }, [onClose, mutation.isPending]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mutation.isPending) return;
    setFileError("");
    try {
      const body: RecordData = {};
      for (const [key, field] of Object.entries(action.fields || {})) {
        const value = data[key];
        if (
          value !== undefined &&
          value !== "" &&
          !(field.type === "array" && !value.length)
        )
          body[key] = value;
        else if (field.type === "boolean") body[key] = false;
        else if (field.minLength === 0 && value === "") body[key] = "";
      }
      if (action.fields?.fileBase64) {
        if (!file) throw Error("Выберите файл");
        Object.assign(body, await filePayload(file));
      }
      let path = action.path;
      for (const [key, value] of Object.entries(params))
        path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
      const result = await mutation.mutateAsync({
        path,
        method: action.method,
        body: action.method === "DELETE" ? undefined : body,
      });
      action.onSuccess?.(result.data);
      onClose();
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Ошибка");
    }
  };
  return (
    <dialog ref={ref} className="modal">
      <form onSubmit={submit}>
        <div className="modal-top">
          <h2>{action.title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Закрыть"
            disabled={mutation.isPending}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {action.description && (
          <p className="muted mb-5">{action.description}</p>
        )}
        <div className="stack">
          {Object.entries(action.params || {}).map(([key, field]) => (
            <FieldInput
              key={key}
              name={key}
              field={field}
              value={params[key]}
              required
              onChange={(v) => setParams({ ...params, [key]: v })}
            />
          ))}
          {Object.entries(action.fields || {})
            .filter(
              ([key]) => !["fileBase64", "fileName", "mimeType"].includes(key),
            )
            .map(([key, field]) => (
              <FieldInput
                key={key}
                name={key}
                field={field}
                required={Boolean(action.required?.includes(key))}
                value={data[key]}
                onChange={(v) => setData({ ...data, [key]: v })}
              />
            ))}
          {action.fields?.fileBase64 && (
            <label className="field">
              <span>Фото, видео или PDF · до 10 МБ</span>
              <input
                type="file"
                accept="image/png,image/jpeg,video/mp4,application/pdf"
                required
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
            </label>
          )}
          {action.danger && (
            <label className="check-row warning">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>Я проверил данные и подтверждаю действие</span>
            </label>
          )}
          {fileError && (
            <p className="error-text" role="alert">
              {fileError}
            </p>
          )}
          <button
            className="accent-button full"
            disabled={mutation.isPending || (action.danger && !confirmed)}
          >
            {mutation.isPending ? (
              <LoaderCircle size={18} className="spin" />
            ) : (
              <Check size={18} />
            )}{" "}
            {mutation.isPending ? "Сохраняем…" : action.title}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export function ActionButton({
  action,
  children,
  className = "secondary-button",
}: {
  action: Action;
  children?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        {children || action.title}
      </button>
      {open && <ActionDialog action={action} onClose={() => setOpen(false)} />}
    </>
  );
}
export function Download({
  path,
  name,
  children,
}: {
  path: string;
  name?: string;
  children?: React.ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const toast = useToast();
  return (
    <button
      className="secondary-button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await downloadFile(path, name);
        } catch (e) {
          toast((e as Error).message);
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? "Загружаем…" : children || "Скачать файл"}
    </button>
  );
}
export function Media({ path, type }: { path: string; type: string }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let objectURL = "";
    void mediaBlob(path, controller.signal)
      .then((blob) => {
        objectURL = URL.createObjectURL(blob);
        setUrl(objectURL);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => {
      controller.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [path]);
  if (error) return <p className="muted">{error}</p>;
  if (!url) return <Loading />;
  return type === "video" ? (
    <video className="lesson-media" src={url} controls playsInline />
  ) : (
    <img className="lesson-media" src={url} alt="Материал урока" />
  );
}
export const textField: Field = {
  type: "string",
  minLength: 1,
  maxLength: 200,
};
export const intField: Field = { type: "integer", minimum: 1 };
