import urllib.request
import datetime

today = datetime.date(2026, 11, 2)
print(f"Checking Protomaps daily planet builds starting from {today}...")

found = None
for i in range(30):
    d = today - datetime.timedelta(days=i)
    ymd = d.strftime('%Y%m%d')
    url = f"https://build.protomaps.com/{ymd}.pmtiles"
    
    # Test Range request (bytes=0-1023)
    req = urllib.request.Request(url, headers={'Range': 'bytes=0-1023', 'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            status = resp.status
            content_range = resp.headers.get('Content-Range')
            content_len = resp.headers.get('Content-Length')
            print(f"FOUND: {ymd} -> Status {status}, Content-Range: {content_range}, Length: {content_len}")
            found = (ymd, url)
            break
    except urllib.error.HTTPError as e:
        print(f"{ymd}: HTTP {e.code}")
    except Exception as e:
        print(f"{ymd}: Error {e}")

if found:
    print(f"\nNewest available build is: {found[1]}")
else:
    print("\nNo build found in the last 30 days.")
