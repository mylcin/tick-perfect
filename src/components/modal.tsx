import { useEffect, useRef, useState, type ReactNode } from 'react';

import { hostAnnouncements } from '../utils/announcer';

/** How long a closing dialog takes to fade out (duration-200, below). */
const CLOSE_MS = 200;

/**
 * A native modal dialog laid over the whole screen. The browser keeps focus
 * inside and makes the page behind it inert. Focus starts on the element
 * marked `data-autofocus` and returns to where it was when the dialog
 * closes. The page's live regions move in while it is open, so what is
 * announced meanwhile is still heard.
 *
 * Escape (and Android's Back) calls `onCancel`, which must leave the dialog
 * somewhere useful: browsers only let a page refuse a few of these in a row,
 * then close the dialog anyway.
 *
 * Closing hands the page back at once, but the dialog fades out instead of
 * vanishing: its contents stay a moment longer, inert, as it goes (marked
 * `data-closing`). Its contents mount as it opens and unmount once it has
 * gone.
 */
export function Modal({
  open,
  labelledBy,
  describedBy,
  onCancel,
  testId,
  className = '',
  children,
}: {
  open: boolean;
  labelledBy: string;
  describedBy?: string;
  onCancel: () => void;
  testId?: string;
  className?: string;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  // Still on screen: open, or fading out.
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;
  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => {
      setShown(false);
    }, CLOSE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [closing]);

  useEffect(() => {
    const element = dialog.current;
    if (!element || !open) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    element.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const release = hostAnnouncements(element);
    return () => {
      release();
      element.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      data-testid={testId}
      {...(closing && { 'data-closing': true })}
      inert={closing}
      onKeyDown={event => {
        // A held Escape would otherwise cancel again on every repeat.
        if (event.key === 'Escape' && event.repeat) event.preventDefault();
      }}
      onCancel={event => {
        event.preventDefault();
        onCancel();
      }}
      // A closed dialog stays drawn (in the top layer) while it fades.
      className={`fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-transparent p-0 text-inherit transition-[opacity,display,overlay] transition-discrete duration-200 ease-out not-open:pointer-events-none not-open:opacity-0 backdrop:bg-transparent ${className}`}
    >
      {shown && children}
    </dialog>
  );
}
