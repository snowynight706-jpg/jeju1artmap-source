"use client";

import { type ReactNode, type Ref, useState } from "react";

type AdminFolderProps = {
  title: string;
  children: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  sectionRef?: Ref<HTMLElement>;
  "aria-label"?: string;
  openSignal?: number;
};

const adminFolderScrollFrames = new WeakMap<HTMLElement, number>();

function findScrollableAdminAncestor(element: HTMLElement) {
  let ancestor = element.parentElement;
  while (ancestor) {
    const { overflowY } = window.getComputedStyle(ancestor);
    if (/(auto|scroll)/.test(overflowY) && ancestor.scrollHeight > ancestor.clientHeight + 1) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

function slowlyRevealAdminFolder(folder: HTMLElement) {
  const scroller = findScrollableAdminAncestor(folder);
  if (!scroller) {
    folder.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    return;
  }

  const scrollerRect = scroller.getBoundingClientRect();
  const folderRect = folder.getBoundingClientRect();
  const breathingRoom = 12;
  const topOverflow = folderRect.top - scrollerRect.top - breathingRoom;
  const bottomOverflow = folderRect.bottom - scrollerRect.bottom + breathingRoom;
  const offset = topOverflow < 0 ? topOverflow : bottomOverflow > 0 ? bottomOverflow : 0;
  if (Math.abs(offset) < 1) return;

  const start = scroller.scrollTop;
  const target = Math.min(
    Math.max(0, scroller.scrollHeight - scroller.clientHeight),
    Math.max(0, start + offset),
  );
  const distance = target - start;
  if (Math.abs(distance) < 1) return;

  const previousFrame = adminFolderScrollFrames.get(scroller);
  if (previousFrame !== undefined) window.cancelAnimationFrame(previousFrame);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    scroller.scrollTop = target;
    adminFolderScrollFrames.delete(scroller);
    return;
  }

  const duration = Math.min(760, Math.max(480, Math.abs(distance) * 1.35));
  const startedAt = window.performance.now();
  const animate = (now: number) => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    scroller.scrollTop = start + distance * eased;
    if (progress < 1) {
      adminFolderScrollFrames.set(scroller, window.requestAnimationFrame(animate));
    } else {
      adminFolderScrollFrames.delete(scroller);
    }
  };

  adminFolderScrollFrames.set(scroller, window.requestAnimationFrame(animate));
}

export default function AdminFolder({
  title,
  children,
  meta,
  actions,
  className = "",
  defaultOpen = false,
  sectionRef,
  "aria-label": ariaLabel,
  openSignal = 0,
}: AdminFolderProps) {
  const [folderState, setFolderState] = useState({ open: defaultOpen, signal: openSignal });
  const open = openSignal > folderState.signal ? true : folderState.open;

  return (
    <section ref={sectionRef} className={`admin-folder ${open ? "open" : "closed"} ${className}`.trim()} aria-label={ariaLabel}>
      <div className="admin-folder-head">
        <button
          type="button"
          className="admin-folder-toggle"
          aria-expanded={open}
          onClick={(event) => {
            const nextOpen = !open;
            const folder = event.currentTarget.closest(".admin-folder");
            setFolderState({ open: nextOpen, signal: openSignal });
            if (nextOpen && folder instanceof HTMLElement) {
              requestAnimationFrame(() => requestAnimationFrame(() => slowlyRevealAdminFolder(folder)));
            }
          }}
        >
          <span className="admin-folder-arrow" aria-hidden="true" />
          <strong>{title}</strong>
        </button>
        {meta !== undefined && <span className="admin-folder-meta">{meta}</span>}
        {actions !== undefined && <div className="admin-folder-actions">{actions}</div>}
      </div>
      <div className="admin-folder-body" hidden={!open}>{children}</div>
    </section>
  );
}
