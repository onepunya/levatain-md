import urllib.request
import urllib.parse
import re

url = 'https://lite.duckduckgo.com/lite/'
data = urllib.parse.urlencode({'q': 'black clover 4k wallpaper hd'}).encode('utf-8')
req = urllib.request.Request(url, data=data, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        links = re.findall(r'class="result-link"[^>]* href="([^"]+)"', html)
        print("Links:", links[:5])
except Exception as e:
    print("Error:", e)