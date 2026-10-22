import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import SfIcon from "../SfIcon";
import { countOutline, outlineBadge } from "../../lib/texParser";
import { useAppStore } from "../../store/useAppStore";
import type { FloatItem, LabelInfo, OutlineNode } from "../../types";
import { t } from "../../i18n";

interface FlatRow {
  node: OutlineNode;
  depth: number;
}

function filterTree(nodes: OutlineNode[], query: string): OutlineNode[] {
  if (!query) return nodes;
  const lower = query.toLowerCase();
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, query);
    if (node.title.toLowerCase().includes(lower) || children.length) {
      return [{ ...node, children }];
    }
    return [];
  });
}

function flatten(
  nodes: OutlineNode[],
  collapsed: Set<string>,
  depth: number,
  forceExpand: boolean,
  out: FlatRow[],
) {
  for (const node of nodes) {
    out.push({ node, depth });
    if (node.children.length && (forceExpand || !collapsed.has(node.id))) {
      flatten(node.children, collapsed, depth + 1, forceExpand, out);
    }
  }
}

function GroupHeader({
  open,
  onToggle,
  icon,
  title,
  count,
}: {
  open: boolean;
  onToggle: () => void;
  icon: ReactNode;
  title: string;
  count: number;
}) {
  return (
    <button className="group-row" onClick={onToggle}>
      <SfIcon name="chevron.right" size={12} className={`group-chevron${open ? " is-open" : ""}`} />
      <span className="group-icon">{icon}</span>
      <span className="group-title">{title}</span>
      <span className="group-count">{count}</span>
    </button>
  );
}

function FloatRows({
  items,
  label,
  badgeClass,
  onJump,
}: {
  items: FloatItem[];
  label: string;
  badgeClass: string;
  onJump: (file: string, line: number) => void;
}) {
  if (!items.length) {
    return <div className="group-empty">{t("Nothing here yet")}</div>;
  }
  return (
    <>
      {items.map((item) => (
        <button
          key={`${item.kind}:${item.file}:${item.line}`}
          className="outline-row group-item"
          title={item.title}
          onClick={() => onJump(item.file, item.line)}
        >
          <span className={`outline-badge ${badgeClass}`}>{label[0]}</span>
          <span className="outline-title">{item.title}</span>
        </button>
      ))}
    </>
  );
}

function LabelRows({
  labels,
  onJump,
}: {
  labels: LabelInfo[];
  onJump: (file: string, line: number) => void;
}) {
  if (!labels.length) return <div className="group-empty">{t("No labels yet")}</div>;
  return (
    <>
      {labels.map((label) => (
        <button
          key={`${label.file}:${label.line}:${label.name}`}
          className="outline-row group-item"
          title={`${label.name} — ${label.context}`}
          onClick={() => onJump(label.file, label.line)}
        >
          <span className="outline-badge badge-label">L</span>
          <span className="outline-title">{label.name}</span>
          <span className="outline-context">{label.context}</span>
        </button>
      ))}
    </>
  );
}

