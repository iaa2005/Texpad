export interface LatexTemplate {
  id: string;
  name: string;
  description: string;
  content: string;
}

export const BUILTIN_TEMPLATES: LatexTemplate[] = [
  {
    id: "blank",
    name: "Blank LaTeX Document",
    description: "A clean article with a title block.",
    content: `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Untitled}
\\author{}
\\date{\\today}

\\begin{document}
\\maketitle

Hello, world!

\\end{document}
`,
  },
  {
    id: "article",
    name: "Article",
    description: "Title, abstract, table of contents and sections.",
    content: `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage{booktabs}

\\title{Article Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
A short summary of the article.
\\end{abstract}

\\tableofcontents
\\newpage

\\section{Introduction}
Start writing here.

\\subsection{Background}
Context and prior work.

\\section{Methods}
Describe the approach.

\\section{Results}
Present the results.

\\section{Conclusion}
Summarise the findings.

\\bibliographystyle{plain}
% \\bibliography{references}

\\end{document}
`,
  },
  {
    id: "report",
    name: "Report",
    description: "Chapter-based report with front matter.",
    content: `\\documentclass[11pt]{report}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Report Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{Introduction}
Start with the problem statement.

\\section{Motivation}
Why this matters.

\\chapter{Background}
Theory and related work.

\\chapter{Methodology}
The proposed approach.

\\chapter{Results}
Experiments and analysis.

\\chapter{Conclusion}
Summary and future work.

\\end{document}
`,
  },
  {
    id: "beamer",
    name: "Beamer Presentation",
    description: "A minimal slide deck with a title and outline.",
    content: `\\documentclass{beamer}
\\usetheme{Madrid}
\\usepackage[utf8]{inputenc}

\\title{Presentation Title}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{Outline}
  \\tableofcontents
\\end{frame}

\\section{Introduction}
\\begin{frame}{First slide}
  \\begin{itemize}
    \\item First point
    \\item Second point
  \\end{itemize}
\\end{frame}

\\section{Conclusion}
\\begin{frame}{Thank you}
  Questions?
\\end{frame}

\\end{document}
`,
  },
  {
    id: "letter",
    name: "Letter",
    description: "A formal letter skeleton.",
    content: `\\documentclass[11pt]{letter}
\\usepackage[utf8]{inputenc}

\\signature{Author Name}
\\address{Author Name \\\\ Street 1 \\\\ City}

\\begin{document}
\\begin{letter}{Recipient Name \\\\ Street 2 \\\\ City}
\\opening{Dear Recipient,}

Write your letter here.

\\closing{Sincerely,}
\\end{letter}
\\end{document}
`,
  },
  {
    id: "gost-report",
    name: "Отчёт по ГОСТ 7.32",
    description: "Russian report: GOST margins, 14 pt, 1.5 spacing, title page.",
    content: `\\documentclass[a4paper,14pt]{extarticle}
\\usepackage[T2A]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[russian]{babel}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage[left=30mm,right=15mm,top=20mm,bottom=20mm]{geometry}
\\usepackage{setspace}
\\onehalfspacing
\\usepackage{indentfirst}
\\setlength{\\parindent}{12.5mm}
\\usepackage[labelsep=endash]{caption}
\\usepackage{hyperref}

\\begin{document}

\\begin{titlepage}
  \\centering
  Министерство науки и высшего образования Российской Федерации\\\\
  Название организации
  \\vfill
  {\\large\\bfseries ОТЧЁТ}\\\\[2mm]
  о научно-исследовательской работе\\\\[2mm]
  «Тема работы»
  \\vfill
  \\begin{flushright}
    Исполнитель: \\underline{\\hspace{4cm}} И.\\,О.~Фамилия
  \\end{flushright}
  \\vfill
  Город \\the\\year
\\end{titlepage}

\\tableofcontents
\\newpage

\\section*{Введение}
\\addcontentsline{toc}{section}{Введение}
Текст введения.

\\section{Основная часть}
Текст раздела.

\\section*{Заключение}
\\addcontentsline{toc}{section}{Заключение}
Текст заключения.

\\end{document}
`,
  },
];

export function templateById(id: string): LatexTemplate {
  return (
    BUILTIN_TEMPLATES.find((template) => template.id === id) ??
    BUILTIN_TEMPLATES[0]
  );
}
