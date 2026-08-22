import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const VIEWPORT_MARGIN = 8;
const TRIGGER_GAP = 6;

export function ActionMenu({ anchorRef, onClose, children }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0, visible: false });

  const placeMenu = useCallback(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const trigger = anchor.getBoundingClientRect();
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;
    const spaceBelow = window.innerHeight - trigger.bottom - TRIGGER_GAP;
    const spaceAbove = trigger.top - TRIGGER_GAP;
    const openUpward = spaceBelow < menuHeight && spaceAbove > spaceBelow;
    const preferredTop = openUpward ? trigger.top - menuHeight - TRIGGER_GAP : trigger.bottom + TRIGGER_GAP;
    const top = Math.max(VIEWPORT_MARGIN, Math.min(preferredTop, window.innerHeight - menuHeight - VIEWPORT_MARGIN));
    const left = Math.max(VIEWPORT_MARGIN, Math.min(trigger.right - menuWidth, window.innerWidth - menuWidth - VIEWPORT_MARGIN));
    setPosition({ left, top, visible: true });
  }, [anchorRef]);

  useLayoutEffect(() => {
    placeMenu();

    function closeFromOutside(event) {
      if (menuRef.current?.contains(event.target) || anchorRef.current?.contains(event.target)) return;
      onClose();
    }
    function closeFromKeyboard(event) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("pointerdown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", onClose, true);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [anchorRef, onClose, placeMenu]);

  return createPortal(
    <div
      ref={menuRef}
      className="fixed z-[100] w-44 rounded-lg border border-slate-700 bg-slate-950 p-1 shadow-2xl"
      data-menu-root
      role="menu"
      style={{ left: position.left, top: position.top, visibility: position.visible ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body
  );
}
