import { useState, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useCanvasStore } from "@/store";
import type { CanvasObject, StormConstraint } from "@/types";
import { ShieldAlert, X, Trash2, Code2, Sparkles } from "lucide-react";

interface ConstraintRulePopoverProps {
  card: CanvasObject;
  constraintId: string;
  onClose: () => void;
  anchorPosition: { x: number; y: number };
}

export function ConstraintRulePopover({
  card,
  constraintId,
  onClose,
  anchorPosition,
}: ConstraintRulePopoverProps) {
  const { t } = useTranslation();
  const updateStormConstraint = useCanvasStore((s) => s.updateStormConstraint);
  const deleteSelectedRow = useCanvasStore((s) => s.deleteSelectedRow);

  const popoverRef = useRef<HTMLDivElement>(null);
  const assertInputRef = useRef<HTMLInputElement>(null);

  const constraints = useMemo(() => {
    return card.stormData?.constraints ?? [];
  }, [card.stormData?.constraints]);

  const currentRule: StormConstraint | null = useMemo(() => {
    return constraints.find((c) => c.id === constraintId) ?? null;
  }, [constraints, constraintId]);

  const [text, setText] = useState(() => currentRule?.text ?? "");
  const [code, setCode] = useState(() => currentRule?.code ?? "");
  const [assertExpr, setAssertExpr] = useState(() => currentRule?.assert ?? "");
  const [message, setMessage] = useState(() => currentRule?.message ?? "");
  const [status, setStatus] = useState<number | undefined>(() => currentRule?.status);
  const [severity, setSeverity] = useState<"error" | "warning">(
    () => currentRule?.severity ?? "error",
  );

  useEffect(() => {
    if (currentRule) {
      setText(currentRule.text ?? "");
      setCode(currentRule.code ?? "");
      setAssertExpr(currentRule.assert ?? "");
      setMessage(currentRule.message ?? "");
      setStatus(currentRule.status);
      setSeverity(currentRule.severity ?? "error");
    }
  }, [currentRule]);

  // Click outside listener
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  // Available input params and output fields for quick tokens
  const inputParamNames = useMemo(() => {
    return (card.stormData?.inputFields ?? [])
      .map((f) => f.name.trim())
      .filter(Boolean);
  }, [card.stormData?.inputFields]);

  const outputFieldNames = useMemo(() => {
    return (card.stormData?.outputFields ?? [])
      .map((f) => f.name.trim())
      .filter(Boolean);
  }, [card.stormData?.outputFields]);


  const insertToken = (token: string) => {
    setAssertExpr((prev) => {
      if (!prev) return token;
      return `${prev} && ${token}`;
    });
    assertInputRef.current?.focus();
  };

  const handleApply = () => {
    if (!currentRule) return;
    updateStormConstraint(card.id, constraintId, {
      text: text.trim(),
      code: code.trim() || undefined,
      assert: assertExpr.trim() || undefined,
      message: message.trim() || undefined,
      status: status !== undefined && !Number.isNaN(status) ? status : undefined,
      severity,
    });
    onClose();
  };

  const handleDelete = () => {
    deleteSelectedRow(card.id, constraintId);
    onClose();
  };

  const presets = [
    {
      label: "Must Exist",
      code: "ENTITY_NOT_FOUND",
      assert: outputFieldNames[0]
        ? `"Fields"."${outputFieldNames[0]}" != null`
        : '"Fields"."ID" != null',
      status: 404,
    },
    {
      label: "Unique / Available",
      code: "ALREADY_EXISTS",
      assert: outputFieldNames[0]
        ? `"Fields"."${outputFieldNames[0]}" == null`
        : '"Fields"."ID" == null',
      status: 409,
    },
    {
      label: "Not Deleted",
      code: "ENTITY_DELETED",
      assert: '!"Fields"."Is Deleted"',
      status: 410,
    },
    {
      label: "Status Active",
      code: "INVALID_STATUS",
      assert: '"Fields"."Status" == "User Status"."ACTIVE"',
      status: 400,
    },
    {
      label: "Not Expired",
      code: "TOKEN_EXPIRED",
      assert: 'now() < "Fields"."Expires At"',
      status: 400,
    },
  ];

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 w-96 rounded-xl border border-gray-200 bg-white p-3.5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900"
      style={{
        left: `${Math.min(Math.max(10, anchorPosition.x), window.innerWidth - 400)}px`,
        top: `${Math.min(Math.max(10, anchorPosition.y), window.innerHeight - 560)}px`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 dark:border-zinc-800">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-teal-50 text-teal-600 dark:bg-teal-950/60 dark:text-teal-400">
            <ShieldAlert size={14} />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-800 dark:text-zinc-100">
              Constraint Rule (Codegen)
            </h3>
            <p className="text-[10px] text-gray-400 dark:text-zinc-500">
              Executable invariant assertion & error spec
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {/* Description / Text */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-700 dark:text-zinc-300">
            Rule Description
          </label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="e.g. User account must exist and not be deleted"
            className="w-full rounded-md border border-gray-200 bg-gray-50/70 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:border-teal-400 dark:focus:bg-zinc-800 dark:focus:ring-teal-400/20 transition-colors"
          />
        </div>

        {/* Assertion Expression (CEL / JS) */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="flex items-center gap-1 text-[11px] font-medium text-gray-700 dark:text-zinc-300">
              <Code2 size={12} className="text-teal-600 dark:text-teal-400" />
              Invariant Assertion (<code className="text-[10px] text-teal-700 dark:text-teal-300">assert</code>)
            </label>
            <span className="text-[10px] text-gray-400 dark:text-zinc-400">must evaluate to true</span>
          </div>
          <input
            ref={assertInputRef}
            type="text"
            value={assertExpr}
            onChange={(e) => setAssertExpr(e.target.value)}
            placeholder={`e.g. "Fields"."User ID" != null && !"Fields"."Is Deleted"`}
            className="w-full rounded-md border border-teal-300/80 bg-teal-50/30 px-2.5 py-1.5 font-mono text-xs text-teal-950 placeholder:text-teal-800/40 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/20 dark:border-teal-800 dark:bg-teal-950/30 dark:text-teal-100 dark:placeholder:text-teal-300/40 dark:focus:border-teal-400 dark:focus:bg-zinc-800 dark:focus:ring-teal-400/20 transition-colors"
          />
        </div>

        {/* Quick Insert Tokens */}
        {(inputParamNames.length > 0 || outputFieldNames.length > 0) && (
          <div>
            <div className="mb-1 text-[10px] font-medium text-gray-500 dark:text-zinc-400">
              Click to insert reference:
            </div>
            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {inputParamNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => insertToken(`"Params"."${name}"`)}
                  className="rounded bg-sky-50 px-1.5 py-0.5 font-mono text-[10px] text-sky-700 hover:bg-sky-100 dark:bg-sky-950/60 dark:text-sky-300 dark:hover:bg-sky-900/60 transition-colors cursor-pointer"
                  title={`Insert "Params"."${name}"`}
                >
                  "Params"."{name}"
                </button>
              ))}
              {outputFieldNames.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => insertToken(`"Fields"."${name}"`)}
                  className="rounded bg-purple-50 px-1.5 py-0.5 font-mono text-[10px] text-purple-700 hover:bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 dark:hover:bg-purple-900/60 transition-colors cursor-pointer"
                  title={`Insert "Fields"."${name}"`}
                >
                  "Fields"."{name}"
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Quick Presets */}
        <div>
          <div className="mb-1 flex items-center gap-1 text-[10px] font-medium text-gray-500 dark:text-zinc-400">
            <Sparkles size={11} className="text-amber-500" />
            Quick Presets
          </div>
          <div className="flex flex-wrap gap-1">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  setAssertExpr(p.assert);
                  if (!code) setCode(p.code);
                  if (!status) setStatus(p.status);
                }}
                className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] text-gray-700 hover:border-gray-300 hover:bg-gray-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Error Code & HTTP Status */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-700 dark:text-zinc-300">
              Error Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
              placeholder="e.g. USER_NOT_FOUND"
              className="w-full rounded-md border border-gray-200 bg-gray-50/70 px-2.5 py-1.5 font-mono text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:border-teal-400 dark:focus:bg-zinc-800 dark:focus:ring-teal-400/20 transition-colors"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-gray-700 dark:text-zinc-300">
              HTTP Status
            </label>
            <select
              value={status ?? ""}
              onChange={(e) => setStatus(e.target.value ? Number(e.target.value) : undefined)}
              className="w-full rounded-md border border-gray-200 bg-gray-50/70 px-2 py-1.5 text-xs text-gray-900 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100 dark:focus:border-teal-400 dark:focus:bg-zinc-800 dark:focus:ring-teal-400/20 transition-colors"
            >
              <option value="" className="dark:bg-zinc-800 dark:text-zinc-100">Default (400)</option>
              <option value="400" className="dark:bg-zinc-800 dark:text-zinc-100">400 Bad Request</option>
              <option value="401" className="dark:bg-zinc-800 dark:text-zinc-100">401 Unauthorized</option>
              <option value="403" className="dark:bg-zinc-800 dark:text-zinc-100">403 Forbidden</option>
              <option value="404" className="dark:bg-zinc-800 dark:text-zinc-100">404 Not Found</option>
              <option value="409" className="dark:bg-zinc-800 dark:text-zinc-100">409 Conflict</option>
              <option value="422" className="dark:bg-zinc-800 dark:text-zinc-100">422 Unprocessable</option>
              <option value="429" className="dark:bg-zinc-800 dark:text-zinc-100">429 Too Many Requests</option>
            </select>
          </div>
        </div>

        {/* Client Error Message */}
        <div>
          <label className="mb-1 block text-[11px] font-medium text-gray-700 dark:text-zinc-300">
            Error Message (Client Response)
          </label>
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. User account does not exist or has been deleted."
            className="w-full rounded-md border border-gray-200 bg-gray-50/70 px-2.5 py-1.5 text-xs text-gray-900 placeholder:text-gray-400 outline-none focus:border-teal-500 focus:bg-white focus:ring-1 focus:ring-teal-500/20 dark:border-zinc-700 dark:bg-zinc-800/70 dark:text-zinc-100 dark:placeholder:text-zinc-400 dark:focus:border-teal-400 dark:focus:bg-zinc-800 dark:focus:ring-teal-400/20 transition-colors"
          />
        </div>

        {/* Severity */}
        <div className="flex items-center gap-4 text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-zinc-300">
            <input
              type="radio"
              name="severity"
              checked={severity === "error"}
              onChange={() => setSeverity("error")}
              className="accent-teal-600"
            />
            <span>Error (Rejects Command)</span>
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer text-gray-700 dark:text-zinc-300">
            <input
              type="radio"
              name="severity"
              checked={severity === "warning"}
              onChange={() => setSeverity("warning")}
              className="accent-teal-600"
            />
            <span>Warning</span>
          </label>
        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-2.5 dark:border-zinc-800">
          <button
            type="button"
            onClick={handleDelete}
            title="Delete this constraint rule"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-900 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 size={13} />
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:text-zinc-300 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="rounded-lg bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700 transition-colors"
            >
              {t("common.apply")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
