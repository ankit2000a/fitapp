import json

log_path = "/Users/akshay/.gemini/antigravity-ide/brain/251427f2-de52-4c90-acc4-86bc1bf78deb/.system_generated/logs/transcript.jsonl"

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get('step_index')
            content = data.get('content', '')
            if step in [81, 91, 208, 210]:
                print(f"--- STEP {step} ---")
                print(content[:500])
                print("... truncated ...")
                print(content[-500:])
        except Exception as e:
            pass
