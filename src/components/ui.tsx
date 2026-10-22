"use client";

import { Dialog, Select, Tooltip, ScrollArea, Popover } from "radix-ui";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

export function Scroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ScrollArea.Root className={`scroll-root ${className}`}>
      <ScrollArea.Viewport className="scroll-viewport">
        {children}
      </ScrollArea.Viewport>
      <ScrollArea.Scrollbar orientation="vertical" className="scrollbar">
        <ScrollArea.Thumb className="scroll-thumb" />
      </ScrollArea.Scrollbar>
      <ScrollArea.Scrollbar
        orientation="horizontal"
        className="scrollbar horizontal"
      >
        <ScrollArea.Thumb className="scroll-thumb" />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner />
    </ScrollArea.Root>
  );
}
export function Tip({
  children,
  label,
}: {
  children?: ReactNode;
  label: string;
}) {
  return (
    <Tooltip.Root delayDuration={200}>
      <Tooltip.Trigger asChild>
        {children || (
          <button
            type="button"
            className="icon-button info-button"
            aria-label={label}
          >
            <Info size={16} />
          </button>
        )}
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content sideOffset={7} className="tooltip">
          {label}
          <Tooltip.Arrow className="tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function Dropdown({
  value,
  onChange,
  options,
  label,
  className = "",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: (string | { value: string; label: string })[];
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange} disabled={disabled}>
      <Select.Trigger
        aria-label={label}
        className={`select-trigger ${className}`}
      >
        <Select.Value />
        <Select.Icon>
          <ChevronDown size={16} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="select-content"
        >
          <Select.ScrollUpButton className="select-scroll">
            <ChevronDown size={16} className="rotate" />
          </Select.ScrollUpButton>
          <Select.Viewport>
            {options.map((option) => {
              const item =
                typeof option === "string"
                  ? { value: option, label: option }
                  : option;
              return (
                <Select.Item
                  key={item.value}
                  value={item.value}
                  className="select-item"
                >
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator>
                    <Check size={16} />
                  </Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Viewport>
          <Select.ScrollDownButton className="select-scroll">
            <ChevronDown size={16} />
          </Select.ScrollDownButton>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal-content ${wide ? "wide" : ""}`}
          {...(!description ? { "aria-describedby": undefined } : {})}
        >
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              {description && (
                <Dialog.Description>{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button className="icon-button" aria-label="关闭弹窗">
                <X size={21} />
              </button>
            </Dialog.Close>
          </div>
          <Scroll className="modal-scroll">{children}</Scroll>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">
        <span>{label}</span>
        {hint && <span className="muted">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
export function Calendar({
  value,
  onChange,
  label = "选择日期",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = value ? new Date(value + "T12:00:00") : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const start = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  function select(day: number) {
    onChange(
      `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    );
    setOpen(false);
  }
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button type="button" className="date-trigger" aria-label={label}>
          {value || label}
          <ChevronDown size={16} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="calendar" sideOffset={6}>
          <div className="calendar-heading">
            <button
              type="button"
              className="icon-button"
              aria-label="上个月"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
              }
            >
              <ChevronLeft size={18} />
            </button>
            <strong>
              {month.getFullYear()}年{month.getMonth() + 1}月
            </strong>
            <button
              type="button"
              className="icon-button"
              aria-label="下个月"
              onClick={() =>
                setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
              }
            >
              <ChevronRight size={18} />
            </button>
          </div>
          <div className="calendar-grid">
            {"日一二三四五六".split("").map((d) => (
              <span className="muted" key={d}>
                {d}
              </span>
            ))}
            {Array.from({ length: start }, (_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => (
              <button
                type="button"
                key={i}
                className={
                  value ===
                  `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`
                    ? "selected"
                    : ""
                }
                onClick={() => select(i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            清除日期
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      {text.split("\n").map((line, index) => {
        const value = line.replace(/\*\*(.*?)\*\*/g, "$1");
        if (/^#{1,2}\s/.test(line))
          return <h3 key={index}>{value.replace(/^#+\s/, "")}</h3>;
        if (/^#{3,6}\s/.test(line))
          return <h4 key={index}>{value.replace(/^#+\s/, "")}</h4>;
        if (/^[-*]\s/.test(line))
          return (
            <div className="markdown-bullet" key={index}>
              <span>•</span>
              <span>{value.slice(2)}</span>
            </div>
          );
        if (/^---+$/.test(line)) return <hr key={index} />;
        return line.trim() ? (
          <p key={index}>{value}</p>
        ) : (
          <div className="paragraph-gap" key={index} />
        );
      })}
    </div>
  );
}
