"""Authorization regression tests for the findings raised in the security audit.

Each test here corresponds to a specific vulnerability that was fixed; a failure
means that vulnerability has been reintroduced.
"""
import json
from unittest.mock import MagicMock

import pytest

import consumer
import upload
import utils


def _event(resource, method="GET", path_params=None, claims=None, body=None):
    return {
        "resource": resource,
        "httpMethod": method,
        "pathParameters": path_params or {},
        "requestContext": {"authorizer": {"claims": claims or {}}},
        "body": json.dumps(body) if body is not None else None,
    }


def _claims(sub="user-1", email="reader@example.com", verified="true"):
    return {"sub": sub, "email": email, "email_verified": verified}


class TestAdminElevation:
    """Super-admin status must require a verified email, since Cognito emails
    are mutable and an unverified address proves nothing."""

    def test_verified_admin_email_is_elevated(self):
        ctx = utils.get_auth_context(_event("/x", claims=_claims(email="admin@example.com")))
        assert ctx["isSuperAdmin"] is True

    def test_unverified_admin_email_is_not_elevated(self):
        ctx = utils.get_auth_context(
            _event("/x", claims=_claims(email="admin@example.com", verified="false"))
        )
        assert ctx["isSuperAdmin"] is False

    def test_missing_verified_claim_is_not_elevated(self):
        claims = {"sub": "user-1", "email": "admin@example.com"}
        ctx = utils.get_auth_context(_event("/x", claims=claims))
        assert ctx["isSuperAdmin"] is False

    def test_ordinary_user_is_not_elevated(self):
        ctx = utils.get_auth_context(_event("/x", claims=_claims()))
        assert ctx["isSuperAdmin"] is False


class TestModerationOnVisibilityChange:
    """A private book is auto-approved on create, so flipping it to public must
    send it back to the review queue rather than inheriting that approval."""

    @pytest.fixture
    def books(self, monkeypatch):
        table = MagicMock()
        monkeypatch.setattr(consumer, "books_table", table)
        return table

    def _update_kwargs(self, books):
        assert books.update_item.called, "expected the book to be updated"
        return books.update_item.call_args.kwargs

    def test_private_to_public_resets_to_pending(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "user-1", "visibility": "private",
                     "moderationStatus": "approved"}
        }
        consumer.process_message({
            "operation": "UPDATE_BOOK", "bookId": "b1", "ownerId": "user-1",
            "visibility": "public",
        })
        kwargs = self._update_kwargs(books)
        assert kwargs["ExpressionAttributeValues"][":moderationStatus"] == "pending"

    def test_editing_an_already_public_book_keeps_its_approval(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "user-1", "visibility": "public",
                     "moderationStatus": "approved"}
        }
        consumer.process_message({
            "operation": "UPDATE_BOOK", "bookId": "b1", "ownerId": "user-1",
            "title": "New Title",
        })
        kwargs = self._update_kwargs(books)
        assert ":moderationStatus" not in kwargs["ExpressionAttributeValues"]

    def test_admin_publishing_does_not_require_re_review(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "someone-else", "visibility": "private",
                     "moderationStatus": "approved"}
        }
        consumer.process_message({
            "operation": "UPDATE_BOOK", "bookId": "b1", "ownerId": "admin",
            "visibility": "public", "isAdmin": True,
        })
        kwargs = self._update_kwargs(books)
        assert ":moderationStatus" not in kwargs["ExpressionAttributeValues"]

    def test_new_public_book_starts_pending(self, books):
        consumer.process_message({
            "operation": "CREATE_BOOK", "ownerId": "user-1", "visibility": "public",
            "title": "T",
        })
        item = books.put_item.call_args.kwargs["Item"]
        assert item["moderationStatus"] == "pending"


