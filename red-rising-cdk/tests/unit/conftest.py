import os
import sys
from pathlib import Path

# The lambda directory is deployed as a flat bundle rather than an installed
# package, so tests import its modules by path.
_LAMBDA_DIR = Path(__file__).resolve().parents[2] / "lambda"
sys.path.insert(0, str(_LAMBDA_DIR))

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("BOOKS_TABLE", "test-books")
os.environ.setdefault("REQUESTS_TABLE", "test-requests")
os.environ.setdefault("PROFILES_TABLE", "test-profiles")
os.environ.setdefault("NOTIFICATIONS_TABLE", "test-notifications")
os.environ.setdefault("PROGRESS_TABLE", "test-progress")
os.environ.setdefault("ANNOUNCEMENT_TABLE", "test-announcement")
os.environ.setdefault("AUDIT_LOG_TABLE", "test-audit")
os.environ.setdefault("COVERS_BUCKET", "test-covers")
os.environ.setdefault("FILES_BUCKET", "test-files")
os.environ.setdefault("SUPER_ADMIN_EMAILS", "admin@example.com")
