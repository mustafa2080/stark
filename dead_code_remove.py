import io

path = r"C:\Users\musta\Desktop\pro\stark\stark\artifacts\caprina\src\pages\dashboard.tsx"

with io.open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()

assert "STATUS_LABELS" in lines[71], f"anchor mismatch at 72: {lines[71]!r}"
assert lines[1173].strip() == "}", f"anchor mismatch at 1174: {lines[1173]!r}"
assert "Period Card" in lines[1175], f"anchor mismatch at 1176: {lines[1175]!r}"

removed_start = 71
removed_end   = 1173

new_lines = lines[:removed_start] + lines[removed_end:]

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.writelines(new_lines)

print("Removed lines:", removed_end - removed_start)
print("New total lines:", len(new_lines))
for i in range(max(0, removed_start-3), removed_start+5):
    print(i+1, repr(new_lines[i]))
