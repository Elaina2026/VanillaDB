import json
import requests
from typing import List, Dict, Any, Optional, Callable

class TableQueryBuilder:
    """Fluent CRUD interface for a specific database table."""
    def __init__(self, client: 'VanillaDatabase', table_name: str):
        self.client = client
        self.table_name = table_name

    def select(self, limit: int = 100, offset: int = 0, order_by: Optional[str] = None, order: str = 'ASC') -> Dict[str, Any]:
        """Fetch rows from table."""
        base = self.client.get_base_url()
        params = {"limit": limit, "offset": offset, "order": order}
        if order_by:
            params["orderBy"] = order_by
        res = requests.get(f"{base}/tables/{self.table_name}/rows", headers=self.client.headers, params=params)
        res.raise_for_status()
        data = res.json()
        if not data.get("success"):
            raise Exception(data.get("error", {}).get("message", "Select rows failed"))
        return data.get("data")

    def insert(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """Insert a row into table."""
        base = self.client.get_base_url()
        res = requests.post(f"{base}/tables/{self.table_name}/rows", headers=self.client.headers, json=row)
        res.raise_for_status()
        data = res.json()
        if not data.get("success"):
            raise Exception(data.get("error", {}).get("message", "Insert row failed"))
        return data.get("data")

    def delete(self, condition: Dict[str, Any]) -> Dict[str, Any]:
        """Delete rows by primary key or condition."""
        base = self.client.get_base_url()
        res = requests.delete(f"{base}/tables/{self.table_name}/rows", headers=self.client.headers, params=condition)
        res.raise_for_status()
        data = res.json()
        if not data.get("success"):
            raise Exception(data.get("error", {}).get("message", "Delete rows failed"))
        return data.get("data")

class VanillaDatabase:
    """
    VanillaDatabase Python SDK
    Supports Raw SQL Query, Table CRUD Builder, Batch Transactions, Vector Search, Media Storage, and Realtime Events.
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
            "User-Agent": "VanillaDatabase-PythonSDK/1.2.0"
        }

    def get_base_url(self) -> str:
        return self.url.replace('/query', '').replace('/batch', '').replace('/files', '').replace('/realtime', '')

    def table(self, table_name: str) -> TableQueryBuilder:
        """Get table CRUD query builder."""
        return TableQueryBuilder(self, table_name)

    def from_table(self, table_name: str) -> TableQueryBuilder:
        """Alias for table()."""
        return TableQueryBuilder(self, table_name)

    def vector_search(self, table: str, vector_column: str, vector: List[float], limit: int = 10, select: str = "*", threshold: Optional[float] = None) -> List[Dict[str, Any]]:
        """Vector Cosine Similarity RAG / AI Search."""
        vec_json = json.dumps(vector)
        sql = f'SELECT {select}, vec_cosine_similarity({vector_column}, ?) as similarity FROM "{table}"'
        params = [vec_json]

        if threshold is not None:
            sql += " WHERE similarity >= ?"
            params.append(threshold)

        sql += " ORDER BY similarity DESC LIMIT ?"
        params.append(limit)

        result = self.query(sql, params)
        return result.get("rows", [])

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
        base = self.get_base_url()
        res = requests.get(f"{base}/files", headers=self.headers)
        res.raise_for_status()
        return res.json().get("data")

    def get_file_url(self, file_id: str) -> str:
        """Get stream/download URL for file."""
        base = self.url.split('/v1/')[0]
        return f"{base}/v1/files/{file_id}/view"

    def upload_file(self, file_path_or_bytes, filename: str, content_type: str = "application/octet-stream"):
        """Upload a file to database media storage."""
        base = self.get_base_url()
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

    def delete_file(self, file_id: str) -> bool:
        """Delete a file from database media storage."""
        base = self.get_base_url()
        res = requests.delete(f"{base}/files/{file_id}", headers=self.headers)
        res.raise_for_status()
        data = res.json()
        if not data.get("success"):
            raise Exception(data.get("error", {}).get("message", "Delete file failed"))
        return True

    def subscribe(self, callback: Callable[[Dict[str, Any]], None], table: Optional[str] = None):
        """Subscribe to Realtime SSE event stream (blocking generator / worker)."""
        base = self.get_base_url()
        url = f"{base}/realtime?token={self.token}"
        if table:
            url += f"&table={table}"

        with requests.get(url, headers={"Accept": "text/event-stream"}, stream=True) as response:
            response.raise_for_status()
            for line in response.iter_lines(decode_unicode=True):
                if line and line.startswith("data: "):
                    try:
                        payload = json.loads(line[6:])
                        if payload.get("type") != "ping":
                            callback(payload)
                    except Exception:
                        pass

