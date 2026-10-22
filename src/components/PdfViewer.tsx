import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentProxy,
  type PDFPageProxy,
  type RenderTask,
} from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import SfIcon from "./SfIcon";
import { useWidthClasses } from "../lib/useWidthClasses";
import { openExternal, openUrl, printPdf } from "../lib/tauri";
import { readBinaryFile } from "../lib/tauri";
import { t } from "../i18n";
import { plural } from "../i18n";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PdfViewerProps {
  pdfPath: string | null;
  pdfVersion: number;
  dark: boolean;
  grading: "all" | "no-images" | "off";
  onToggleDark: () => void;
  onTypeset: () => void;
  onInverseSync: (page: number, x: number, y: number) => void;
  onScrollSync: (page: number, x: number, y: number) => void;
  scrollLock: boolean;
  onToggleScrollLock: () => void;
  syncTarget: { page: number; x: number; y: number; nonce: number } | null;
}

interface PageSize {
  width: number;
  height: number;
}

interface PdfLinkBox {
  left: number;
  top: number;
  width: number;
  height: number;
  url?: string;
  dest?: string | unknown[];
}

interface PdfLinkAnnotation {
  subtype?: string;
  rect?: number[];
  url?: string | null;
  dest?: string | unknown[] | null;
}

const DEFAULT_PAGE: PageSize = { width: 612, height: 792 };

