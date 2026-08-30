with open("/Users/akshay/.gemini/antigravity-ide/brain/251427f2-de52-4c90-acc4-86bc1bf78deb/reconstructed_activity.tsx", "r") as f:
    lines = f.readlines()
for i in range(840, 940):
    if i < len(lines):
        print(f"{i+1}: {lines[i]}", end="")
