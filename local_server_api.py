"""
Local Server Status API
Provides real-time system metrics for the local server dashboard
"""

from flask import Flask, jsonify
from flask_cors import CORS
import psutil
import datetime

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests

@app.route('/api/local-server-status', methods=['GET'])
def get_local_server_status():
    try:
        # CPU Usage
        cpu_percent = psutil.cpu_percent(interval=1)
        
        # RAM Usage
        ram = psutil.virtual_memory()
        ram_used_gb = round(ram.used / (1024**3), 1)
        ram_total_gb = round(ram.total / (1024**3), 1)
        ram_percent = ram.percent
        
        # Disk Usage (C: drive on Windows, / on Linux)
        disk = psutil.disk_usage('/')
        disk_used_gb = round(disk.used / (1024**3), 1)
        disk_total_gb = round(disk.total / (1024**3), 1)
        disk_percent = round(disk.percent, 1)
        
        # System Uptime
        boot_time = psutil.boot_time()
        uptime_seconds = datetime.datetime.now().timestamp() - boot_time
        uptime_str = format_uptime(uptime_seconds)
        
        # Build Response
        response = {
            "status": "Operational",
            "timestamp": datetime.datetime.now().isoformat(),
            "cpu": round(cpu_percent, 1),
            "ram": {
                "used": f"{ram_used_gb}GB",
                "total": f"{ram_total_gb}GB",
                "percent": round(ram_percent, 1)
            },
            "disk": {
                "used": f"{disk_used_gb}GB",
                "total": f"{disk_total_gb}GB",
                "percent": disk_percent
            },
            "uptime": uptime_str
        }
        
        return jsonify(response), 200
        
    except Exception as e:
        return jsonify({
            "error": str(e),
            "status": "Error"
        }), 500


def format_uptime(seconds):
    """Convert seconds to human-readable uptime format"""
    days = int(seconds // 86400)
    hours = int((seconds % 86400) // 3600)
    minutes = int((seconds % 3600) // 60)
    
    if days > 0:
        return f"{days} Days, {hours} Hours"
    elif hours > 0:
        return f"{hours} Hours, {minutes} Mins"
    else:
        return f"{minutes} Minutes"


if __name__ == '__main__':
    print("🚀 Local Server Status API starting on http://localhost:5000")
    print("📊 Endpoint: http://localhost:5000/api/local-server-status")
    app.run(host='0.0.0.0', port=5000, debug=True)