class TestFulfillRequestAuthorization:
    """Fulfilling a request must require owning the book being offered, or the
    endpoint becomes a way to close and corrupt anyone else's request."""

    @pytest.fixture
    def tables(self, monkeypatch):
        requests_table, books_table, notifications = MagicMock(), MagicMock(), MagicMock()
        monkeypatch.setattr(consumer, "requests_table", requests_table)
        monkeypatch.setattr(consumer, "books_table", books_table)
        monkeypatch.setattr(consumer, "notifications_table", notifications)
        return requests_table, books_table

    def test_owner_of_the_book_may_fulfill(self, tables):
        requests_table, books_table = tables
        requests_table.get_item.return_value = {
            "Item": {"requestId": "r1", "status": "open", "requesterId": "user-2", "title": "T"}
        }
        books_table.get_item.return_value = {"Item": {"bookId": "b1", "ownerId": "user-1"}}
        consumer.process_message({
            "operation": "FULFILL_REQUEST", "requestId": "r1",
            "fulfilledBookId": "b1", "fulfilledBy": "user-1",
        })
        assert requests_table.update_item.called

    def test_stranger_cannot_fulfill_with_someone_elses_book(self, tables):
        requests_table, books_table = tables
        requests_table.get_item.return_value = {
            "Item": {"requestId": "r1", "status": "open", "requesterId": "user-2"}
        }
        books_table.get_item.return_value = {"Item": {"bookId": "b1", "ownerId": "user-9"}}
        consumer.process_message({
            "operation": "FULFILL_REQUEST", "requestId": "r1",
            "fulfilledBookId": "b1", "fulfilledBy": "attacker",
        })
        assert not requests_table.update_item.called

    def test_invented_book_id_is_rejected(self, tables):
        requests_table, books_table = tables
        requests_table.get_item.return_value = {
            "Item": {"requestId": "r1", "status": "open", "requesterId": "user-2"}
        }
        books_table.get_item.return_value = {}
        consumer.process_message({
            "operation": "FULFILL_REQUEST", "requestId": "r1",
            "fulfilledBookId": "does-not-exist", "fulfilledBy": "attacker",
        })
        assert not requests_table.update_item.called

    def test_nonexistent_request_does_not_create_an_orphan_row(self, tables):
        requests_table, _ = tables
        requests_table.get_item.return_value = {}
        consumer.process_message({
            "operation": "FULFILL_REQUEST", "requestId": "nope",
            "fulfilledBookId": "b1", "fulfilledBy": "attacker",
        })
        assert not requests_table.update_item.called

    def test_already_fulfilled_request_is_not_reopened(self, tables):
        requests_table, books_table = tables
        requests_table.get_item.return_value = {
            "Item": {"requestId": "r1", "status": "fulfilled", "requesterId": "user-2"}
        }
        books_table.get_item.return_value = {"Item": {"bookId": "b1", "ownerId": "user-1"}}
        consumer.process_message({
            "operation": "FULFILL_REQUEST", "requestId": "r1",
            "fulfilledBookId": "b1", "fulfilledBy": "user-1",
        })
        assert not requests_table.update_item.called


class TestReadUrlModerationGate:
    """Rejecting a book must stop it being downloadable, including via the
    unauthenticated read endpoint."""

    @pytest.fixture
    def books(self, monkeypatch):
        table = MagicMock()
        monkeypatch.setattr(upload, "books_table", table)
        monkeypatch.setattr(upload.s3, "generate_presigned_url", lambda *a, **k: "https://signed")
        return table

    def _read(self, claims=None):
        return upload.lambda_handler(
            _event("/books/{bookId}/read", path_params={"bookId": "b1"}, claims=claims), None
        )

    def test_approved_public_book_is_readable_anonymously(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "u1", "visibility": "public",
                     "moderationStatus": "approved", "fileKey": "files/x.epub"}
        }
        assert self._read()["statusCode"] == 200

    def test_rejected_book_is_hidden_from_anonymous_callers(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "u1", "visibility": "public",
                     "moderationStatus": "rejected", "fileKey": "files/x.epub"}
        }
        assert self._read()["statusCode"] == 404

    def test_pending_book_is_hidden_from_anonymous_callers(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "u1", "visibility": "public",
                     "moderationStatus": "pending", "fileKey": "files/x.epub"}
        }
        assert self._read()["statusCode"] == 404

    def test_owner_may_still_read_their_pending_book(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "u1", "visibility": "public",
                     "moderationStatus": "pending", "fileKey": "files/x.epub"}
        }
        assert self._read(claims=_claims(sub="u1"))["statusCode"] == 200

    def test_books_predating_moderation_stay_readable(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "u1", "visibility": "public",
                     "fileKey": "files/x.epub"}
        }
        assert self._read()["statusCode"] == 200

    def test_private_book_is_denied_to_strangers(self, books):
        books.get_item.return_value = {
            "Item": {"bookId": "b1", "ownerId": "u1", "visibility": "private",
                     "moderationStatus": "approved", "fileKey": "files/x.epub"}
        }
        assert self._read(claims=_claims(sub="someone-else"))["statusCode"] == 403


class TestUploadTypeAllowlist:
    """The covers bucket is world-readable, so the content type S3 will serve
    must come from a fixed map rather than from the caller."""

    @pytest.fixture(autouse=True)
    def _signed(self, monkeypatch):
        monkeypatch.setattr(upload.s3, "generate_presigned_url", lambda *a, **k: "https://signed")

    def _upload(self, resource, body):
        return upload.lambda_handler(
            _event(resource, method="POST", claims=_claims(), body=body), None
        )

    @pytest.mark.parametrize("ext,expected", [
        ("jpg", "image/jpeg"), ("jpeg", "image/jpeg"),
        ("png", "image/png"), ("webp", "image/webp"),
    ])
    def test_permitted_cover_types_are_signed_with_canonical_mime(self, ext, expected):
        resp = self._upload("/upload/cover", {"extension": ext, "contentType": "text/html"})
        assert resp["statusCode"] == 200
        assert json.loads(resp["body"])["contentType"] == expected

    @pytest.mark.parametrize("ext", ["svg", "html", "htm", "js", "xml", "exe"])
    def test_dangerous_cover_types_are_rejected(self, ext):
        resp = self._upload("/upload/cover", {"extension": ext, "contentType": "image/svg+xml"})
        assert resp["statusCode"] == 400

    def test_oversized_cover_is_rejected(self):
        resp = self._upload("/upload/cover", {"extension": "png", "fileSizeBytes": 20 * 1024 * 1024})
        assert resp["statusCode"] == 400

    @pytest.mark.parametrize("ext,expected", [
        ("pdf", "application/pdf"), ("epub", "application/epub+zip"),
    ])
    def test_permitted_book_types_are_signed_with_canonical_mime(self, ext, expected):
        resp = self._upload("/upload/book", {"extension": ext, "contentType": "text/html"})
        assert resp["statusCode"] == 200
        assert json.loads(resp["body"])["contentType"] == expected

    @pytest.mark.parametrize("ext", ["html", "svg", "js"])
    def test_dangerous_book_types_are_rejected(self, ext):
        resp = self._upload("/upload/book", {"extension": ext, "contentType": "text/html"})
        assert resp["statusCode"] == 400

    def test_oversized_book_is_rejected(self):
        resp = self._upload("/upload/book", {"extension": "pdf", "fileSizeBytes": 200 * 1024 * 1024})
        assert resp["statusCode"] == 400

    def test_upload_requires_authentication(self):
        resp = upload.lambda_handler(
            _event("/upload/cover", method="POST", body={"extension": "png"}), None
        )
        assert resp["statusCode"] == 401


