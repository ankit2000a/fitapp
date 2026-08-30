import json
import re

log_path = "/Users/akshay/.gemini/antigravity-ide/brain/251427f2-de52-4c90-acc4-86bc1bf78deb/.system_generated/logs/transcript.jsonl"
output_path = "/Users/akshay/Documents/Build/FitApp/fitapp/app/(tabs)/challenges.tsx"

part1 = ""
part2 = ""

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            content = data.get('content', '')
            # Look for the output of the view_file calls in the step content
            if "Showing lines 1 to 800" in content:
                part1 = content
            elif "Showing lines 801 to 1445" in content:
                part2 = content
        except Exception as e:
            pass

def clean_content(raw):
    # Split raw output by lines
    lines = raw.split('\n')
    cleaned = []
    started = False
    for line in lines:
        if "Showing lines" in line:
            started = True
            continue
        if started:
            if "The above content" in line:
                break
            # Remove line number prefix, e.g., "1: import..." -> "import..."
            m = re.match(r'^\d+:\s(.*)', line)
            if m:
                cleaned.append(m.group(1))
            else:
                # If it's a line number with nothing after it, it is an empty line
                m_empty = re.match(r'^\d+:$', line)
                if m_empty:
                    cleaned.append("")
                else:
                    cleaned.append(line)
    return cleaned

lines1 = clean_content(part1)
lines2 = clean_content(part2)

print(f"Cleaned Part 1: {len(lines1)} lines")
print(f"Cleaned Part 2: {len(lines2)} lines")

full_content = "\n".join(lines1 + lines2)

with open(output_path, 'w', encoding='utf-8') as f:
    f.write(full_content)

print("Restored original challenges.tsx successfully!")
