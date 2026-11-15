import os

paths_to_check = ['.', '.sandbox', 'sandbox', '..']
found = []
for p in paths_to_check:
    if os.path.exists(p):
        for root, dirs, files in os.walk(p):
            for f in files:
                if '7z' in f.lower() or 'scrape' in f.lower():
                    found.append(os.path.join(root, f))

print('Found files:', found)