class TestLastAdminCannotBeRemoved:
    """Deleting or disabling the only super-admin locks everyone out of the
    panel permanently - the allowlist is matched on email, so there is no
    in-app route back once that account is gone. The Users table showed no
    hint that a row was special and every row had an active delete button.
    Enforced server-side because hiding the button leaves the endpoint open."""

    ADMIN_EMAIL = "admin@example.com"
    PROFILES = {
        "admin-id": {"email": ADMIN_EMAIL},
        "normal-id": {"email": "reader@example.com"},
    }

    @pytest.fixture
    def admin_mod(self, monkeypatch):
        import admin as admin_mod
        monkeypatch.setattr(utils, "SUPER_ADMIN_EMAILS", [self.ADMIN_EMAIL], raising=False)
        monkeypatch.setattr(admin_mod, "SUPER_ADMIN_EMAILS", [self.ADMIN_EMAIL], raising=False)
        monkeypatch.setattr(admin_mod, "_resolve_username",
                            lambda uid: self.PROFILES.get(uid, {}).get("email", uid))
        monkeypatch.setattr(admin_mod, "profiles_table", None)
        monkeypatch.setattr(admin_mod, "audit_log_table", None)
        cognito = MagicMock()
        monkeypatch.setattr(admin_mod, "cognito_client", cognito)
        admin_mod._test_cognito = cognito
        return admin_mod

    def _other_admin(self):
        return {"userId": "other-id", "email": "other@example.com"}

    def test_cannot_delete_own_account(self, admin_mod):
        me = {"userId": "admin-id", "email": self.ADMIN_EMAIL}
        resp = admin_mod.delete_user("admin-id", me)
        assert resp["statusCode"] == 400
        assert "your own" in json.loads(resp["body"])["error"].lower()
        admin_mod._test_cognito.admin_delete_user.assert_not_called()

    def test_cannot_delete_another_admin(self, admin_mod):
        resp = admin_mod.delete_user("admin-id", self._other_admin())
        assert resp["statusCode"] == 400
        admin_mod._test_cognito.admin_delete_user.assert_not_called()

    def test_cannot_disable_an_admin(self, admin_mod):
        resp = admin_mod.toggle_user("admin-id", True, self._other_admin())
        assert resp["statusCode"] == 400
        admin_mod._test_cognito.admin_disable_user.assert_not_called()

    def test_enabling_an_admin_is_still_allowed(self, admin_mod):
        # Re-enabling is not destructive and must not be blocked.
        resp = admin_mod.toggle_user("admin-id", False, self._other_admin())
        assert resp["statusCode"] == 200
        admin_mod._test_cognito.admin_enable_user.assert_called_once()

    def test_normal_users_are_unaffected(self, admin_mod):
        resp = admin_mod.delete_user("normal-id", self._other_admin())
        assert resp["statusCode"] == 200
        admin_mod._test_cognito.admin_delete_user.assert_called_once()

    def test_bulk_delete_skips_admins_but_deletes_the_rest(self, admin_mod):
        resp = admin_mod.batch_delete_users(["admin-id", "normal-id"], self._other_admin())
        body = json.loads(resp["body"])
        assert body["deleted"] == ["normal-id"]
        assert body["protected"] == ["admin-id"]
        called = [c.kwargs["Username"] for c in admin_mod._test_cognito.admin_delete_user.call_args_list]
        assert self.ADMIN_EMAIL not in called

    def test_guard_fails_closed_when_lookup_breaks(self, admin_mod, monkeypatch):
        # If we cannot tell whether a target is an admin, refuse rather than
        # risk the lockout.
        def boom(uid): raise RuntimeError("profiles unavailable")
        monkeypatch.setattr(admin_mod, "_resolve_username", boom)
        resp = admin_mod.delete_user("normal-id", self._other_admin())
        assert resp["statusCode"] == 400
        admin_mod._test_cognito.admin_delete_user.assert_not_called()
