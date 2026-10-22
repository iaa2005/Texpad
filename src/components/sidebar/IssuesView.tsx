import { useState } from "react";
import SfIcon from "../SfIcon";
import { basename } from "../../lib/path";
import { useAppStore } from "../../store/useAppStore";
import type { Issue, Severity } from "../../types";
import { t } from "../../i18n";
import { locale, plural } from "../../i18n";

type IssueFilter = "all" | Severity;

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "error") {
    return <SfIcon name="exclamationmark.triangle" size={15} className="issue-icon severity-error" />;
  }
  if (severity === "warning") {
    return <SfIcon name="exclamationmark.triangle" size={15} className="issue-icon severity-warning" />;
  }
  return <SfIcon name="info.circle" size={15} className="issue-icon severity-info" />;
}

export default function IssuesView() {
  const issues = useAppStore((state) => state.issues);
  const build = useAppStore((state) => state.build);
  const jumpTo = useAppStore((state) => state.jumpTo);
  const runTypeset = useAppStore((state) => state.runTypeset);
  const notify = useAppStore((state) => state.notify);

  const tab = useAppStore((state) => state.issuesTab);
  const setTab = useAppStore((state) => state.focusIssues);
  const [filter, setFilter] = useState<IssueFilter>("all");

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const infos = issues.filter((issue) => issue.severity === "info").length;
  const shown = issues.filter(
    (issue) => filter === "all" || issue.severity === filter,
  );

  const lastTypeset = build.lastBuiltAt
    ? new Date(build.lastBuiltAt)
    : null;
  const toolLabel = build.tools?.length ? `  ·  ${build.tools.join(", ")}` : "";
  const summary = lastTypeset
    ? `${t("Last typeset at")} ${lastTypeset.toLocaleTimeString(locale(), {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}  ·  ${(build.durationMs / 1000).toFixed(1)}s${
        build.passes > 1 ? `  ·  ${plural(build.passes, ["{n} pass", "{n} passes"], ["{n} проход", "{n} прохода", "{n} проходов"])}` : ""
      }${toolLabel}`
    : t("Not typeset yet");

  const copyLog = () => {
    if (!build.log) return;
    void navigator.clipboard
      .writeText(build.log)
      .then(() => notify(t("Log copied to clipboard"), "success"))
      .catch((error) => notify(String(error), "error"));
  };

  return (
    <div className="issues-panel">
      <div className="issues-summary">
        <div className="issues-summary-main">
          {build.status === "building" ? (
            <>
              <SfIcon name="arrow.clockwise" size={14} className="spin" />
              <span>{t("Typesetting…")}</span>
            </>
          ) : (
            <span>{summary}</span>
          )}
        </div>
        <div className={`issues-counts${errors ? " has-errors" : warnings ? " has-warnings" : " is-clean"}`}>
          {plural(errors, ["{n} error", "{n} errors"], ["{n} ошибка", "{n} ошибки", "{n} ошибок"])}{" "}
          {t("and")}{" "}
          {plural(warnings, ["{n} warning", "{n} warnings"], ["{n} предупреждение", "{n} предупреждения", "{n} предупреждений"])}
        </div>
      </div>

      <div className="issues-tabs">
        <button
          className={tab === "issues" ? "is-active" : ""}
          onClick={() => setTab("issues")}
        >
          {t("Issues")}
        </button>
        <button
          className={tab === "log" ? "is-active" : ""}
          onClick={() => setTab("log")}
        >
          {t("Log")}
        </button>
        <div className="issues-tabs-spacer" />
        {tab === "log" && build.log && (
          <button className="issues-copy" onClick={copyLog} title={t("Copy log")}>
            <SfIcon name="square.on.square" size={13} />
          </button>
        )}
      </div>

      {build.errorMessage && (
        <div className="build-error-card">
          <SfIcon name="exclamationmark.triangle" size={15} />
          <div>
            <strong>{t("Typesetting failed")}</strong>
            <span>{build.errorMessage}</span>
          </div>
        </div>
      )}

      {tab === "log" ? (
        <div className="log-scroll">
          {build.log ? (
            <pre className="log-view">{build.log}</pre>
          ) : (
            <div className="issues-empty">
              <SfIcon name="info.circle" size={20} />
              <span>{t("No typesetter log yet.")}</span>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="issue-filters">
            {(
              [
                ["all", "All", issues.length],
                ["error", "Errors", errors],
                ["warning", "Warnings", warnings],
                ["info", "Info", infos],
              ] as Array<[IssueFilter, string, number]>
            ).map(([value, label, count]) => (
              <button
                key={value}
                className={`issue-filter-chip${filter === value ? " is-active" : ""}${
                  value === "error" && count ? " is-error" : ""
                }${value === "warning" && count ? " is-warning" : ""}`}
                onClick={() => setFilter(value)}
              >
                {t(label)}
                <span>{count}</span>
              </button>
            ))}
          </div>

          <div className="issues-scroll">
            {shown.map((issue: Issue, index) => (
              <button
                key={`${issue.file}:${issue.line}:${index}`}
                className={`issue-row is-${issue.severity}`}
                title={issue.raw || issue.message}
                onClick={() => void jumpTo(issue.file, issue.line || 1)}
              >
                <SeverityIcon severity={issue.severity} />
                <span className="issue-text">
                  <span className="issue-location">
                    {basename(issue.file)}
                    {issue.line > 0 && <span className="issue-line"> [{issue.line}]</span>}
                  </span>
                  <span className="issue-message">{issue.message}</span>
                </span>
                <SfIcon name="arrow.up.right" size={13} className="issue-jump-icon" />
              </button>
            ))}

            {!shown.length && !build.errorMessage && (
              <div className="issues-empty is-clean">
                {build.status === "building" ? (
                  <>
                    <SfIcon name="arrow.clockwise" size={24} className="spin" />
                    <span>{t("Typesetting…")}</span>
                  </>
                ) : build.lastBuiltAt && !errors && !warnings ? (
                  <>
                    <SfIcon name="checkmark.circle" size={24} />
                    <span>{t("No errors or warnings.")}</span>
                  </>
                ) : !build.lastBuiltAt ? (
                  <>
                    <SfIcon name="info.circle" size={24} />
                    <span>{t("This document has not been typeset yet.")}</span>
                    <button className="primary-button" onClick={() => void runTypeset(true)}>
                      {t("Typeset")}
                    </button>
                  </>
                ) : filter !== "all" ? (
                  <>
                    <SfIcon name="checkmark.circle" size={24} />
                    <span>{t("No issues of this kind.")}</span>
                  </>
                ) : (
                  <>
                    <SfIcon name="checkmark.circle" size={24} />
                    <span>{t("No issues to show.")}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
