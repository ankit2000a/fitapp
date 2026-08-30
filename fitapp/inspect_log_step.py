import json

log_path = "/Users/akshay/.gemini/antigravity-ide/brain/251427f2-de52-4c90-acc4-86bc1bf78deb/.system_generated/logs/transcript.jsonl"

steps = [168, 172, 178, 182]

with open(log_path, 'r', encoding='utf-8') as f:
    for line in f:
        try:
            data = json.loads(line)
            step = data.get('step_index')
            if step in steps:
                print(f"--- Step {step} ---")
                for tc in data.get('tool_calls', []):
                    print("Tool Name:", tc.get('name'))
                    args = tc.get('args', {})
                    print("TargetFile:", args.get('TargetFile'))
                    print("Chunk sizes / Content length:", len(str(args)))
        except Exception as e:
            pass
