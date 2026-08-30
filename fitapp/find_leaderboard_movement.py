import json

log_path = "/Users/akshay/.gemini/antigravity-ide/brain/251427f2-de52-4c90-acc4-86bc1bf78deb/.system_generated/logs/transcript.jsonl"

with open(log_path, 'r') as f:
    for line in f:
        step = json.loads(line)
        idx = step.get("step_index")
        content = str(step.get("content", "")) + str(step.get("tool_calls", ""))
        if "getLeaderboardMovement" in content and "const getLeaderboardMovement" in content:
            print(f"FOUND Definition in Step {idx}")
            with open(f"/Users/akshay/.gemini/antigravity-ide/brain/251427f2-de52-4c90-acc4-86bc1bf78deb/scratch/step_{idx}_leaderboardMovement.json", "w") as out:
                out.write(json.dumps(step, indent=2))
            break
