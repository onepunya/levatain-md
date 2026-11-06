import urllib.request
import urllib.parse
import re

query = urllib.parse.urlencode({'q': 'black clover 4k wallpaper hd'})
url = f'https://html.duckduckgo.com/html/?{query}'
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        links = re.findall(r'class="result__url"[^>]*>([^<]+)<', html)
        print("Links found:", links[:5])
except Exception as e:
    print("Error:", e)