function PdfPage({
  doc,
  pageNumber,
  scale,
  dark,
  grading,
  pageSize,
  onInverseSync,
  onNavigate,
  registerRef,
  highlight,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  dark: boolean;
  grading: "all" | "no-images" | "off";
  pageSize: PageSize;
  onInverseSync: (page: number, x: number, y: number) => void;
  onNavigate: (page: number) => void;
  registerRef: (element: HTMLDivElement | null) => void;
  highlight: { x: number; y: number } | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const textLayerTaskRef = useRef<TextLayer | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [visible, setVisible] = useState(false);
  const [links, setLinks] = useState<PdfLinkBox[]>([]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const scrollRoot = element.closest(".pdf-scroll");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting);
      },
      { root: scrollRoot, rootMargin: "1200px 0px 1200px 0px", threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) {
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      textLayerTaskRef.current?.cancel();
      textLayerTaskRef.current = null;
      textLayerRef.current?.replaceChildren();
      setLinks([]);
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const page: PDFPageProxy = await doc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        renderTaskRef.current?.cancel();
        const task = page.render({
          canvas,
          viewport,
          transform:
            outputScale !== 1
              ? [outputScale, 0, 0, outputScale, 0, 0]
              : undefined,
          background: "#ffffff",
          pageColors:
            dark && grading === "no-images"
              ? { background: "#232428", foreground: "#d7d9de" }
              : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (!cancelled) renderTaskRef.current = null;

        const textLayerElement = textLayerRef.current;
        if (!cancelled && textLayerElement) {
          textLayerTaskRef.current?.cancel();
          textLayerElement.replaceChildren();
          textLayerElement.style.setProperty("--scale-factor", String(scale));
          textLayerElement.style.setProperty("--total-scale-factor", String(scale));
          textLayerElement.style.setProperty("--user-unit", "1");
          const textLayer = new TextLayer({
            textContentSource: page.streamTextContent(),
            container: textLayerElement,
            viewport,
          });
          textLayerTaskRef.current = textLayer;
          await textLayer.render();
          if (!cancelled) textLayerTaskRef.current = null;
        }
      } catch (error) {
        if ((error as Error)?.name !== "RenderingCancelledException") {
          console.error("Could not render PDF page", error);
        }
      }
    };
    void run();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      textLayerTaskRef.current?.cancel();
      textLayerTaskRef.current = null;
    };
  }, [visible, doc, pageNumber, scale, dark, grading]);

  useEffect(() => {
    if (!visible) {
      setLinks([]);
      return;
    }
    let cancelled = false;
    setLinks([]);
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const annotations = (await page.getAnnotations({
          intent: "display",
        })) as PdfLinkAnnotation[];
        const boxes: PdfLinkBox[] = [];
        for (const annotation of annotations) {
          if (annotation?.subtype !== "Link" || !Array.isArray(annotation.rect)) {
            continue;
          }
          const converted = viewport.convertToViewportRectangle(annotation.rect);
          const left = Math.min(converted[0], converted[2]);
          const top = Math.min(converted[1], converted[3]);
          const width = Math.abs(converted[2] - converted[0]);
          const height = Math.abs(converted[3] - converted[1]);
          if (width <= 0 || height <= 0) continue;
          const url =
            typeof annotation.url === "string" && annotation.url.trim()
              ? annotation.url
              : undefined;
          const dest = annotation.dest ?? undefined;
          if (!url && !dest) continue;
          boxes.push({ left, top, width, height, url, dest });
        }
        if (!cancelled) setLinks(boxes);
      } catch (error) {
        if ((error as Error)?.name !== "RenderingCancelledException") {
          console.error("Could not read PDF links", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible, doc, pageNumber, scale]);

  const size = {
    width: pageSize.width * scale,
    height: pageSize.height * scale,
  };

  const resolveDestinationPage = async (
    dest: string | unknown[],
  ): Promise<number | null> => {
    try {
      const resolved =
        typeof dest === "string" ? await doc.getDestination(dest) : dest;
      if (!Array.isArray(resolved) || !resolved.length) return null;
      const target = resolved[0];
      if (
        target &&
        typeof target === "object" &&
        "num" in target &&
        typeof (target as { num: unknown }).num === "number"
      ) {
        const index = await doc.getPageIndex(
          target as { num: number; gen: number },
        );
        return index + 1;
      }
      if (typeof target === "number") return target + 1;
    } catch (error) {
      console.error("Could not resolve PDF link", error);
    }
    return null;
  };

  const activateLink = (event: ReactMouseEvent, link: PdfLinkBox) => {
    event.preventDefault();
    event.stopPropagation();
    if (link.url) {
      void openUrl(link.url).catch((error) =>
        console.error("Could not open PDF link", error),
      );
      return;
    }
    if (link.dest) {
      void resolveDestinationPage(link.dest).then((page) => {
        if (page) onNavigate(page);
      });
    }
  };

  return (
    <div
      ref={(element) => {
        containerRef.current = element;
        registerRef(element);
      }}
      className={`pdf-page${
        dark && grading === "all" ? " pdf-page-dark" : ""
      }${dark && grading === "no-images" ? " pdf-page-graded" : ""}`}
      style={{
        width: `${size.width}px`,
        height: `${size.height}px`,
      }}
      onClick={(event) => {
        if (!event.ctrlKey && !event.metaKey) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - rect.left) / scale;
        const y = (event.clientY - rect.top) / scale;
        onInverseSync(pageNumber, x, y);
      }}
    >
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textLayerRef} />
      {links.length > 0 && (
        <div className="pdf-link-layer">
          {links.map((link, index) => (
            <a
              key={`${index}:${link.left}:${link.top}`}
              className="pdf-link"
              href={link.url ?? "#"}
              title={link.url ?? t("Go to page")}
              aria-label={link.url ?? t("Internal link")}
              style={{
                left: `${link.left}px`,
                top: `${link.top}px`,
                width: `${link.width}px`,
                height: `${link.height}px`,
              }}
              onClick={(event) => activateLink(event, link)}
              onAuxClick={(event) => event.preventDefault()}
              onMouseDown={(event) => event.stopPropagation()}
            />
          ))}
        </div>
      )}
      {highlight && (
        <div
          className="pdf-sync-highlight"
          style={{
            left: `${highlight.x * scale}px`,
            top: `${highlight.y * scale}px`,
            width: `${Math.max(40, 110 * scale)}px`,
            height: `${Math.max(10, 18 * scale)}px`,
          }}
        />
      )}
    </div>
  );
}


