import os
import urllib.request
import hashlib
import zipfile

url = "https://github.com/protomaps/go-pmtiles/releases/download/v1.31.2/go-pmtiles_1.31.2_Windows_x86_64.zip"
dest_dir = r"C:\Users\ThinkPad\AppData\Local\Temp\pmtiles-tool"
os.makedirs(dest_dir, exist_ok=True)
zip_path = os.path.join(dest_dir, "go-pmtiles_1.31.2_Windows_x86_64.zip")

print(f"Downloading {url} to {zip_path}...")
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
with urllib.request.urlopen(req) as resp, open(zip_path, 'wb') as f:
    total = 0
    while True:
        chunk = resp.read(65536)
        if not chunk:
            break
        f.write(chunk)
        total += len(chunk)
print(f"Downloaded {total} bytes.")

# SHA-256
sha256 = hashlib.sha256()
with open(zip_path, 'rb') as f:
    while True:
        chunk = f.read(65536)
        if not chunk:
            break
        sha256.update(chunk)
digest = sha256.hexdigest()
print(f"SHA-256: {digest}")

# Inspect contents of zip
with zipfile.ZipFile(zip_path, 'r') as z:
    names = z.namelist()
    print(f"Zip contents: {names}")
    for item in names:
        if item.endswith("pmtiles.exe") or item == "pmtiles.exe":
            z.extract(item, dest_dir)
            print(f"Extracted {item} to {dest_dir}")

pmtiles_exe = os.path.join(dest_dir, "pmtiles.exe")
if os.path.exists(pmtiles_exe):
    print(f"pmtiles.exe ready at {pmtiles_exe}, size: {os.path.getsize(pmtiles_exe)} bytes")
else:
    print("Warning: pmtiles.exe not found!")
