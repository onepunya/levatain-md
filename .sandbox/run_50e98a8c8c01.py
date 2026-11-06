import urllib.request
import json

req = urllib.request.Request(
    'https://html.duckduckgo.com/html/?q=black+clover+4k+wallpaper+hd',
    headers={'User-Agent': 'Mozilla/5.0'}
)
try:
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        print(html[:1000])
except Exception as e:
    print(e)