function PdfThumbnail({
  doc,
  pageNumber,
  active,
  onSelect,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onSelect: (page: number) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = buttonRef.current;
    if (!element) return;
    const scrollRoot = element.closest(".pdf-thumbnails");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setVisible(entry.isIntersecting);
      },
      { root: scrollRoot, rootMargin: "400px 0px", threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) {
      taskRef.current?.cancel();
      taskRef.current = null;
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: 0.17 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        taskRef.current?.cancel();
        const task = page.render({
          canvas,
          viewport,
          transform:
            outputScale !== 1
              ? [outputScale, 0, 0, outputScale, 0, 0]
              : undefined,
          background: "#ffffff",
        });
        taskRef.current = task;
        await task.promise;
        if (!cancelled) taskRef.current = null;
      } catch (error) {
        if ((error as Error)?.name !== "RenderingCancelledException") {
          console.error("Could not render thumbnail", error);
        }
      }
    })();
    return () => {
      cancelled = true;
      taskRef.current?.cancel();
      taskRef.current = null;
    };
  }, [visible, doc, pageNumber]);

  return (
    <button
      ref={buttonRef}
      className={`pdf-thumbnail${active ? " is-active" : ""}`}
      onClick={() => onSelect(pageNumber)}
      title={t("Page {n}", { n: pageNumber })}
    >
      <canvas ref={canvasRef} />
      <span className="pdf-thumbnail-number">{pageNumber}</span>
    </button>
  );
}

