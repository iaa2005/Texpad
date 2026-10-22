import re

path = r"C:\Data\Projects\Texpad\src\lib\completions.ts"
with open(path, "r", encoding="utf-8") as handle:
    text = handle.read()

text = re.sub(
    r"text\.split\(/[\s\S]*?/\)\) \{",
    r"text.split(/\\r?\\n/)) {",
    text,
    count=1,
)
text = text.replace("const label = `\\${key}`;", "const label = `\\\\${key}`;")

with open(path, "w", encoding="utf-8") as handle:
    handle.write(text)

print("fixed")
