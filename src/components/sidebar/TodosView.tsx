import { useState } from "react";
import SfIcon from "../SfIcon";
import { basename } from "../../lib/path";
import { useAppStore } from "../../store/useAppStore";
import { t } from "../../i18n";
import { plural } from "../../i18n";

export default function TodosView() {
  const todos = useAppStore((state) => state.todos);
  const jumpTo = useAppStore((state) => state.jumpTo);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="todos-panel">
      <div className="todos-summary">
        {plural(todos.length, ["{n} TODO", "{n} TODOs"], ["{n} задача", "{n} задачи", "{n} задач"])}
      </div>
      <div className="todos-scroll">
        {todos.map((todo, index) => {
          const key = `${todo.file}:${todo.line}:${index}`;
          return (
            <button
              key={key}
              className={`todo-row${selected === key ? " is-selected" : ""}`}
              title={`${basename(todo.file)}:${todo.line}`}
              onClick={() => {
                setSelected(key);
                void jumpTo(todo.file, todo.line);
              }}
            >
              <span className="todo-check">
                <SfIcon name="checkmark.square" size={14} />
              </span>
              <span className="todo-message">{todo.text || t("TODO")}</span>
            </button>
          );
        })}
        {!todos.length && (
          <div className="files-empty todos-empty">
            <SfIcon name="list.bullet.rectangle" size={20} />
            <span>{t("No TODOs in this project.")}</span>
            <span className="todos-hint">
              {t("Write a comment containing TODO, or use \\todo{…}.")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
