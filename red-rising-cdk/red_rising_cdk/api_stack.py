import os
import json
from aws_cdk import (
    Stack,
    Duration,
    CfnOutput,
    aws_lambda as _lambda,
    aws_lambda_event_sources as lambda_events,
    aws_apigateway as apigw,
    aws_cognito as cognito,
    aws_iam as iam,
)
from constructs import Construct

# Super-admin allowlist shared with the frontend (frontend/src/config/adminConfig.json).
_ADMIN_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "src", "config", "adminConfig.json")
with open(_ADMIN_CONFIG_PATH) as _f:
    _SUPER_ADMIN_EMAILS = ",".join(json.load(_f)["superAdminEmails"])

class ObsidianApiStack(Stack):

    def __init__(
        self,
        scope: Construct,
        construct_id: str,
        user_pool,
        books_table,
        profiles_table,
        requests_table,
        notifications_table,
        progress_table,
        audit_log_table,
        announcement_table,
        covers_bucket,
        files_bucket,
        queue,
        stage: str = "prod",
        **kwargs
    ) -> None:
        super().__init__(scope, construct_id, **kwargs)

        def n(base: str) -> str:
            return base if stage == "prod" else f"{base}-{stage}"

        shared_code = _lambda.Code.from_asset("lambda")

        common_env = {
            "BOOKS_TABLE": books_table.table_name,
            "PROFILES_TABLE": profiles_table.table_name,
            "REQUESTS_TABLE": requests_table.table_name,
            "NOTIFICATIONS_TABLE": notifications_table.table_name,
            "COVERS_BUCKET": covers_bucket.bucket_name,
            "FILES_BUCKET": files_bucket.bucket_name,
            "PROGRESS_TABLE": progress_table.table_name,
            "ANNOUNCEMENT_TABLE": announcement_table.table_name,
            "SUPER_ADMIN_EMAILS": _SUPER_ADMIN_EMAILS,
        }

        # ── 1. LAMBDA FUNCTIONS ──

        # 1a. Writer: API Gateway POST → SQS
        writer_fn = _lambda.Function(
            self, "WriterFn",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="writer.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment={**common_env, "QUEUE_URL": queue.queue_url},
        )
        queue.grant_send_messages(writer_fn)

        # 1b. Consumer: SQS → DynamoDB + S3 cleanup
        consumer_fn = _lambda.Function(
            self, "ConsumerFn",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="consumer.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(60),
            environment=common_env,
        )
        books_table.grant_read_write_data(consumer_fn)
        profiles_table.grant_read_write_data(consumer_fn)
        requests_table.grant_read_write_data(consumer_fn)
        notifications_table.grant_read_write_data(consumer_fn)
        covers_bucket.grant_read_write(consumer_fn)
        files_bucket.grant_read_write(consumer_fn)
        consumer_fn.add_event_source(
            lambda_events.SqsEventSource(queue, batch_size=5)
        )

        # 1c. Reader: API Gateway GET → DynamoDB reads
        reader_fn = _lambda.Function(
            self, "ReaderFn",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="reader.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        books_table.grant_read_data(reader_fn)
        requests_table.grant_read_data(reader_fn)
        notifications_table.grant_read_data(reader_fn)
        announcement_table.grant_read_data(reader_fn)

        # 1d. Upload: Presigned URLs for covers, book files, and reader streaming
        upload_fn = _lambda.Function(
            self, "UploadFn",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="upload.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        covers_bucket.grant_read_write(upload_fn)
        files_bucket.grant_read_write(upload_fn)
        books_table.grant_read_data(upload_fn)

        # 1e. Profile: User profile CRUD
        profile_fn = _lambda.Function(
            self, "ProfileFn",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="profile.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        profiles_table.grant_read_write_data(profile_fn)

        # 1f. Progress: cross-device reading progress
        progress_fn = _lambda.Function(
            self, "ProgressFn",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="progress.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        progress_table.grant_read_write_data(progress_fn)

        # 1g. Admin: super-admin only management panel.
        # Split across two identical Lambdas (same code/handler — admin.py's
        # router dispatches purely on event resource+method, so which physical
        # function runs it is irrelevant) because API Gateway creates one
        # AWS::Lambda::Permission per route pointing at a function, and with
        # ~24 admin routes on a single Lambda that resource policy blew past
        # the 20KB hard limit AWS imposes on it.
        admin_env = {**common_env, "USER_POOL_ID": user_pool.user_pool_id, "AUDIT_LOG_TABLE": audit_log_table.table_name}

        # Fn A: stats, audit log, announcement, users (needs Cognito Admin* API access)
        admin_fn = _lambda.Function(
            self, "AdminFn",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="admin.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(30),
            environment=admin_env,
        )
        books_table.grant_read_write_data(admin_fn)
        requests_table.grant_read_write_data(admin_fn)
        profiles_table.grant_read_write_data(admin_fn)
        notifications_table.grant_read_write_data(admin_fn)
        audit_log_table.grant_read_write_data(admin_fn)
        announcement_table.grant_read_write_data(admin_fn)
        covers_bucket.grant_read_write(admin_fn)
        files_bucket.grant_read_write(admin_fn)
        admin_fn.add_to_role_policy(iam.PolicyStatement(
            actions=[
                "cognito-idp:ListUsers",
                "cognito-idp:AdminDisableUser",
                "cognito-idp:AdminEnableUser",
                "cognito-idp:AdminGetUser",
                "cognito-idp:AdminCreateUser",
                "cognito-idp:AdminUpdateUserAttributes",
                "cognito-idp:AdminDeleteUser",
            ],
            resources=[user_pool.user_pool_arn],
        ))

        # Fn B: books + requests moderation/CRUD (no Cognito access needed)
        admin_books_fn = _lambda.Function(
            self, "AdminBooksFn",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="admin.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(30),
            environment=admin_env,
        )
        books_table.grant_read_write_data(admin_books_fn)
        requests_table.grant_read_write_data(admin_books_fn)
        profiles_table.grant_read_write_data(admin_books_fn)
        notifications_table.grant_read_write_data(admin_books_fn)
        audit_log_table.grant_read_write_data(admin_books_fn)
        covers_bucket.grant_read_write(admin_books_fn)
        files_bucket.grant_read_write(admin_books_fn)

        # ── 2. API GATEWAY ──
        api = apigw.RestApi(
            self, "ObsidianApi",
            rest_api_name=n("obsidian-archive-api"),
            deploy_options=apigw.StageOptions(stage_name="prod"),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"],
            ),
        )

        cognito_authorizer = apigw.CognitoUserPoolsAuthorizer(
            self, "CognitoAuthorizer",
            cognito_user_pools=[user_pool],
            authorizer_name="ObsidianCognitoAuth",
        )

        # ── /announcement (public GET — platform-wide banner, no auth needed) ──
        announcement_res = api.root.add_resource("announcement")
        announcement_res.add_method("GET", apigw.LambdaIntegration(reader_fn))

        # ── /books (public GET, authenticated POST) ──
        books = api.root.add_resource("books")
        books.add_method("GET", apigw.LambdaIntegration(reader_fn))
        books.add_method("POST", apigw.LambdaIntegration(writer_fn),
                         authorizer=cognito_authorizer,
                         authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /books/mine (authenticated GET) ──
        books_mine = books.add_resource("mine")
        books_mine.add_method("GET", apigw.LambdaIntegration(reader_fn),
                              authorizer=cognito_authorizer,
                              authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /books/{bookId} (public GET, authenticated PUT/DELETE) ──
        book_by_id = books.add_resource("{bookId}")
        book_by_id.add_method("GET", apigw.LambdaIntegration(reader_fn))

        # ── /books/{bookId}/auth (authenticated details) ──
        book_by_id_auth = book_by_id.add_resource("auth")
        book_by_id_auth.add_method("GET", apigw.LambdaIntegration(reader_fn),
                                   authorizer=cognito_authorizer,
                                   authorization_type=apigw.AuthorizationType.COGNITO)
        book_by_id.add_method("PUT", apigw.LambdaIntegration(writer_fn),
                              authorizer=cognito_authorizer,
                              authorization_type=apigw.AuthorizationType.COGNITO)
        book_by_id.add_method("DELETE", apigw.LambdaIntegration(writer_fn),
                              authorizer=cognito_authorizer,
                              authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /books/{bookId}/read (public — no auth) ──
        book_read = book_by_id.add_resource("read")
        book_read.add_method("GET", apigw.LambdaIntegration(upload_fn))

        # ── /books/{bookId}/read-auth (authenticated) ──
        book_read_auth = book_by_id.add_resource("read-auth")
        book_read_auth.add_method("GET", apigw.LambdaIntegration(upload_fn),
                                  authorizer=cognito_authorizer,
                                  authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /upload/cover (authenticated) ──
        upload_res = api.root.add_resource("upload")
        upload_cover = upload_res.add_resource("cover")
        upload_cover.add_method("POST", apigw.LambdaIntegration(upload_fn),
                                authorizer=cognito_authorizer,
                                authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /upload/book (authenticated) ──
        upload_book = upload_res.add_resource("book")
        upload_book.add_method("POST", apigw.LambdaIntegration(upload_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /requests (authenticated GET/POST) ──
        requests_res = api.root.add_resource("requests")
        requests_res.add_method("GET", apigw.LambdaIntegration(reader_fn),
                                authorizer=cognito_authorizer,
                                authorization_type=apigw.AuthorizationType.COGNITO)
        requests_res.add_method("POST", apigw.LambdaIntegration(writer_fn),
                                authorizer=cognito_authorizer,
                                authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /requests/{requestId} (authenticated PUT/DELETE) ──
        request_by_id = requests_res.add_resource("{requestId}")
        request_by_id.add_method("PUT", apigw.LambdaIntegration(writer_fn),
                                 authorizer=cognito_authorizer,
                                 authorization_type=apigw.AuthorizationType.COGNITO)
        request_by_id.add_method("DELETE", apigw.LambdaIntegration(writer_fn),
                                 authorizer=cognito_authorizer,
                                 authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /profile (authenticated GET/PUT) ──
        profile_res = api.root.add_resource("profile")
        profile_res.add_method("GET", apigw.LambdaIntegration(profile_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)
        profile_res.add_method("PUT", apigw.LambdaIntegration(profile_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)
        profile_res.add_method("DELETE", apigw.LambdaIntegration(profile_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /progress (authenticated GET — list) ──
        progress_res = api.root.add_resource("progress")
        progress_res.add_method("GET", apigw.LambdaIntegration(progress_fn),
                                authorizer=cognito_authorizer,
                                authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /progress/{bookId} (authenticated PUT/DELETE — upsert/remove) ──
        progress_by_id = progress_res.add_resource("{bookId}")
        progress_by_id.add_method("PUT", apigw.LambdaIntegration(progress_fn),
                                  authorizer=cognito_authorizer,
                                  authorization_type=apigw.AuthorizationType.COGNITO)
        progress_by_id.add_method("DELETE", apigw.LambdaIntegration(progress_fn),
                                  authorizer=cognito_authorizer,
                                  authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /notifications (authenticated GET/PUT) ──
        notifications_res = api.root.add_resource("notifications")
        notifications_res.add_method("GET", apigw.LambdaIntegration(reader_fn),
                                     authorizer=cognito_authorizer,
                                     authorization_type=apigw.AuthorizationType.COGNITO)
        notifications_res.add_method("PUT", apigw.LambdaIntegration(writer_fn),
                                     authorizer=cognito_authorizer,
                                     authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /admin/* (super-admin only — auth enforced in Lambda too) ──
        admin_res = api.root.add_resource("admin")

        admin_stats = admin_res.add_resource("stats")
        admin_stats.add_method("GET", apigw.LambdaIntegration(admin_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)

        admin_audit_log = admin_res.add_resource("audit-log")
        admin_audit_log.add_method("GET", apigw.LambdaIntegration(admin_fn),
                                   authorizer=cognito_authorizer,
                                   authorization_type=apigw.AuthorizationType.COGNITO)

        admin_announcement = admin_res.add_resource("announcement")
        admin_announcement.add_method("PUT", apigw.LambdaIntegration(admin_fn),
                                      authorizer=cognito_authorizer,
                                      authorization_type=apigw.AuthorizationType.COGNITO)
        admin_announcement.add_method("DELETE", apigw.LambdaIntegration(admin_fn),
                                      authorizer=cognito_authorizer,
                                      authorization_type=apigw.AuthorizationType.COGNITO)

        admin_users = admin_res.add_resource("users")
        admin_users.add_method("GET", apigw.LambdaIntegration(admin_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)
        admin_users.add_method("POST", apigw.LambdaIntegration(admin_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)

        admin_users_batch_delete = admin_users.add_resource("batch-delete")
        admin_users_batch_delete.add_method("POST", apigw.LambdaIntegration(admin_fn),
                                            authorizer=cognito_authorizer,
                                            authorization_type=apigw.AuthorizationType.COGNITO)

        admin_user_by_id = admin_users.add_resource("{userId}")
        admin_user_by_id.add_method("PUT", apigw.LambdaIntegration(admin_fn),
                                    authorizer=cognito_authorizer,
                                    authorization_type=apigw.AuthorizationType.COGNITO)
        admin_user_by_id.add_method("DELETE", apigw.LambdaIntegration(admin_fn),
                                    authorizer=cognito_authorizer,
                                    authorization_type=apigw.AuthorizationType.COGNITO)
        admin_user_disable = admin_user_by_id.add_resource("disable")
        admin_user_disable.add_method("PUT", apigw.LambdaIntegration(admin_fn),
                                      authorizer=cognito_authorizer,
                                      authorization_type=apigw.AuthorizationType.COGNITO)
        admin_user_enable = admin_user_by_id.add_resource("enable")
        admin_user_enable.add_method("PUT", apigw.LambdaIntegration(admin_fn),
                                     authorizer=cognito_authorizer,
                                     authorization_type=apigw.AuthorizationType.COGNITO)

        admin_books = admin_res.add_resource("books")
        admin_books.add_method("GET", apigw.LambdaIntegration(admin_books_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)
        admin_books.add_method("POST", apigw.LambdaIntegration(admin_books_fn),
                               authorizer=cognito_authorizer,
                               authorization_type=apigw.AuthorizationType.COGNITO)
        admin_books_batch_delete = admin_books.add_resource("batch-delete")
        admin_books_batch_delete.add_method("POST", apigw.LambdaIntegration(admin_books_fn),
                                            authorizer=cognito_authorizer,
                                            authorization_type=apigw.AuthorizationType.COGNITO)

        admin_book_by_id = admin_books.add_resource("{bookId}")
        admin_book_by_id.add_method("PUT", apigw.LambdaIntegration(admin_books_fn),
                                    authorizer=cognito_authorizer,
                                    authorization_type=apigw.AuthorizationType.COGNITO)
        admin_book_by_id.add_method("DELETE", apigw.LambdaIntegration(admin_books_fn),
                                    authorizer=cognito_authorizer,
                                    authorization_type=apigw.AuthorizationType.COGNITO)
        admin_book_approve = admin_book_by_id.add_resource("approve")
        admin_book_approve.add_method("PUT", apigw.LambdaIntegration(admin_books_fn),
                                      authorizer=cognito_authorizer,
                                      authorization_type=apigw.AuthorizationType.COGNITO)
        admin_book_reject = admin_book_by_id.add_resource("reject")
        admin_book_reject.add_method("PUT", apigw.LambdaIntegration(admin_books_fn),
                                     authorizer=cognito_authorizer,
                                     authorization_type=apigw.AuthorizationType.COGNITO)

        admin_requests = admin_res.add_resource("requests")
        admin_requests.add_method("GET", apigw.LambdaIntegration(admin_books_fn),
                                  authorizer=cognito_authorizer,
                                  authorization_type=apigw.AuthorizationType.COGNITO)
        admin_requests.add_method("POST", apigw.LambdaIntegration(admin_books_fn),
                                  authorizer=cognito_authorizer,
                                  authorization_type=apigw.AuthorizationType.COGNITO)
        admin_requests_batch_delete = admin_requests.add_resource("batch-delete")
        admin_requests_batch_delete.add_method("POST", apigw.LambdaIntegration(admin_books_fn),
                                               authorizer=cognito_authorizer,
                                               authorization_type=apigw.AuthorizationType.COGNITO)

        admin_request_by_id = admin_requests.add_resource("{requestId}")
        admin_request_by_id.add_method("PUT", apigw.LambdaIntegration(admin_books_fn),
                                       authorizer=cognito_authorizer,
                                       authorization_type=apigw.AuthorizationType.COGNITO)
        admin_request_by_id.add_method("DELETE", apigw.LambdaIntegration(admin_books_fn),
                                       authorizer=cognito_authorizer,
                                       authorization_type=apigw.AuthorizationType.COGNITO)

        # ── 3. STACK OUTPUTS ──
        CfnOutput(self, "ApiUrl",
            value=api.url,
            description="API Gateway base URL")
