import SfIcon from "./SfIcon";
import { useAppStore } from "../store/useAppStore";
import { t } from "../i18n";

/**
 * Texpad's tab strip: spans the whole window under the toolbar, splits the
 * width evenly between tabs and only appears once more than one file is open.
 * New tabs are opened from the toolbar's "new tab" button.
 */
export default function TabBar() {
  const files = useAppStore((state) => state.files);
  const activePath = useAppStore((state) => state.activePath);
  const setActiveFile = useAppStore((state) => state.setActiveFile);
  const closeFile = useAppStore((state) => state.closeFile);

  if (files.length < 2) return null;

  return (
    <div className="tabbar">
      <div
        className="tabs"
        onWheel={(event) => {
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            event.currentTarget.scrollLeft += event.deltaY;
          }
        }}
      >
        {files.map((file) => {
          const active = activePath === file.path;
          return (
            <div
              key={file.path}
              className={`tab${active ? " is-active" : ""}${file.dirty ? " is-dirty" : ""}`}
              title={file.path}
              onClick={() => setActiveFile(file.path)}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  void closeFile(file.path);
                }
              }}
            >
              <span className="tab-dot" />
              <button
                className="tab-close"
                title={t("Close tab")}
                onClick={(event) => {
                  event.stopPropagation();
                  void closeFile(file.path);
                }}
              >
                <SfIcon name="xmark" size={10} />
              </button>
              <span className="tab-name">{file.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
