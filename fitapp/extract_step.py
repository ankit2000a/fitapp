import json

log_path = "/Users/akshay/.gemini/antigravity-ide/brain/251427f2-de52-4c90-acc4-86bc1bf78deb/.system_generated/logs/transcript.jsonl"

part1_raw = ""
part2_raw = ""

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get('content', '')
            if "Showing lines 1 to 800" in content:
                part1_raw = content
                print(f"Found part1 at step {data.get('step_index')}, len {len(content)}")
            elif "Showing lines 801 to 1445" in content:
                part2_raw = content
                print(f"Found part2 at step {data.get('step_index')}, len {len(content)}")
        except:
            pass

def clean_lines(raw):
    lines = raw.split('\n')
    cleaned = []
    started = False
    for line in lines:
        if "Showing lines" in line:
            started = True
            continue
        if started:
            if "The above content" in line or "The above content does NOT show the entire file" in line:
                break
            # Remove line numbers: "1: import..." -> "import..."
            if line.strip() == "":
                cleaned.append("")
                continue
            # Look for a number followed by a colon
            parts = line.split(':', 1)
            if len(parts) > 1 and parts[0].strip().isdigit():
                val = parts[1]
                if val.startswith(' '):
                    val = val[1:]
                cleaned.append(val)
            else:
                cleaned.append(line)
    return cleaned

lines1 = clean_lines(part1_raw)
lines2 = clean_lines(part2_raw)

print(f"Cleaned lines1: {len(lines1)}")
print(f"Cleaned lines2: {len(lines2)}")

if len(lines1) > 0 and len(lines2) > 0:
    full = "\n".join(lines1 + lines2)
    with open("/Users/akshay/Documents/Build/FitApp/fitapp/app/(tabs)/challenges.tsx", "w", encoding="utf-8") as out:
        out.write(full)
    print("Success! Restored challenges.tsx!")
else:
    print("Failed to find parts.")
