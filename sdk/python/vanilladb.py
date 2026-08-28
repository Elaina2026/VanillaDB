import json
import requests

class VanillaDatabase:
    """
    VanillaDatabase Python SDK
    Supports Raw SQL Query, Batch Transactions, Media Storage, and Realtime Events.
    """
    def __init__(self, url: str, token: str):
        if not url:
            raise ValueError("VanillaDatabase: url is required")
        if not token:
            raise ValueError("VanillaDatabase: token is required")
        self.url = url.rstrip('/')
        self.token = token
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "VanillaDatabase-PythonSDK/1.0"
        }

    def query(self, sql: str, params: list = None):
        """Execute a parameterized SQL query."""
        endpoint = self.url if self.url.endswith('/query') else f"{self.url}/query"
        payload = {"sql": sql, "params": params or []}
        res = requests.post(endpoint, headers=self.headers, json=payload)
        res.raise_for_status()
        data = res.json()
        if not data.get("success"):
            raise Exception(data.get("error", {}).get("message", "Query execution error"))
        return data.get("data")

    def batch(self, statements: list, transaction: bool = True):
        """Execute multiple statements atomically."""
        endpoint = self.url if self.url.endswith('/batch') else f"{self.url}/batch"
        payload = {"statements": statements, "transaction": transaction}
        res = requests.post(endpoint, headers=self.headers, json=payload)
        res.raise_for_status()
        data = res.json()
        if not data.get("success"):
            raise Exception(data.get("error", {}).get("message", "Batch execution error"))
        return data.get("data")

    def list_files(self):
        """List stored media files."""
        base = self.url.replace('/query', '').replace('/batch', '')
        res = requests.get(f"{base}/files", headers=self.headers)
        res.raise_for_status()
        return res.json().get("data")

    def get_file_url(self, file_id: str) -> str:
        """Get stream/download URL for file."""
        base = self.url.split('/v1/')[0]
        return f"{base}/v1/files/{file_id}/view"

    def upload_file(self, file_path_or_bytes, filename: str, content_type: str = "application/octet-stream"):
        """Upload a file to database media storage."""
        base = self.url.replace('/query', '').replace('/batch', '')
        upload_headers = {"Authorization": f"Bearer {self.token}"}

        if isinstance(file_path_or_bytes, str):
            with open(file_path_or_bytes, 'rb') as f:
                files = {'file': (filename, f, content_type)}
                res = requests.post(f"{base}/files", headers=upload_headers, files=files)
        else:
            files = {'file': (filename, file_path_or_bytes, content_type)}
            res = requests.post(f"{base}/files", headers=upload_headers, files=files)

        res.raise_for_status()
        data = res.json()
        if not data.get("success"):
            raise Exception(data.get("error", {}).get("message", "Upload failed"))
        return data.get("data")
