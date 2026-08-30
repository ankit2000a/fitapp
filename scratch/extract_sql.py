import re
import os

path = '/Users/akshay/.gemini/antigravity-ide/brain/032a8405-e5ed-4b1e-948b-4f3c87c34308/implementation_plan.md'
if os.path.exists(path):
    with open(path, 'r') as f:
        text = f.read()
    # Find all sql blocks
    blocks = re.findall(r'```sql(.*?)```', text, re.DOTALL)
    for i, block in enumerate(blocks):
        if 'ensure_active_challenges' in block:
            match = re.search(r'(create or replace function public\.ensure_active_challenges.*?)\$\$ language plpgsql', block, re.DOTALL | re.IGNORECASE)
            if match:
                func_text = match.group(1) + "$$ language plpgsql;"
                with open('/Users/akshay/Documents/Build/FitApp/scratch/ensure_active_challenges.sql', 'w') as out:
                    out.write(func_text)
                print("Extracted function to scratch/ensure_active_challenges.sql successfully!")
            else:
                print("Could not find function text inside block.")
else:
    print("Path does not exist:", path)
