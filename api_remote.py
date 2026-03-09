from flask import Flask, jsonify
from flask_cors import CORS
import psutil
import datetime
import urllib.request

app = Flask(__name__)
CORS(app)

@app.route("/api/local-server-status")
def status():
    cpu_percent = psutil.cpu_percent(interval=1)
    ram = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    btime = psutil.boot_time()
    usec = datetime.datetime.now().timestamp() - btime
    days = int(usec // 86400)
    hours = int((usec % 86400) // 3600)
    mins = int((usec % 3600) // 60)
    ustr = f"{days}d {hours}h" if days>0 else f"{hours}h {mins}m"
    conn = 0
    try:
        r = urllib.request.urlopen("http://127.0.0.1/nginx_status", timeout=2)
        for l in r.read().decode().split("\n"):
            if l.startswith("Active connections:"): conn = int(l.split(":")[1].strip())
    except: pass
    return jsonify({"status": "Operational", "cpu": round(cpu_percent,1), "ram": {"used": f"{round(ram.used/(1024**3),1)}GB", "total": f"{round(ram.total/(1024**3),1)}GB", "percent": round(ram.percent,1)}, "disk": {"used": f"{round(disk.used/(1024**3),1)}GB", "total": f"{round(disk.total/(1024**3),1)}GB", "percent": round(disk.percent,1)}, "uptime": ustr, "connections": conn})

if __name__=="__main__": app.run(host="0.0.0.0", port=5000)
