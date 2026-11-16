import subprocess
import time
import os
import json

cli = r"C:\Users\ThinkPad\AppData\Local\Temp\pmtiles-tool\pmtiles.exe"
source_url = "https://build.protomaps.com/20261101.pmtiles"
bbox = "100.50,13.71,100.56,13.77"
out_dir = r"C:\D_Drive\terminter01\garage\project_ideas\basketball\backend\server\tiles"

variants = [
    ("pathumwan-z14.pmtiles", 14),
    ("pathumwan-z15.pmtiles", 15),
    ("pathumwan-z16.pmtiles", 16)
]

results = []

for filename, maxzoom in variants:
    out_path = os.path.join(out_dir, filename)
    cmd = [cli, "extract", source_url, out_path, f"--bbox={bbox}", f"--maxzoom={maxzoom}"]
    cmd_str = f'pmtiles extract {source_url} backend/server/tiles/{filename} --bbox={bbox} --maxzoom={maxzoom}'
    
    print(f"\n==========================================")
    print(f"Running: {cmd_str}")
    start = time.time()
    proc = subprocess.run(cmd, capture_output=True, text=True)
    duration = time.time() - start
    
    exit_code = proc.returncode
    stdout = proc.stdout
    stderr = proc.stderr
    print(f"Exit code: {exit_code}")
    print(f"Duration: {duration:.2f}s")
    if stderr:
        print(f"Stderr:\n{stderr.strip()}")
    if stdout:
        print(f"Stdout:\n{stdout.strip()}")
        
    size_bytes = os.path.getsize(out_path) if os.path.exists(out_path) else None
    print(f"Size: {size_bytes} bytes ({size_bytes / (1024*1024):.2f} MB)" if size_bytes else "File not found!")
    
    # Run show
    show_cmd = [cli, "show", out_path]
    show_proc = subprocess.run(show_cmd, capture_output=True, text=True)
    
    # Run verify
    verify_cmd = [cli, "verify", out_path]
    verify_proc = subprocess.run(verify_cmd, capture_output=True, text=True)
    
    results.append({
        "filename": filename,
        "maxzoom": maxzoom,
        "cmd": cmd_str,
        "exit_code": exit_code,
        "duration_sec": duration,
        "size_bytes": size_bytes,
        "extract_output": (stdout + "\n" + stderr).strip(),
        "show_output": (show_proc.stdout + "\n" + show_proc.stderr).strip(),
        "show_exit_code": show_proc.returncode,
        "verify_output": (verify_proc.stdout + "\n" + verify_proc.stderr).strip(),
        "verify_exit_code": verify_proc.returncode
    })

with open(os.path.join(out_dir, "extraction_results.json"), "w", encoding="utf-8") as f:
    json.dump(results, f, indent=2)

print("\nAll extractions completed!")
