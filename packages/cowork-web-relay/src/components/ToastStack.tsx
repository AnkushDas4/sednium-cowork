import React from 'react';
import { AtSign, CircleAlert, GitCommit, MessageSquare, MessageSquareText, Radio, Users, X, CheckCheck } from 'lucide-react';
import type { NotifyKind, RoomNotification } from '../notifications.js';

const ICON: Record<NotifyKind, typeof AtSign> = {
  mention: AtSign,
  prompt: MessageSquareText,
  dm: MessageSquare,
  push: GitCommit,
  attention: CircleAlert,
  done: CheckCheck,
  joined: Users,
  left: Radio,
};

/** High-severity banners wear the accent edge; everything else stays quiet. */
const edge = (n: RoomNotification): string =>
  n.severity === 'high' ? 'border-l-2 border-l-accent' : 'border-l-2 border-l-grid';

interface ToastStackProps {
  toasts: RoomNotification[];
  onDismiss: (id: string) => void;
  /** Opens the notification centre so "where did that come from?" is one tap away. */
  onOpen?: () => void;
}

/**
 * In-room banners. They deliberately sit above everything except modals, are dismissed by a click,
 * and are never a second copy of the stream - each one is a pointer at a message or an agent.
 */
export const ToastStack: React.FC<ToastStackProps> = ({ toasts, onDismiss, onOpen }) => {
  if (!toasts.length) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Room notifications"
      data-id="toast-stack"
      className="pointer-events-none fixed inset-x-2 top-14 z-50 flex flex-col gap-2 xs:inset-x-auto xs:right-3 xs:top-16 xs:w-[21rem] sm:w-[23rem]"
    >
      {toasts.map((n) => {
        const Icon = ICON[n.kind] ?? CircleAlert;
        return (
          <div
            key={n.id}
            className={`notify-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-grid bg-panel px-3 py-2.5 shadow-float ${edge(n)}`}
          >
            <Icon
              className={`mt-0.5 w-4 h-4 shrink-0 ${n.severity === 'high' ? 'text-accent' : 'text-muted'}`}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onOpen?.()}
                className="block w-full text-left"
                title="Open notifications"
              >
                <span className="block truncate text-xs font-sans font-semibold text-primary">{n.title}</span>
                {n.body && <span className="mt-0.5 block text-2xs font-sans text-secondary break-words">{n.body}</span>}
                {n.files && n.files.length > 0 && (
                  <span className="mt-1 block truncate font-mono text-2xs text-muted">
                    {n.files.slice(0, 3).join(', ')}
                    {n.files.length > 3 ? ` +${n.files.length - 3}` : ''}
                  </span>
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(n.id)}
              aria-label="Dismiss this notification"
              className="-mr-1 shrink-0 rounded-sm p-1 text-muted hover:bg-hover hover:text-primary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
