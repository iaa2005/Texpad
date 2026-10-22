import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { LineSquiggle } from "lucide-react";
import SfIcon from "./SfIcon";
import {
  PINNED_LIMIT,
  SYMBOL_GROUPS,
  findSymbol,
  pinnedSymbols,
  recentSymbols,
  rememberSymbol,
  searchSymbols,
  symbolLabel,
  togglePinnedSymbol,
  type SymbolEntry,
  type SymbolGroup,
} from "../lib/symbols";
import { matchSketch, type Stroke } from "../lib/symbolSketch";
import { t } from "../i18n";

const HEADER_HEIGHT = 30;
const SEARCH_HEIGHT = 46;

function SymbolCell({
  entry,
  pinIndex,
  onInsert,
  onTogglePin,
}: {
  entry: SymbolEntry;
  pinIndex: number;
  onInsert: (command: string) => void;
  onTogglePin: (command: string) => void;
}) {
  const [glyph, command] = entry;
  return (
    <button
      className={`symbol-cell${pinIndex >= 0 ? " is-pinned" : ""}`}
      title={`${command}\n${pinIndex >= 0 ? t("Right-click to unpin") : t("Right-click to pin")}`}
      onClick={() => onInsert(command)}
      onContextMenu={(event) => {
        event.preventDefault();
        onTogglePin(command);
      }}
    >
      {pinIndex >= 0 && <span className="symbol-pin">{t("Alt+")}{pinIndex + 1}</span>}
      <span className="symbol-glyph">{glyph}</span>
      <span className="symbol-code">{symbolLabel(command)}</span>
    </button>
  );
}

/** Freehand canvas; reports strokes in canvas pixels after each stroke. */
function SketchPad({ onChange }: { onChange: (strokes: Stroke[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef(false);
  const [empty, setEmpty] = useState(true);

  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = getComputedStyle(canvas).color;
    for (const stroke of strokesRef.current) {
      ctx.beginPath();
      stroke.forEach((point, index) =>
        index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y),
      );
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y);
      ctx.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    redraw();
  }, []);

  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  return (
    <div className="sketch-pad">
      <canvas
        ref={canvasRef}
        className="sketch-canvas"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drawingRef.current = true;
          setEmpty(false);
          strokesRef.current.push([point(event)]);
          redraw();
        }}
        onPointerMove={(event) => {
          if (!drawingRef.current) return;
          strokesRef.current[strokesRef.current.length - 1].push(point(event));
          redraw();
        }}
        onPointerUp={() => {
          if (!drawingRef.current) return;
          drawingRef.current = false;
          onChange([...strokesRef.current]);
        }}
      />
      {empty && <span className="sketch-hint">{t("Draw a symbol here")}</span>}
      <button
        className="sketch-clear"
        onClick={() => {
          strokesRef.current = [];
          setEmpty(true);
          redraw();
          onChange([]);
        }}
      >
        {t("Clear")}
      </button>
    </div>
  );
}

/**
 * The √x panel: Texpad's stacked symbol groups, with latexted's search,
 * recently used and pinned symbols, and search by drawing.
 */
export default function SymbolTable({
  onInsert,
  initialDraw = false,
  style,
}: {
  onInsert: (command: string) => void;
  initialDraw?: boolean;
  style?: CSSProperties;
}) {
  const [query, setQuery] = useState("");
  const [drawing, setDrawing] = useState(initialDraw);
  const [sketchResults, setSketchResults] = useState<SymbolEntry[]>([]);
  const [pinned, setPinned] = useState<string[]>(() => pinnedSymbols());
  const [recent] = useState<string[]>(() => recentSymbols());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!initialDraw) searchRef.current?.focus();
  }, [initialDraw]);

  const insert = (command: string) => {
    rememberSymbol(command);
    onInsert(command);
  };
  const togglePin = (command: string) => setPinned(togglePinnedSymbol(command));

  const groups = useMemo<SymbolGroup[]>(() => {
    const toEntries = (commands: string[]) =>
      commands.map(findSymbol).filter((entry): entry is SymbolEntry => Boolean(entry));
    const extra: SymbolGroup[] = [];
    if (pinned.length) extra.push({ title: t("Pinned · Alt+1…{n}", { n: Math.min(pinned.length, PINNED_LIMIT) }), items: toEntries(pinned) });
    if (recent.length) extra.push({ title: t("Recently used"), items: toEntries(recent) });
    return [...extra, ...SYMBOL_GROUPS];
  }, [pinned, recent]);

  const results = query.trim() ? searchSymbols(query) : null;
  const cell = (entry: SymbolEntry) => (
    <SymbolCell
      key={entry[1]}
      entry={entry}
      pinIndex={pinned.indexOf(entry[1])}
      onInsert={insert}
      onTogglePin={togglePin}
    />
  );

  return (
    <div className="editor-popover symbols-popover" ref={scrollRef} style={style}>
      <div className="symbol-search-bar">
        <label className="symbol-search">
          <SfIcon name="magnifyingglass" size={13} />
          <input
            ref={searchRef}
            value={query}
            placeholder={t("Search symbols")}
            spellCheck={false}
            onChange={(event) => {
              setQuery(event.target.value);
              setDrawing(false);
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} title={t("Clear")}>
              <SfIcon name="xmark.circle" size={13} />
            </button>
          )}
        </label>
        <button
          className={`symbol-draw-toggle${drawing ? " is-active" : ""}`}
          onClick={() => {
            setDrawing((value) => !value);
            setQuery("");
            setSketchResults([]);
          }}
          title={t("Find a symbol by drawing it")}
        >
          <LineSquiggle size={15} strokeWidth={1.7} />
          <span>{t("Draw")}</span>
        </button>
      </div>

      {drawing ? (
        <div className="symbol-sketch">
          <SketchPad onChange={(strokes) => setSketchResults(strokes.length ? matchSketch(strokes) : [])} />
          <div className="symbol-sketch-results">
            {sketchResults.length ? (
              <div className="symbol-grid is-compact">{sketchResults.map(cell)}</div>
            ) : (
              <span className="symbol-empty">{t("Matches appear as you draw.")}</span>
            )}
          </div>
        </div>
      ) : results ? (
        results.length ? (
          <div className="symbol-grid">{results.map(cell)}</div>
        ) : (
          <span className="symbol-empty">{t("No symbols match “{q}”.", { q: query })}</span>
        )
      ) : (
        // All groups share one scroller and their headers are sticky at a
        // fixed slot, so the grey bars pile up at the top and bottom like
        // Texpad's stacked groups while the grids scroll past.
        groups.map((group, index) => (
          <Fragment key={group.title}>
            <button
              className="symbol-group-header"
              style={{
                top: SEARCH_HEIGHT + index * HEADER_HEIGHT,
                bottom: (groups.length - 1 - index) * HEADER_HEIGHT,
              }}
              onClick={(event) => {
                // A stuck header reports its stuck position, so measure from
                // the grid that follows it instead.
                const grid = event.currentTarget.nextElementSibling as HTMLElement | null;
                if (!scrollRef.current || !grid) return;
                scrollRef.current.scrollTo({
                  top: grid.offsetTop - SEARCH_HEIGHT - (index + 1) * HEADER_HEIGHT,
                  behavior: "smooth",
                });
              }}
            >
              {t(group.title)}
            </button>
            <div className="symbol-grid">{group.items.map(cell)}</div>
          </Fragment>
        ))
      )}
    </div>
  );
}
