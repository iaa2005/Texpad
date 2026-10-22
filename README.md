# Texpad for Windows

Лёгкий LaTeX-workspace для Windows, вдохновлённый Texpad (Texifier) для macOS.
Стек: **Tauri 2 + React + TypeScript + CodeMirror 6 + PDF.js + Rust**.
Сборка PDF выполняется локальным TeX Live (`pdflatex`, `xelatex`, `lualatex`
или `latexmk`) либо **Tectonic** — самодостаточным движком, который можно
установить прямо из приложения.

## Скачать

[Последний релиз](https://github.com/iaa2005/Texpad/releases/latest):

- **Texpad_x.y.z_x64-setup.exe** — установщик (ставится в профиль пользователя,
  права администратора не нужны).
- **Texpad_x.y.z_x64-portable.zip** — портативная версия: распакуйте и
  запустите `Texpad.exe`.

Нужен Microsoft Edge WebView2 (есть в Windows 10/11).

Интерфейс использует **SF Pro Text / SF Pro Display** для UI, **SF Mono** для
редактора и **SF Symbols** для иконок. Шрифты лежат в `public/fonts` (WOFF2),
символы — в `public/sfsymbols`.

## Что уже работает

### Workspace и Organiser
- Организатор в стиле Texpad: две панели, Recent Documents, фильтр, версия,
  Documents/About, удаление из recent.
- Однооконный workspace: кастомный title bar, вкладки файлов, sidebar,
  editor/PDF split с перетаскиваемой границей.
- Toolbar: меню, sidebar, typeset/abort, LIVE, engine, typesetting settings,
  issue indicator, share, Editor/Split/PDF, Back/Forward, New tab.
- Back/Forward с историей переходов; Ctrl+Shift+[ / ] для переключения вкладок.
- Восстановление последней сессии: проект, вкладки, активный файл и строка.

### Sidebar
- **Structure**: ToC (part/chapter/section/subsection), figures, tables, labels,
  metadata, фильтр и настройки отображаемых групп.
- **Subfiles**: root, includes, `.bib`, картинки, локальные `.sty`/`.cls`;
  drag-and-drop и кнопка «вставить в редактор».
- **File browser**: навигация по папкам, Up/Refresh/New file/Reveal,
  открытие текста и картинок.
- **TODOs**: `% todo ...`, `% TODO ...`, `\todo{...}`.
- **Issues / Log**: ошибки/предупреждения/info, фильтр, переход к строке,
  полный лог, копирование, сводка по времени, проходам и инструментам
  (BibTeX/Biber/makeindex).
- **Search**: Text Search и Tag Search; case/regex, recent searches,
  группировка по файлам, подсветка, Replace/Replace All, замена выбранного
  вхождения; Tag Search по секциям, figures/tables, labels, citations,
  файлам и номерам строк; навигация стрелками/Enter.
- File watcher: открытые файлы перечитываются при внешнем изменении,
  конфликты с несохранёнными правками показываются.

### Editor
- LaTeX syntax highlighting в стиле Texpad (зелёные комментарии, оранжевые
  команды, голубые math/env).
- Line numbers, active line, bracket matching, поиск по файлу.
- Autocomplete: команды, окружения, метки, цитаты, пакеты (включая локальные
  `.sty`), классы, bibliographystyle, graphic-файлы, пользовательские
  `\newcommand`/`\newenvironment`.
- Пользовательский `autocompleted_commands.txt` и папка `Snippets` в
  Application Support (парсинг Texpad-совместимого формата).
- Snippets: встроенные и пользовательские.
- Symbol table (кнопка √x): категории стопкой, как в Texpad (заголовки
  прилипают сверху и снизу). Из latexted: поиск по символам, «Recently used»,
  закрепление правым кликом с вставкой по Alt+1…9 и поиск символа рисунком
  мышью (офлайн-сопоставление с шаблонами, без сети).
- Панель форматирования (latexted): отмена/повтор, жирный/курсив/подчёркивание
  с обёрткой выделения, списки, таблица, меню заголовков.
- Ошибки сборки — цветные карточки; клик переходит к строке.
- Интерфейс на русском и английском: Настройки → Общие → Язык
  (по умолчанию — язык Windows). Строки — в `src/i18n/ru.ts`, ключ — английский
  текст; недостающие переводы показываются по-английски.
- Импорт ZIP-проекта (экспорт Overleaf/latexted), «Save PDF As…»
  (Ctrl+Shift+D), сборка по Ctrl+R, шаблон «Отчёт по ГОСТ 7.32».
- Comment/uncomment (`Ctrl+/`), indent/outdent (`Ctrl+]`/`Ctrl+[`),
  авто-закрытие `\begin`/`\end`, авто-списки, авто-отступы.
- Info boxes при наведении на `\ref`, `\cite`, `\includegraphics`;
  для картинок показывается превью.
- Drag-and-drop файлов из Проводника: `\includegraphics`, `\input`,
  `\bibliography`.
- Переносы строк, размер и шрифт редактора настраиваются.

### PDF
- PDF.js: непрерывный просмотр, lazy render, zoom, page nav, page bubble,
  grid view (страницы в несколько колонок).
- Тулбар PDF как у Texpad: grid, zoom ±, «‹ Page N of M › », sync editor,
  scroll lock, внешний просмотрщик, пауза обновления превью и меню «•••»
  (поиск, thumbnails, Fit Width, Actual Size, Dark PDF, печать).
- **Text layer**: выделение, копирование и поиск текста в PDF.
- **Clickable links**: внутренние ссылки переходят на страницу, внешние
  (`http`, `https`, `mailto`) открываются в браузере; при наведении область
  ссылки обводится рамкой, как в Acrobat.
- PDF search: поле поиска, переход по страницам с совпадениями, подсветка.
- Dark PDF с вариантами grading: весь документ, всё кроме изображений,
  без grading.
- Scroll lock: синхронная прокрутка editor ↔ PDF через SyncTeX.
- Forward/inverse SyncTeX (Ctrl+click в PDF, кнопка Sync, Ctrl+D).
- Открытие во внешнем просмотрщике, печать PDF.
- Горячие клавиши zoom: Ctrl+= / Ctrl+- / Ctrl+0; PDF/Log: Ctrl+8/9.

### Typesetting
- `pdflatex`, `xelatex`, `lualatex`, `latexmk`, `tectonic`.
- Tectonic: если pdfLaTeX/XeLaTeX не найден, приложение предлагает установить
  Tectonic (официальный Windows-билд с GitHub, без прав администратора) и
  автоматически переключается на него.
- Несколько проходов, автоопределение BibTeX/Biber и makeindex.
- Автосохранение и live typeset; abort typesetting; clean build.
- Shell escape, custom build command вместо движка.
- `% !TEX root` (открытие корня из подфайла) и `% !TEX program`.
- `%force-texpad-dependency` для нестандартных зависимостей.
- Сборка из подфайла, локальные `.sty`/`.cls`, библиография и индексы.
- Кодировки: UTF-8, Windows-1251, UTF-16 LE/BE, ISO-8859-1;
  перечитывание проекта в выбранной кодировке.

### Files, templates and safety
- Templates: Blank, Article, Report, Beamer, Letter + пользовательские
  `.tex`/`.md` из папки Templates.
- Editor Archive: автоснапшоты документов в Application Support.
- Export проекта как ZIP или папки.
- Share: Reveal PDF, Open PDF, Print PDF, Print LaTeX Source,
  Email PDF и Email Project as ZIP (через Outlook, best-effort).
- Настройки в вкладках General / Editor / Document Viewer / Typesetting.

## Горячие клавиши

| Комбинация | Действие |
|---|---|
| `Ctrl+O` | Открыть документ |
| `Ctrl+N` | Новый документ |
| `Ctrl+Shift+T` | Открыть файл в новой вкладке |
| `Ctrl+S` / `Ctrl+Shift+S` | Сохранить / сохранить всё |
| `Ctrl+Enter` / `Ctrl+T` | Typeset |
| `Ctrl+Shift+L` | Вкл/выкл LIVE |
| `Ctrl+W` | Закрыть вкладку |
| `Ctrl+Shift+W` | Показать Welcome (закрыть проект) |
| `Ctrl+1` | Показать/скрыть sidebar |
| `Ctrl+2/3/4` | Editor only / Split / PDF only |
| `Ctrl+Shift+F` | Text Search |
| `Ctrl+Shift+O` | Tag Search |
| `Ctrl+/` | Comment/uncomment |
| `Ctrl+]` / `Ctrl+[` | Indent/unindent |
| `Ctrl+Space` | Открыть autocomplete |
| `Ctrl+Shift+[` / `]` | Предыдущая/следующая вкладка |
| `Ctrl+,` | Настройки |
| `Ctrl+=` / `Ctrl+-` / `Ctrl+0` | Zoom PDF / сброс |
| `Ctrl+8` / `Ctrl+9` | Issues / Log |
| `Ctrl+D` | Sync PDF с позицией редактора |

## Требования

1. Windows 10/11 с WebView2.
2. Node.js 20+ и npm.
3. Rust (MSVC toolchain) + Visual Studio Build Tools с C++ workload.
4. TeX Live (или MiKTeX) с `pdflatex`, `bibtex`, `biber`, `makeindex`,
   `synctex` в `PATH` — необязательно: вместо него можно установить Tectonic
   из окна настройки typesetting.
5. Для Email-функций — Outlook (через COM). Без Outlook экспорт ZIP/папки
   и печать работают, email вернёт ошибку.

## Запуск и сборка

```bat
scripts\dev.cmd
```

```bat
scripts\build.cmd
```

Готовый exe: `src-tauri\target\release\texpad.exe`. Для первого запуска
разработки: `npm install`.

Тестовые проекты: [`sample/`](sample) (BibTeX + makeindex + картинка) и
[`sample-biber/`](sample-biber) (biblatex + Biber). Rust-тесты:

```bat
cargo test --manifest-path src-tauri\Cargo.toml --lib -- --ignored --nocapture
```

Тест Tectonic запускается с путём к скачанному `tectonic.exe`:

```bat
set TECTONIC_TEST_BIN=C:\path\to\tectonic.exe
cargo test --manifest-path src-tauri\Cargo.toml compiles_sample_with_tectonic -- --ignored --nocapture
```

## Ограничения

- Нет Markdown-тайпсеттинга: для `.md` нужен pandoc, которого нет в системе.
  Редактор работает с LaTeX/TeX.
- Нет Texpad Connect, аккаунта, лицензии, облачного typesetter и TexpadTeX
  bundles — это серверные/проприетарные функции Texpad, вне задачи.
- Email работает через Outlook COM; другие почтовые клиенты не поддерживаются.
- Пользовательские `.tpbuild`-скрипты не парсятся как формат Texpad, но можно
  задать произвольную custom build command в настройках.
- PDF text search подсвечивает совпадения в пределах одного text-run; сложные
  случаи, разбитые на несколько span, могут подсветиться не полностью.
- Tectonic не запускает makeindex, поэтому предметный указатель в проектах
  с `\makeindex` может остаться пустым. Первый запуск Tectonic скачивает
  пакеты из сети и может занять несколько минут. Forward/inverse SyncTeX
  требует `synctex` из TeX Live даже при сборке через Tectonic.
- SF Pro, SF Pro Display и SF Mono — проприетарные шрифты Apple, взятые из
  публичных репозиториев. Для личного использования; при распространении
  приложения проверьте лицензию Apple.
- SF Symbols SVG взяты из публичного репозитория `sfsymbols-svg`.
