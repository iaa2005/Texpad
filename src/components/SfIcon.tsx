import type { CSSProperties } from "react";

interface SfIconProps {
  name: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Renders an SF Symbols glyph as a monochrome mask, so it inherits
 * the current text colour like a native symbol.
 */
export default function SfIcon({
  name,
  size = 16,
  className = "",
  style,
}: SfIconProps) {
  const mask = `url("/sfsymbols/${name}.svg")`;
  const renderedSize = Math.round(size * 1.08);
  return (
    <span
      aria-hidden="true"
      className={`sf-icon ${className}`}
      style={{
        width: renderedSize,
        height: renderedSize,
        WebkitMaskImage: mask,
        maskImage: mask,
        ...style,
      }}
    />
  );
}
