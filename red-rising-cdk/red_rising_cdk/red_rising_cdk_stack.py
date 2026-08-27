import os
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    SecretValue,
    CfnOutput,
    aws_dynamodb as dynamodb,
    aws_sqs as sqs,
    aws_lambda as _lambda,
    aws_lambda_event_sources as lambda_events,
    aws_apigateway as apigw,
    aws_s3 as s3,
    aws_cognito as cognito,
    aws_iam as iam,
)
from constructs import Construct


class RedRisingCdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ══════════════════════════════════════════════════════════════════════
        # 1. COGNITO — User Pool + Google Identity Provider
        # ══════════════════════════════════════════════════════════════════════
        user_pool = cognito.UserPool(
            self, "ObsidianUserPool",
            user_pool_name="obsidian-archive-users",
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            user_verification=cognito.UserVerificationConfig(
                email_subject="[Obsidian Archive] Your Verification Code: {####}",
                email_style=cognito.VerificationEmailStyle.CODE,
                email_body=(
                    "Welcome to Obsidian Archive — The Ultimate Destination for Bookies.\n\n"
                    "Your 6-digit confirmation code is:\n\n"
                    "{####}\n\n"
                    "Enter this code on the platform to verify your account and unlock your personal library vault.\n\n"
                    "— Obsidian Archive Team | Salle Bryan, Founder"
                ),
            ),
            standard_attributes=cognito.StandardAttributes(
                email=cognito.StandardAttribute(required=True, mutable=True),
                fullname=cognito.StandardAttribute(required=False, mutable=True),
            ),
            password_policy=cognito.PasswordPolicy(
                min_length=8,
                require_lowercase=True,
                require_uppercase=True,
                require_digits=True,
                require_symbols=False,
            ),
            account_recovery=cognito.AccountRecovery.EMAIL_ONLY,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # Google Identity Provider (activated if env vars are present, or via Console)
        google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
        google_client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        supported_idps = [cognito.UserPoolClientIdentityProvider.COGNITO]

        if google_client_id and google_client_secret:
            google_idp = cognito.UserPoolIdentityProviderGoogle(
                self, "GoogleIdP",
                user_pool=user_pool,
                client_id=google_client_id,
                client_secret_value=SecretValue.unsafe_plain_text(google_client_secret),
                attribute_mapping=cognito.AttributeMapping(
                    email=cognito.ProviderAttribute.GOOGLE_EMAIL,
                    fullname=cognito.ProviderAttribute.GOOGLE_NAME,
                ),
                scopes=["profile", "email", "openid"],
            )
            supported_idps.append(cognito.UserPoolClientIdentityProvider.GOOGLE)

        user_pool_client = cognito.UserPoolClient(
            self, "ObsidianUserPoolClient",
            user_pool=user_pool,
            user_pool_client_name="obsidian-archive-web-client",
            supported_identity_providers=supported_idps,
            auth_flows=cognito.AuthFlow(
                user_password=True,
                user_srp=True,
            ),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(
                    authorization_code_grant=True,
                    implicit_code_grant=True,
                ),
                scopes=[
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                ],
                callback_urls=["http://localhost:5173/", "https://main.d2nheaqmsqnih6.amplifyapp.com/"],
                logout_urls=["http://localhost:5173/", "https://main.d2nheaqmsqnih6.amplifyapp.com/"],
            ),
            prevent_user_existence_errors=True,
        )

        user_pool_domain = user_pool.add_domain(
            "ObsidianUserPoolDomain",
            cognito_domain=cognito.CognitoDomainOptions(
                domain_prefix="obsidian-archive"
            ),
        )

        # ══════════════════════════════════════════════════════════════════════
        # 2. DYNAMODB — Books, Profiles, Requests tables
        # ══════════════════════════════════════════════════════════════════════
        books_table = dynamodb.Table(
            self, "BooksTable",
            table_name="obsidian-books",
            partition_key=dynamodb.Attribute(
                name="bookId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )
        books_table.add_global_secondary_index(
            index_name="OwnerIndex",
            partition_key=dynamodb.Attribute(name="ownerId", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="createdAt", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        books_table.add_global_secondary_index(
            index_name="VisibilityIndex",
            partition_key=dynamodb.Attribute(name="visibility", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="createdAt", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        profiles_table = dynamodb.Table(
            self, "ProfilesTable",
            table_name="obsidian-profiles",
            partition_key=dynamodb.Attribute(
                name="userId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        requests_table = dynamodb.Table(
            self, "RequestsTable",
            table_name="obsidian-requests",
            partition_key=dynamodb.Attribute(
                name="requestId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )
        requests_table.add_global_secondary_index(
            index_name="StatusIndex",
            partition_key=dynamodb.Attribute(name="status", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="createdAt", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        notifications_table = dynamodb.Table(
            self, "NotificationsTable",
            table_name="obsidian-notifications",
            partition_key=dynamodb.Attribute(
                name="userId",
                type=dynamodb.AttributeType.STRING,
            ),
            sort_key=dynamodb.Attribute(
                name="notificationId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # ══════════════════════════════════════════════════════════════════════
        # 3. SQS — Main queue + Dead Letter Queue
        # ══════════════════════════════════════════════════════════════════════
        dlq = sqs.Queue(
            self, "ObsidianDLQ",
            queue_name="obsidian-dlq",
            retention_period=Duration.days(14),
        )

        queue = sqs.Queue(
            self, "ObsidianQueue",
            queue_name="obsidian-queue",
            visibility_timeout=Duration.seconds(60),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=dlq,
            ),
        )

        # ══════════════════════════════════════════════════════════════════════
        # 4. S3 — Covers bucket (public) + Files bucket (private)
        # ══════════════════════════════════════════════════════════════════════
        covers_bucket = s3.Bucket(
            self, "CoversBucket",
            bucket_name="obsidian-covers-12345",
            cors=[s3.CorsRule(
                allowed_methods=[s3.HttpMethods.GET, s3.HttpMethods.PUT],
                allowed_origins=["*"],
                allowed_headers=["*"],
            )],
            public_read_access=True,
            block_public_access=s3.BlockPublicAccess(
                block_public_acls=False,
                block_public_policy=False,
                ignore_public_acls=False,
                restrict_public_buckets=False,
            ),
            object_ownership=s3.ObjectOwnership.OBJECT_WRITER,
            removal_policy=RemovalPolicy.RETAIN,
        )

        files_bucket = s3.Bucket(
            self, "FilesBucket",
            bucket_name="obsidian-files-12345",
            cors=[s3.CorsRule(
                allowed_methods=[s3.HttpMethods.GET, s3.HttpMethods.PUT],
                allowed_origins=["*"],
                allowed_headers=["*"],
            )],
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # ══════════════════════════════════════════════════════════════════════
        # 5. LAMBDA FUNCTIONS
        # ══════════════════════════════════════════════════════════════════════
        shared_code = _lambda.Code.from_asset("lambda")

        common_env = {
            "BOOKS_TABLE": books_table.table_name,
            "PROFILES_TABLE": profiles_table.table_name,
            "REQUESTS_TABLE": requests_table.table_name,
            "NOTIFICATIONS_TABLE": notifications_table.table_name,
            "COVERS_BUCKET": covers_bucket.bucket_name,
            "FILES_BUCKET": files_bucket.bucket_name,
        }

        # 5a. Writer: API Gateway POST → SQS
        writer_fn = _lambda.Function(
            self, "WriterFn",
            function_name="obsidian-writer",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="writer.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment={**common_env, "QUEUE_URL": queue.queue_url},
        )
        queue.grant_send_messages(writer_fn)

        # 5b. Consumer: SQS → DynamoDB + S3 cleanup
        consumer_fn = _lambda.Function(
            self, "ConsumerFn",
            function_name="obsidian-consumer",
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

        # 5c. Reader: API Gateway GET → DynamoDB reads
        reader_fn = _lambda.Function(
            self, "ReaderFn",
            function_name="obsidian-reader",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="reader.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        books_table.grant_read_data(reader_fn)
        requests_table.grant_read_data(reader_fn)
        notifications_table.grant_read_data(reader_fn)

        # 5d. Upload: Presigned URLs for covers, book files, and reader streaming
        upload_fn = _lambda.Function(
            self, "UploadFn",
            function_name="obsidian-upload",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="upload.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        covers_bucket.grant_read_write(upload_fn)
        files_bucket.grant_read_write(upload_fn)
        books_table.grant_read_data(upload_fn)

        # 5e. Profile: User profile CRUD
        profile_fn = _lambda.Function(
            self, "ProfileFn",
            function_name="obsidian-profile",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="profile.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        profiles_table.grant_read_write_data(profile_fn)

        # 5f. Auth Trigger: Cognito post-confirmation → create profile
        auth_trigger_fn = _lambda.Function(
            self, "AuthTriggerFn",
            function_name="obsidian-auth-trigger",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="auth_trigger.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        profiles_table.grant_write_data(auth_trigger_fn)

        # Connect auth trigger to Cognito
        user_pool.add_trigger(
            cognito.UserPoolOperation.POST_CONFIRMATION,
            auth_trigger_fn,
        )

        # ══════════════════════════════════════════════════════════════════════
        # 6. API GATEWAY — with Cognito Authorizer
        # ══════════════════════════════════════════════════════════════════════
        api = apigw.RestApi(
            self, "ObsidianApi",
            rest_api_name="obsidian-archive-api",
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
        book_by_id.add_method("PUT", apigw.LambdaIntegration(writer_fn),
                              authorizer=cognito_authorizer,
                              authorization_type=apigw.AuthorizationType.COGNITO)
        book_by_id.add_method("DELETE", apigw.LambdaIntegration(writer_fn),
                              authorizer=cognito_authorizer,
                              authorization_type=apigw.AuthorizationType.COGNITO)

        # ── /books/{bookId}/read (conditional — handled in Lambda) ──
        book_read = book_by_id.add_resource("read")
        book_read.add_method("GET", apigw.LambdaIntegration(upload_fn))

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

        # ── /notifications (authenticated GET/PUT) ──
        notifications_res = api.root.add_resource("notifications")
        notifications_res.add_method("GET", apigw.LambdaIntegration(reader_fn),
                                     authorizer=cognito_authorizer,
                                     authorization_type=apigw.AuthorizationType.COGNITO)
        notifications_res.add_method("PUT", apigw.LambdaIntegration(writer_fn),
                                     authorizer=cognito_authorizer,
                                     authorization_type=apigw.AuthorizationType.COGNITO)

        # ══════════════════════════════════════════════════════════════════════
        # 7. STACK OUTPUTS
        # ══════════════════════════════════════════════════════════════════════
        CfnOutput(self, "ApiUrl",
            value=api.url,
            description="API Gateway base URL")

        CfnOutput(self, "UserPoolId",
            value=user_pool.user_pool_id,
            description="Cognito User Pool ID — needed in frontend Amplify config")

        CfnOutput(self, "UserPoolClientId",
            value=user_pool_client.user_pool_client_id,
            description="Cognito App Client ID — needed in frontend Amplify config")

        CfnOutput(self, "UserPoolDomain",
            value=user_pool_domain.domain_name,
            description="Cognito hosted UI domain prefix")

        CfnOutput(self, "CoversBucketName",
            value=covers_bucket.bucket_name)

        CfnOutput(self, "FilesBucketName",
            value=files_bucket.bucket_name)

        CfnOutput(self, "DLQUrl",
            value=dlq.queue_url,
            description="Dead Letter Queue — inspect failed messages here")