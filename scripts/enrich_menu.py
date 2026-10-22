path = r"C:\Data\Projects\Texpad\src\components\TitleBar.tsx"
with open(path, "r", encoding="utf-8") as handle:
    text = handle.read()

anchor1 = """                <MenuItem
                  icon={<SfIcon name="document" size={15} />}
                  label="New from Template…"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowTemplates(true);
                  }}
                />
                <div className="menu-separator" />"""
replace1 = """                <MenuItem
                  icon={<SfIcon name="document" size={15} />}
                  label="New from Template…"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowTemplates(true);
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="magnifyingglass" size={15} />}
                  label="Find in Project…"
                  shortcut="Ctrl+Shift+F"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    focusSearch("text");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="star" size={15} />}
                  label="Tag Search…"
                  shortcut="Ctrl+Shift+O"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    focusSearch("tag");
                  }}
                />
                <div className="menu-separator" />"""

anchor2 = """                <MenuItem
                  icon={<SfIcon name="square.and.arrow.down" size={15} />}
                  label="Save All"
                  shortcut="Ctrl+Shift+S"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void saveAll(false);
                  }}
                />
                <div className="menu-separator" />"""
replace2 = """                <MenuItem
                  icon={<SfIcon name="square.and.arrow.down" size={15} />}
                  label="Save All"
                  shortcut="Ctrl+Shift+S"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void saveAll(false);
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="text.bubble" size={15} />}
                  label="Comment Block"
                  shortcut="Ctrl+/"
                  onClick={() => {
                    setMenuOpen(false);
                    sendEditorCommand("comment");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="increase.indent" size={15} />}
                  label="Indent Block"
                  shortcut="Ctrl+]"
                  onClick={() => {
                    setMenuOpen(false);
                    sendEditorCommand("indent");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="decrease.indent" size={15} />}
                  label="Unindent Block"
                  shortcut="Ctrl+["
                  onClick={() => {
                    setMenuOpen(false);
                    sendEditorCommand("outdent");
                  }}
                />
                <div className="menu-separator" />"""

anchor3 = """                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="xmark" size={15} />}
                  label="Close Project\""""
replace3 = """                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="gearshape" size={15} />}
                  label="Typeset Now"
                  shortcut="Ctrl+Enter"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    void runTypeset(true);
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="arrow.clockwise" size={15} />}
                  label="Toggle Live Typesetting"
                  shortcut="Ctrl+Shift+L"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setSettings({ autoTypeset: !settings.autoTypeset });
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="xmark" size={15} />}
                  label="Abort Typesetting"
                  disabled={!building}
                  onClick={() => {
                    setMenuOpen(false);
                    void cancelTypeset();
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="printer" size={15} />}
                  label="Print PDF…"
                  disabled={!build.pdfPath}
                  onClick={() => {
                    setMenuOpen(false);
                    if (build.pdfPath) {
                      void printPdf(build.pdfPath)
                        .then(() => notify("PDF sent to the printer.", "success"))
                        .catch((error) => notify(String(error), "error"));
                    }
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="printer" size={15} />}
                  label="Print LaTeX Source…"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    if (rootFile) {
                      void printFile(rootFile)
                        .then(() => notify("Source sent to the printer.", "success"))
                        .catch((error) => notify(String(error), "error"));
                    }
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="xmark" size={15} />}
                  label="Close Project\""""

anchor4 = """                <MenuItem
                  icon={<SfIcon name="gearshape" size={15} />}
                  label="Settings…"
                  shortcut="Ctrl+,"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowSettings(true);
                  }}
                />"""
replace4 = """                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="rectangle" size={15} />}
                  label="Editor Only"
                  shortcut="Ctrl+2"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setViewMode("editor");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="rectangle.split.2x1" size={15} />}
                  label="Editor and PDF"
                  shortcut="Ctrl+3"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setViewMode("split");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="rectangle.fill" size={15} />}
                  label="PDF Only"
                  shortcut="Ctrl+4"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setViewMode("pdf");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="sidebar.left" size={15} />}
                  label="Toggle Sidebar"
                  shortcut="Ctrl+1"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    setSidebarVisible(!sidebarVisible);
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="exclamationmark.triangle" size={15} />}
                  label="Typeset Issues"
                  shortcut="Ctrl+8"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    focusIssues("issues");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="document" size={15} />}
                  label="Typeset Log"
                  shortcut="Ctrl+9"
                  disabled={!hasProject}
                  onClick={() => {
                    setMenuOpen(false);
                    focusIssues("log");
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="plus" size={15} />}
                  label="Zoom PDF In"
                  onClick={() => {
                    setMenuOpen(false);
                    window.dispatchEvent(
                      new CustomEvent("texpad:pdf-zoom", { detail: 1 }),
                    );
                  }}
                />
                <MenuItem
                  icon={<SfIcon name="minus" size={15} />}
                  label="Zoom PDF Out"
                  onClick={() => {
                    setMenuOpen(false);
                    window.dispatchEvent(
                      new CustomEvent("texpad:pdf-zoom", { detail: -1 }),
                    );
                  }}
                />
                <div className="menu-separator" />
                <MenuItem
                  icon={<SfIcon name="gearshape" size={15} />}
                  label="Settings…"
                  shortcut="Ctrl+,"
                  onClick={() => {
                    setMenuOpen(false);
                    setShowSettings(true);
                  }}
                />"""

for anchor, replacement, label in [
    (anchor1, replace1, "anchor1"),
    (anchor2, replace2, "anchor2"),
    (anchor3, replace3, "anchor3"),
    (anchor4, replace4, "anchor4"),
]:
    if anchor not in text:
        print("missing", label)
    text = text.replace(anchor, replacement, 1)

with open(path, "w", encoding="utf-8") as handle:
    handle.write(text)

print("menu enriched")
