path = r"C:\Data\Projects\Texpad\src\components\sidebar\SearchView.tsx"
with open(path, "r", encoding="utf-8") as handle:
    text = handle.read()

start_marker = "        const lineCount = cached.content.split("
start = text.index(start_marker)
end = text.index(".length;", start) + len(".length;")
replacement = "        const lineCount = cached.content.split(/\\r?\\n/).length;"
text = text[:start] + replacement + text[end:]

with open(path, "w", encoding="utf-8") as handle:
    handle.write(text)

print("fixed")
