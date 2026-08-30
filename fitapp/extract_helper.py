with open("/Users/akshay/.gemini/antigravity-ide/brain/251427f2-de52-4c90-acc4-86bc1bf78deb/reconstructed_activity.tsx", "r") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    if "shouldShowFriendItem" in line:
        print(f"Line {idx+1}: {line.strip()}")
        start = max(0, idx - 10)
        end = min(len(lines), idx + 25)
        print("--- CONTEXT ---")
        for i in range(start, end):
            print(f"{i+1}: {lines[i]}", end="")
        print("---------------\n")