export default function PdfViewer({
  pdfPath,
  pdfVersion,
  dark,
  grading,
  onToggleDark,
  onTypeset,
  onInverseSync,
  onScrollSync,
  scrollLock,
  onToggleScrollLock,
  syncTarget,
}: PdfViewerProps) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE);
  const [scale, setScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gridView, setGridView] = useState(false);
  const [pageBubble, setPageBubble] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchPages, setSearchPages] = useState<number[]>([]);
  const [searchIndex, setSearchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Texpad's pause button freezes the preview: new typesets are held back
  // until the user resumes.
  const [paused, setPaused] = useState(false);
  const [shownVersion, setShownVersion] = useState(pdfVersion);
  const [highlight, setHighlight] = useState<{
    page: number;
    x: number;
    y: number;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const currentPageRef = useRef(1);
  const pendingPageRef = useRef(1);
  const highlightTimerRef = useRef<number | undefined>(undefined);
  const bubbleTimerRef = useRef<number | undefined>(undefined);
  const previousScaleRef = useRef(1);
  const scrollRafRef = useRef<number | undefined>(undefined);
  const loadTokenRef = useRef(0);
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollSyncTimerRef = useRef<number | undefined>(undefined);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  // Narrow panes fold the toolbar: short page label and no first/last page
  // buttons, then sync/display/pause, then the zoom group, into "•••".
  const toolbarWidth = useWidthClasses(toolbarRef, [
    [560, "is-compact"],
    [460, "is-narrow"],
    [360, "is-tiny"],
  ]);

  currentPageRef.current = currentPage;

  useEffect(() => {
    if (!paused) setShownVersion(pdfVersion);
  }, [paused, pdfVersion]);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [moreOpen]);

  const scrollToPage = (page: number, behavior: ScrollBehavior = "auto") => {
    const element = pageRefs.current[page - 1];
    const scroller = scrollRef.current;
    if (!element || !scroller) return;
    const top = element.offsetTop - 18;
    scroller.scrollTo({ top, behavior });
  };

  useEffect(() => {
    return () => {
      void docRef.current?.destroy();
      docRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!pdfPath) {
      const previous = docRef.current;
      docRef.current = null;
      setDoc(null);
      void previous?.destroy();
      setNumPages(0);
      setError(null);
      setLoading(false);
      return;
    }
    const token = ++loadTokenRef.current;
    pendingPageRef.current = currentPageRef.current;
    setLoading(true);
    setError(null);

    let loadingTask: ReturnType<typeof getDocument> | null = null;
    void (async () => {
      try {
        const buffer = await readBinaryFile(pdfPath);
        if (token !== loadTokenRef.current) return;
        loadingTask = getDocument({ data: new Uint8Array(buffer) });
        const loaded = await loadingTask.promise;
        if (token !== loadTokenRef.current) {
          void loaded.destroy();
          return;
        }
        const previous = docRef.current;
        docRef.current = loaded;
        setDoc(loaded);
        void previous?.destroy();
        setNumPages(loaded.numPages);
        try {
          const first = await loaded.getPage(1);
          const viewport = first.getViewport({ scale: 1 });
          setPageSize({ width: viewport.width, height: viewport.height });
        } catch {
          setPageSize(DEFAULT_PAGE);
        }
        setLoading(false);
      } catch (loadError) {
        if (token !== loadTokenRef.current) return;
        setLoading(false);
        setError(loadError instanceof Error ? loadError.message : String(loadError));
      }
    })();

    return () => {
      void loadingTask?.destroy();
    };
  }, [pdfPath, shownVersion]);

  useEffect(() => {
    if (!numPages) return;
    const page = Math.min(Math.max(1, pendingPageRef.current), numPages);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollToPage(page, "auto"));
    });
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages, shownVersion]);

  useEffect(() => {
    if (!numPages) return;
    setPageBubble(true);
    if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current);
    bubbleTimerRef.current = window.setTimeout(() => setPageBubble(false), 950);
    return () => {
      if (bubbleTimerRef.current) window.clearTimeout(bubbleTimerRef.current);
    };
  }, [currentPage, numPages]);

  useEffect(() => {
    if (!syncTarget) return;
    const page = Math.min(Math.max(1, syncTarget.page), numPages || 1);
    scrollToPage(page, "smooth");
    setCurrentPage(page);
    setHighlight({ page, x: syncTarget.x, y: syncTarget.y });
    if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = window.setTimeout(() => setHighlight(null), 1800);
    return () => {
      if (highlightTimerRef.current) window.clearTimeout(highlightTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncTarget?.nonce, numPages]);

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = undefined;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const scrollTop = scroller.scrollTop;
      let page = 1;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const element = pageRefs.current[i];
        if (!element) continue;
        if (element.offsetTop - 120 <= scrollTop) page = i + 1;
        else break;
      }
      if (scrollLock && page !== currentPageRef.current) {
        if (scrollSyncTimerRef.current) {
          window.clearTimeout(scrollSyncTimerRef.current);
        }
        scrollSyncTimerRef.current = window.setTimeout(() => {
          onScrollSync(page, pageSize.width / 2, 14);
        }, 240);
      }
      setCurrentPage(page);
    });
  }, [scrollLock, pageSize.width, onScrollSync]);

  const zoomIn = () => setScale((value) => Math.min(3, Math.round((value + 0.1) * 10) / 10));
  const zoomOut = () => setScale((value) => Math.max(0.3, Math.round((value - 0.1) * 10) / 10));
  const toggleGridView = () => {
    if (gridView) {
      setGridView(false);
      setScale(previousScaleRef.current || 1);
    } else {
      previousScaleRef.current = scale;
      setGridView(true);
      setScale(0.25);
    }
  };
  const fitWidth = () => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const available = scroller.clientWidth - 56;
    setScale(Math.max(0.3, Math.min(3, available / pageSize.width)));
  };

  const goToPage = (page: number) => {
    const next = Math.min(Math.max(1, page), numPages || 1);
    setCurrentPage(next);
    scrollToPage(next, "smooth");
  };

  const highlightSearchMatches = useCallback(() => {
    document
      .querySelectorAll(".pdf-page .pdf-text-match")
      .forEach((element) => element.classList.remove("pdf-text-match"));
    if (!searchQuery || !searchPages.length) return;
    const page = searchPages[Math.min(searchIndex, searchPages.length - 1)];
    const pageElement = pageRefs.current[page - 1];
    if (!pageElement) return;
    const query = searchQuery.toLowerCase();
    pageElement.querySelectorAll(".textLayer span").forEach((span) => {
      if ((span.textContent ?? "").toLowerCase().includes(query)) {
        span.classList.add("pdf-text-match");
      }
    });
  }, [searchQuery, searchPages, searchIndex]);

  useEffect(() => {
    const timeout = window.setTimeout(highlightSearchMatches, 280);
    return () => window.clearTimeout(timeout);
  }, [highlightSearchMatches, currentPage, scale]);

  useEffect(() => {
    const onZoom = (event: Event) => {
      const delta = (event as CustomEvent<number>).detail;
      if (delta === 0) {
        setScale(1);
      } else {
        setScale((value) =>
          Math.max(
            0.3,
            Math.min(3, Math.round((value + delta * 0.1) * 10) / 10),
          ),
        );
      }
    };
    window.addEventListener("texpad:pdf-zoom", onZoom);
    return () => {
      window.removeEventListener("texpad:pdf-zoom", onZoom);
      if (scrollSyncTimerRef.current) {
        window.clearTimeout(scrollSyncTimerRef.current);
      }
    };
  }, []);

  const runPdfSearch = async () => {
    const query = searchQuery.trim();
    if (!doc || !query) {
      setSearchPages([]);
      return;
    }
    setSearching(true);
    const pages: number[] = [];
    const needle = query.toLowerCase();
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      try {
        const page = await doc.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        if (text.toLowerCase().includes(needle)) pages.push(pageNumber);
      } catch {
        // Ignore pages that cannot be read.
      }
    }
    setSearchPages(pages);
    setSearchIndex(0);
    setSearching(false);
    if (pages.length) goToPage(pages[0]);
  };

  const searchNext = (delta: number) => {
    if (!searchPages.length) return;
    const next =
      (searchIndex + delta + searchPages.length) % searchPages.length;
    setSearchIndex(next);
    goToPage(searchPages[next]);
  };

  const pageElements = [];
  for (let index = 1; index <= numPages; index++) {
    pageElements.push(
      <PdfPage
        key={index}
        doc={doc!}
        pageNumber={index}
        scale={scale}
        dark={dark}
        grading={grading}
        pageSize={pageSize}
        onInverseSync={onInverseSync}
        onNavigate={goToPage}
        registerRef={(element) => {
          pageRefs.current[index - 1] = element;
        }}
        highlight={highlight?.page === index ? highlight : null}
      />,
    );
  }

  return (
    <div className={`pdf-viewer${dark ? " is-dark" : ""}`}>
      <div className={`pdf-toolbar ${toolbarWidth}`} ref={toolbarRef}>
        <div className="pdf-toolbar-group">
          <button
            className={`icon-button pt-zoom${gridView ? " is-active" : ""}`}
            onClick={toggleGridView}
            title={gridView ? t("Single page view") : t("Grid view")}
          >
            <SfIcon name="square.grid.3x2" size={17} />
          </button>
          <button className="icon-button pt-zoom" onClick={zoomOut} title={t("Zoom out (Ctrl+-)")}>
            <SfIcon name="minus.magnifyingglass" size={17} />
          </button>
          <button
            className="pdf-zoom-label pt-zoom"
            onClick={() => setScale(1)}
            title={t("Actual size (Ctrl+0)")}
          >
            {Math.round(scale * 100)}%
          </button>
          <button className="icon-button pt-zoom" onClick={zoomIn} title={t("Zoom in (Ctrl+=)")}>
            <SfIcon name="plus.magnifyingglass" size={17} />
          </button>
          <span className="pdf-toolbar-divider pt-zoom" />
          <button
            className="icon-button pt-ends"
            onClick={() => goToPage(1)}
            disabled={currentPage <= 1}
            title={t("First page")}
          >
            <SfIcon name="chevron.left.2" size={16} />
          </button>
          <button
            className="icon-button"
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage <= 1}
            title={t("Previous page")}
          >
            <SfIcon name="chevron.left" size={16} />
          </button>
        </div>
        <div className="pdf-page-nav">
          <span className="pdf-page-label">
            <span className="pt-page-full">
              {t("Page {n} of {total}", { n: currentPage, total: numPages || "—" })}
            </span>
            <span className="pt-page-short">
              {currentPage} / {numPages || "—"}
            </span>
          </span>
        </div>
        <div className="pdf-toolbar-group">
          <button
            className="icon-button"
            onClick={() => goToPage(currentPage + 1)}
            disabled={!numPages || currentPage >= numPages}
            title={t("Next page")}
          >
            <SfIcon name="chevron.right" size={16} />
          </button>
          <button
            className="icon-button pt-ends"
            onClick={() => goToPage(numPages)}
            disabled={!numPages || currentPage >= numPages}
            title={t("Last page")}
          >
            <SfIcon name="chevron.right.2" size={16} />
          </button>
          <span className="pdf-toolbar-divider" />
          <button
            className="icon-button pt-extra"
            onClick={() => onInverseSync(currentPage, pageSize.width / 2, 90)}
            disabled={!numPages}
            title={t("Sync editor to this page")}
          >
            <SfIcon name="arrow.left.arrow.right.square" size={17} />
          </button>
          <button
            className={`icon-button pdf-lock-button${scrollLock ? " is-on" : ""}`}
            onClick={onToggleScrollLock}
            title={scrollLock ? t("Scroll lock is on") : t("Scroll lock is off")}
          >
            <SfIcon name="arrow.up.right.square.fill" size={17} />
          </button>
          <button
            className="icon-button pt-extra"
            onClick={() => void openExternal(pdfPath!)}
            disabled={!pdfPath}
            title={t("Open PDF in an external viewer")}
          >
            <SfIcon name="display" size={17} />
          </button>
          <button
            className={`icon-button pt-extra${paused ? " is-active" : ""}`}
            onClick={() => setPaused((value) => !value)}
            title={paused ? t("Resume PDF updates") : t("Pause PDF updates")}
          >
            <SfIcon name="pause.fill" size={15} />
          </button>
          <div className="pdf-more-wrap" ref={moreRef}>
            <button
              className={`icon-button${moreOpen ? " is-active" : ""}`}
              onClick={() => setMoreOpen((open) => !open)}
              title={t("More")}
            >
              <SfIcon name="ellipsis" size={16} />
            </button>
            {moreOpen && (
              <div className="menu-popover pdf-more-popover">
                {[
                  { cls: "more-zoom", icon: "plus.magnifyingglass", label: t("Zoom In"), run: zoomIn },
                  { cls: "more-zoom", icon: "minus.magnifyingglass", label: t("Zoom Out"), run: zoomOut },
                  { cls: "more-zoom", icon: "square.grid.3x2", label: gridView ? t("Single Page View") : t("Grid View"), run: toggleGridView },
                  { cls: "more-ends", icon: "chevron.left.2", label: t("First Page"), run: () => goToPage(1) },
                  { cls: "more-ends", icon: "chevron.right.2", label: t("Last Page"), run: () => goToPage(numPages) },
                  { cls: "more-extra", icon: "arrow.left.arrow.right.square", label: t("Sync Editor to This Page"), run: () => onInverseSync(currentPage, pageSize.width / 2, 90) },
                  { cls: "more-extra", icon: "display", label: t("Open in External Viewer"), run: () => pdfPath && void openExternal(pdfPath) },
                  { cls: "more-extra", icon: "pause.fill", label: paused ? t("Resume PDF Updates") : t("Pause PDF Updates"), run: () => setPaused((value) => !value) },
                ].map((item) => (
                  <button
                    key={item.label}
                    className={`menu-item ${item.cls}`}
                    onClick={() => {
                      setMoreOpen(false);
                      item.run();
                    }}
                  >
                    <span className="menu-item-icon"><SfIcon name={item.icon} size={15} /></span>
                    <span className="menu-item-label">{item.label}</span>
                  </button>
                ))}
                <div className="menu-separator more-any" />
                <button
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    setSearchOpen(true);
                    window.setTimeout(() => searchInputRef.current?.focus(), 40);
                  }}
                >
                  <span className="menu-item-icon"><SfIcon name="magnifyingglass" size={15} /></span>
                  <span className="menu-item-label">{t("Search in PDF…")}</span>
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    setShowThumbnails((open) => !open);
                  }}
                >
                  <span className="menu-item-icon"><SfIcon name="sidebar.left" size={15} /></span>
                  <span className="menu-item-label">
                    {showThumbnails ? t("Hide Thumbnails") : t("Show Thumbnails")}
                  </span>
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    fitWidth();
                  }}
                >
                  <span className="menu-item-icon">
                    <SfIcon name="arrow.up.left.and.down.right.magnifyingglass" size={15} />
                  </span>
                  <span className="menu-item-label">{t("Fit Width")}</span>
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    setScale(1);
                  }}
                >
                  <span className="menu-item-icon"><SfIcon name="magnifyingglass" size={15} /></span>
                  <span className="menu-item-label">{t("Actual Size")}</span>
                  <span className="menu-item-shortcut">{t("Ctrl+0")}</span>
                </button>
                <div className="menu-separator" />
                <button
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    onToggleDark();
                  }}
                >
                  <span className="menu-item-icon">
                    <SfIcon name={dark ? "sun.max" : "moon"} size={15} />
                  </span>
                  <span className="menu-item-label">{dark ? t("Light PDF") : t("Dark PDF")}</span>
                </button>
                <button
                  className="menu-item"
                  disabled={!pdfPath}
                  onClick={() => {
                    setMoreOpen(false);
                    if (pdfPath) void printPdf(pdfPath);
                  }}
                >
                  <span className="menu-item-icon"><SfIcon name="printer" size={15} /></span>
                  <span className="menu-item-label">{t("Print PDF…")}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showThumbnails && doc && (
        <div className="pdf-thumbnails">
          {Array.from({ length: numPages }, (_, index) => (
            <PdfThumbnail
              key={index + 1}
              doc={doc}
              pageNumber={index + 1}
              active={currentPage === index + 1}
              onSelect={goToPage}
            />
          ))}
        </div>
      )}

      {searchOpen && (
        <div className="pdf-search-popover">
          <div className="pdf-search-row">
            <SfIcon name="magnifyingglass" size={14} />
            <input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(event) => {
                setSearchQuery(event.target.value);
                setSearchPages([]);
                setSearchIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (searchPages.length) searchNext(event.shiftKey ? -1 : 1);
                  else void runPdfSearch();
                } else if (event.key === "Escape") {
                  setSearchOpen(false);
                }
              }}
              placeholder={t("Search in PDF")}
              spellCheck={false}
            />
            {searching ? (
              <SfIcon name="arrow.clockwise" size={13} className="spin" />
            ) : (
              <span className="pdf-search-count">
                {searchPages.length
                  ? `${searchIndex + 1}/${searchPages.length}`
                  : ""}
              </span>
            )}
            <button
              onClick={() => searchNext(-1)}
              disabled={!searchPages.length}
              title={t("Previous match")}
            >
              <SfIcon name="chevron.left" size={12} />
            </button>
            <button
              onClick={() => searchNext(1)}
              disabled={!searchPages.length}
              title={t("Next match")}
            >
              <SfIcon name="chevron.right" size={12} />
            </button>
            <button
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
                setSearchPages([]);
              }}
              title={t("Close search")}
            >
              <SfIcon name="xmark" size={12} />
            </button>
          </div>
          <div className="pdf-search-actions">
            <span>
              {searchQuery && !searching && searchPages.length === 0
                ? t("No matches")
                : searchPages.length
                  ? plural(searchPages.length, ["{n} page", "{n} pages"], ["{n} страница", "{n} страницы", "{n} страниц"])
                  : ""}
            </span>
            <button onClick={() => void runPdfSearch()}>{t("Search")}</button>
          </div>
        </div>
      )}

      <div className={`pdf-page-bubble${pageBubble ? " is-visible" : ""}`}>
        {currentPage}
      </div>

      <div className="pdf-scroll" ref={scrollRef} onScroll={handleScroll}>
        {loading && (
          <div className="pdf-state">
            <SfIcon name="arrow.clockwise" size={26} className="spin" />
            <span>{t("Loading PDF…")}</span>
          </div>
        )}
        {!loading && !pdfPath && (
          <div className="pdf-state pdf-empty">
            <div className="pdf-empty-icon">
              <SfIcon name="document" size={34} />
            </div>
            <strong>{t("No output yet")}</strong>
            <span>{t("Typeset the document to see its PDF here.")}</span>
            <button className="primary-button" onClick={onTypeset}>
              {t("Typeset")}
            </button>
          </div>
        )}
        {!loading && error && (
          <div className="pdf-state pdf-error">
            <strong>{t("Could not open the PDF")}</strong>
            <span>{error}</span>
          </div>
        )}
        {!loading && !error && numPages > 0 && doc && (
          <div
            className={`pdf-pages${gridView ? " is-grid" : ""}`}
            style={{ gap: `${gridView ? 16 : Math.round(22 * Math.min(scale, 1.4))}px` }}
          >
            {pageElements}
            <div className="pdf-end-space" />
          </div>
        )}
      </div>
    </div>
  );
}
