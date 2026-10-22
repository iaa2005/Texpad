import SfIcon from "./SfIcon";
import { useAppStore } from "../store/useAppStore";
import { t } from "../i18n";

export default function Toast() {
  const toast = useAppStore((state) => state.toast);
  const dismiss = useAppStore((state) => state.dismissToast);

  if (!toast) return null;

  return (
    <div className={`toast toast-${toast.type}`} role="status" onClick={dismiss}>
      {toast.type === "error" ? (
        <SfIcon name="exclamationmark.triangle" size={15} />
      ) : toast.type === "success" ? (
        <SfIcon name="checkmark.circle" size={15} />
      ) : (
        <SfIcon name="info.circle" size={15} />
      )}
      <span>{toast.text}</span>
      <button
        className="toast-close"
        onClick={(event) => {
          event.stopPropagation();
          dismiss();
        }}
        title={t("Dismiss")}
      >
        <SfIcon name="xmark" size={12} />
      </button>
    </div>
  );
}
