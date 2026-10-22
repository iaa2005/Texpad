import { useEffect, useState, type RefObject } from "react";

/**
 * Watches an element's width and returns the class names whose threshold it
 * is narrower than, e.g. `[[600, "is-compact"], [480, "is-narrow"]]` gives
 * "is-compact is-narrow" at 450px. Toolbars use it to fold buttons into
 * their overflow menu when a pane or the window gets narrow.
 *
 * (CSS container queries would do the same, but a size container becomes
 * the containing block of `position: fixed` popovers inside it.)
 */
export function useWidthClasses(
  ref: RefObject<HTMLElement | null>,
  steps: Array<[maxWidth: number, className: string]>,
): string {
  const [classes, setClasses] = useState("");
  const key = steps.map(([width, name]) => `${width}:${name}`).join(",");

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const width = element.getBoundingClientRect().width;
      const next = steps
        .filter(([maxWidth]) => width < maxWidth)
        .map(([, name]) => name)
        .join(" ");
      setClasses((current) => (current === next ? current : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, key]);

  return classes;
}