export default function OutlineView() {
  const outline = useAppStore((state) => state.outline);
  const floats = useAppStore((state) => state.floats);
  const labels = useAppStore((state) => state.labels);
  const metadata = useAppStore((state) => state.metadata);
  const jumpTo = useAppStore((state) => state.jumpTo);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(true);
  const [openGroups, setOpenGroups] = useState({
    figures: false,
    tables: false,
    labels: false,
    metadata: false,
  });
  const [visibleGroups, setVisibleGroups] = useState({
    figures: true,
    tables: true,
    labels: true,
    metadata: true,
  });
  const [filter, setFilter] = useState("");
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!filterMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!filterMenuRef.current?.contains(event.target as Node)) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [filterMenuOpen]);

  const query = filter.trim().toLowerCase();
  const filteredOutline = useMemo(() => filterTree(outline, query), [outline, query]);
  const rows = useMemo(() => {
    const out: FlatRow[] = [];
    flatten(filteredOutline, collapsed, 0, Boolean(query), out);
    return out;
  }, [filteredOutline, collapsed, query]);

  const figures = floats.filter(
    (item) =>
      item.kind === "figure" &&
      (!query || item.title.toLowerCase().includes(query)),
  );
  const tables = floats.filter(
    (item) =>
      item.kind === "table" && (!query || item.title.toLowerCase().includes(query)),
  );
  const filteredLabels = labels.filter(
    (label) =>
      !query ||
      label.name.toLowerCase().includes(query) ||
      label.context.toLowerCase().includes(query),
  );

  const metadataFields = [
    metadata?.documentClass
      ? { label: t("Class"), value: metadata.documentClass }
      : null,
    metadata?.title ? { label: t("Title"), value: metadata.title } : null,
    metadata?.author ? { label: t("Author"), value: metadata.author } : null,
    metadata?.date ? { label: t("Date"), value: metadata.date } : null,
    metadata ? { label: t("Packages"), value: String(metadata.packages) } : null,
    metadata ? { label: t("Words"), value: metadata.words.toLocaleString() } : null,
  ].filter((value): value is { label: string; value: string } => Boolean(value));

  const toggleNode = (id: string) => {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleJump = (file: string, line: number) => {
    void jumpTo(file, line);
  };

  const total = countOutline(outline);
  const hasContent =
    outline.length > 0 || figures.length > 0 || tables.length > 0 || labels.length > 0;

  return (
    <div className="structure-panel">
      <div className="structure-scroll">
        <button className="group-row toc-row" onClick={() => setTocOpen((open) => !open)}>
          <SfIcon name="chevron.right" size={12} className={`group-chevron${tocOpen ? " is-open" : ""}`} />
          <span className="group-icon">
            <SfIcon name="list.bullet.rectangle" size={14} />
          </span>
          <span className="group-title">{t("Table of Contents")}</span>
          <span className="group-count">{total}</span>
        </button>

        {tocOpen && (
          <>
            {rows.length === 0 ? (
              <div className="outline-empty">
                {query ? (
                  <>
                    <SfIcon name="xmark.circle" size={17} />
                    <span>{t("No matches")}</span>
                  </>
                ) : (
                  <>
                    <SfIcon name="list.bullet.rectangle" size={17} />
                    <span>{t("No headings yet")}</span>
                  </>
                )}
              </div>
            ) : (
              rows.map(({ node, depth }) => (
                <button
                  key={node.id}
                  className={`outline-row${selectedId === node.id ? " is-selected" : ""}`}
                  style={{ paddingLeft: `${10 + depth * 15}px` }}
                  title={`${node.title} — ${node.file}:${node.line}`}
                  onClick={() => {
                    setSelectedId(node.id);
                    handleJump(node.file, node.line);
                  }}
                >
                  {node.children.length ? (
                    <span
                      className="tree-chevron"
                      role="button"
                      tabIndex={-1}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleNode(node.id);
                      }}
                    >
                      <SfIcon
                        name="chevron.right"
                        size={12}
                        className={collapsed.has(node.id) ? "" : "is-open"}
                      />
                    </span>
                  ) : (
                    <span className="tree-chevron-placeholder" />
                  )}
                  <span className={`outline-badge badge-${node.kind}`}>
                    {node.kind === "document" ? (
                      <SfIcon name="hourglass" size={11} />
                    ) : (
                      outlineBadge(node.kind)
                    )}
                  </span>
                  <span className="outline-title">
                    {node.kind === "document" ? t(node.title) : node.title}
                  </span>
                </button>
              ))
            )}

            {visibleGroups.figures && (
              <>
                <GroupHeader
                  open={openGroups.figures}
                  onToggle={() =>
                    setOpenGroups((groups) => ({
                      ...groups,
                      figures: !groups.figures,
                    }))
                  }
                  icon={<span className="plain-badge">F</span>}
                  title={t("Figures")}
                  count={figures.length}
                />
                {openGroups.figures && (
                  <FloatRows
                    items={figures}
                    label={t("Figures")}
                    badgeClass="badge-figure"
                    onJump={handleJump}
                  />
                )}
              </>
            )}

            {visibleGroups.tables && (
              <>
                <GroupHeader
                  open={openGroups.tables}
                  onToggle={() =>
                    setOpenGroups((groups) => ({
                      ...groups,
                      tables: !groups.tables,
                    }))
                  }
                  icon={<span className="plain-badge">T</span>}
                  title={t("Tables")}
                  count={tables.length}
                />
                {openGroups.tables && (
                  <FloatRows
                    items={tables}
                    label={t("Tables")}
                    badgeClass="badge-table"
                    onJump={handleJump}
                  />
                )}
              </>
            )}

            {visibleGroups.labels && (
              <>
                <GroupHeader
                  open={openGroups.labels}
                  onToggle={() =>
                    setOpenGroups((groups) => ({
                      ...groups,
                      labels: !groups.labels,
                    }))
                  }
                  icon={<span className="plain-badge">L</span>}
                  title={t("Labels")}
                  count={filteredLabels.length}
                />
                {openGroups.labels && (
                  <LabelRows labels={filteredLabels} onJump={handleJump} />
                )}
              </>
            )}

            {visibleGroups.metadata && (
              <>
                <GroupHeader
                  open={openGroups.metadata}
                  onToggle={() =>
                    setOpenGroups((groups) => ({
                      ...groups,
                      metadata: !groups.metadata,
                    }))
                  }
                  icon={<SfIcon name="info.circle" size={13} />}
                  title={t("Metadata")}
                  count={metadataFields.length}
                />
                {openGroups.metadata &&
                  (metadataFields.length ? (
                    <div className="metadata-list">
                      {metadataFields.map((field) => (
                        <div className="metadata-row" key={field.label}>
                          <span className="metadata-label">{field.label}</span>
                          <span className="metadata-value" title={field.value}>
                            {field.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="group-empty">{t("No metadata yet")}</div>
                  ))}
              </>
            )}
          </>
        )}

        {!tocOpen && !hasContent && (
          <div className="outline-empty">
            <SfIcon name="list.bullet.rectangle" size={17} />
            <span>{t("No headings yet")}</span>
          </div>
        )}
      </div>

      <div className="filter-bar">
        <SfIcon name="magnifyingglass" size={14} />
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("Filter")}
          spellCheck={false}
        />
        {query && <span className="filter-count">{rows.length}</span>}
        {filter && (
          <button className="filter-clear" onClick={() => setFilter("")} title={t("Clear filter")}>
            ×
          </button>
        )}
        <div className="filter-menu-wrap" ref={filterMenuRef}>
          <button
            className={`filter-gear${filterMenuOpen ? " is-active" : ""}`}
            title={t("Structure filters")}
            onClick={() => setFilterMenuOpen((open) => !open)}
          >
            <SfIcon name="gearshape" size={13} />
          </button>
          {filterMenuOpen && (
            <div className="filter-menu">
              {(["figures", "tables", "labels", "metadata"] as const).map((key) => (
                <label className="filter-menu-row" key={key}>
                  <input
                    type="checkbox"
                    checked={visibleGroups[key]}
                    onChange={() =>
                      setVisibleGroups((groups) => ({
                        ...groups,
                        [key]: !groups[key],
                      }))
                    }
                  />
                  <span>{key[0].toUpperCase() + key.slice(1)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
