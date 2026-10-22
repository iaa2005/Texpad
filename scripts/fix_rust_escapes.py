path = r"C:\Data\Projects\Texpad\src-tauri\src\lib.rs"
with open(path, "r", encoding="utf-8") as handle:
    text = handle.read()

text = text.replace("body.push('\n');", r"body.push('\n');")
text = text.replace("replace(''', \"''\")", r"replace('\'', \"''\")")

with open(path, "w", encoding="utf-8") as handle:
    handle.write(text)

print("fixed")
