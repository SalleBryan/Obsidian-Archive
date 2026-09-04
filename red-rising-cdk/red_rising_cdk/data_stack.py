import os
from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_dynamodb as dynamodb,
    aws_sqs as sqs,
    aws_lambda as _lambda,
    aws_s3 as s3,
    aws_cognito as cognito,
    aws_secretsmanager as secretsmanager,
    aws_cloudwatch as cloudwatch,
    aws_cloudwatch_actions as cw_actions,
    aws_sns as sns,
    aws_sns_subscriptions as sns_subs,
    aws_budgets as budgets,
)
from constructs import Construct


class ObsidianDataStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, stage: str = "prod", **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # Physical resource names stay exactly as they are today when stage is
        # "prod" (the default) — nothing about the live stack changes. Passing
        # stage="dev" suffixes every physical name so a second, fully isolated
        # copy of this stack can be deployed side by side without colliding
        # with production (S3 bucket names and the Cognito domain prefix must
        # be globally unique, so this suffix is what makes that possible).
        def n(base: str) -> str:
            return base if stage == "prod" else f"{base}-{stage}"

        # ══════════════════════════════════════════════════════════════════════
        # 1. COGNITO — User Pool + Google Identity Provider
        # ══════════════════════════════════════════════════════════════════════
        user_pool = cognito.UserPool(
            self, "ObsidianUserPool",
            user_pool_name=n("obsidian-archive-users"),
            self_sign_up_enabled=True,
            sign_in_aliases=cognito.SignInAliases(email=True),
            auto_verify=cognito.AutoVerifiedAttrs(email=True),
            user_verification=cognito.UserVerificationConfig(
                email_subject="Your Obsidian Archive verification code: {####}",
                email_style=cognito.VerificationEmailStyle.CODE,
                email_body=(
                    "<!DOCTYPE html>"
                    "<html>"
                    "<head>"
                    "<meta charset='utf-8'>"
                    "<style>"
                    "body { margin: 0; padding: 0; background-color: #0f1115; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e2e6; }"
                    ".email-container { max-width: 560px; margin: 40px auto; background: #16181d; border: 1px solid rgba(255, 205, 91, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6); }"
                    ".header { background: linear-gradient(135deg, #1f1b16 0%, #16181d 100%); padding: 32px 24px; text-align: center; border-bottom: 1px solid rgba(255, 205, 91, 0.15); }"
                    ".brand-title { color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }"
                    ".brand-sub { color: #ffcd5b; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 6px; }"
                    ".content { padding: 36px 32px; text-align: center; }"
                    ".greeting { font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 12px; }"
                    ".desc { font-size: 14px; color: #a1a1aa; line-height: 1.6; margin-bottom: 24px; }"
                    ".code-box { display: inline-block; background: #211c16; border: 2px solid #ffcd5b; border-radius: 12px; padding: 16px 32px; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #ffcd5b; margin: 0 auto 24px; text-shadow: 0 2px 10px rgba(255, 205, 91, 0.3); }"
                    ".footer { padding: 20px; text-align: center; border-top: 1px solid rgba(255, 255, 255, 0.06); font-size: 12px; color: #71717a; background: #111317; }"
                    "</style>"
                    "</head>"
                    "<body>"
                    "<div class='email-container'>"
                    "<div class='header'>"
                    "<h1 class='brand-title'>Obsidian Archive</h1>"
                    "<div class='brand-sub'>The Sanctuary for Book Lovers</div>"
                    "</div>"
                    "<div class='content'>"
                    "<div class='greeting'>Verify Your Account</div>"
                    "<p class='desc'>Welcome to the Obsidian Archive. Enter the verification code below to confirm your email and unlock your personal reading vault.</p>"
                    "<div class='code-box'>{####}</div>"
                    "<p class='desc' style='font-size: 12px; color: #71717a; margin-bottom: 0;'>This code is valid for 24 hours. If you did not request this registration, you can safely ignore this email.</p>"
                    "</div>"
                    "<div class='footer'>"
                    "&copy; 2026 Obsidian Archive &bull; Salle Bryan"
                    "</div>"
                    "</div>"
                    "</body>"
                    "</html>"
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

        # Google Identity Provider — the Client ID is not sensitive (it's public
        # by design, visible in every OAuth redirect URL), so it stays a plain
        # env var. The Client Secret is genuinely sensitive and is pulled from
        # Secrets Manager instead of ever being typed on the command line.
        # Create it once per stage with:
        #   aws secretsmanager create-secret --name obsidian/google-client-secret --secret-string "<your-secret>"
        #   (or obsidian/google-client-secret-dev for a dev-stage deploy)
        google_secret_name = n("obsidian/google-client-secret")
        google_client_id = os.environ.get("GOOGLE_CLIENT_ID")
        supported_idps = [cognito.UserPoolClientIdentityProvider.COGNITO]

        google_idp = None
        if google_client_id:
            # Secrets Manager always appends a random 6-character suffix to a
            # secret's real ARN (e.g. "...secret-yhmZJj"), which can't be
            # predicted from the name alone. from_secret_name_v2() guesses an
            # ARN without that suffix, which CloudFormation then can't resolve
            # ("ResourceNotFoundException" at deploy time even though the
            # secret genuinely exists). Resolving the exact ARN via boto3 at
            # synth time and referencing it directly avoids that mismatch.
            import boto3
            _secret_arn = boto3.client(
                "secretsmanager", region_name=os.environ.get("CDK_DEFAULT_REGION", "us-east-1")
            ).describe_secret(SecretId=google_secret_name)["ARN"]
            google_client_secret_ref = secretsmanager.Secret.from_secret_complete_arn(
                self, "GoogleClientSecretRef", _secret_arn
            )
            google_idp = cognito.UserPoolIdentityProviderGoogle(
                self, "GoogleIdP",
                user_pool=user_pool,
                client_id=google_client_id,
                client_secret_value=google_client_secret_ref.secret_value,
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
            user_pool_client_name=n("obsidian-archive-web-client"),
            supported_identity_providers=supported_idps,
            auth_flows=cognito.AuthFlow(
                user_password=True,
                user_srp=True,
            ),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(
                    authorization_code_grant=True,
                ),
                scopes=[
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.PROFILE,
                    cognito.OAuthScope.COGNITO_ADMIN,
                ],
                callback_urls=["http://localhost:5173/", "https://main.d2nheaqmsqnih6.amplifyapp.com/"],
                logout_urls=["http://localhost:5173/", "https://main.d2nheaqmsqnih6.amplifyapp.com/"],
            ),
            prevent_user_existence_errors=True,
        )

        
        if google_idp:
            user_pool_client.node.add_dependency(google_idp)

        user_pool_domain = user_pool.add_domain(
            "ObsidianUserPoolDomain",
            cognito_domain=cognito.CognitoDomainOptions(
                domain_prefix=n("obsidian-archive")
            ),
        )

        # ══════════════════════════════════════════════════════════════════════
        # 2. DYNAMODB — Books, Profiles, Requests tables
        # ══════════════════════════════════════════════════════════════════════
        books_table = dynamodb.Table(
            self, "BooksTable",
            table_name=n("obsidian-books"),
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
            table_name=n("obsidian-profiles"),
            partition_key=dynamodb.Attribute(
                name="userId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        requests_table = dynamodb.Table(
            self, "RequestsTable",
            table_name=n("obsidian-requests"),
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
            table_name=n("obsidian-notifications"),
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

        # Reading progress — one row per (userId, bookId) for cross-device "continue reading"
        progress_table = dynamodb.Table(
            self, "ProgressTable",
            table_name=n("obsidian-progress"),
            partition_key=dynamodb.Attribute(
                name="userId",
                type=dynamodb.AttributeType.STRING,
            ),
            sort_key=dynamodb.Attribute(
                name="bookId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # Admin action audit trail — who did what, and when. Low volume by
        # nature (only admin actions), so a scan-and-sort read pattern is fine
        # at this scale rather than a time-bucketed partition key.
        audit_log_table = dynamodb.Table(
            self, "AuditLogTable",
            table_name=n("obsidian-audit-log"),
            partition_key=dynamodb.Attribute(
                name="logId",
                type=dynamodb.AttributeType.STRING,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # Platform-wide banner — a single row (id="current") holding whatever
        # the admin currently wants every visitor to see, or nothing.
        announcement_table = dynamodb.Table(
            self, "AnnouncementTable",
            table_name=n("obsidian-announcement"),
            partition_key=dynamodb.Attribute(
                name="id",
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
            queue_name=n("obsidian-dlq"),
            retention_period=Duration.days(14),
        )

        queue = sqs.Queue(
            self, "ObsidianQueue",
            queue_name=n("obsidian-queue"),
            visibility_timeout=Duration.seconds(60),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=dlq,
            ),
        )

        # Alert on any message landing in the DLQ — a message only gets here after
        # consumer_fn fails on it 3 times, which means a write silently never
        # happened. Without this alarm that failure is invisible unless someone
        # happens to check the SQS console.
        dlq_alert_topic = sns.Topic(self, "ObsidianDlqAlertTopic", topic_name=n("obsidian-dlq-alerts"))
        dlq_alert_topic.add_subscription(sns_subs.EmailSubscription("bryanjakevita@gmail.com"))

        dlq_messages_alarm = cloudwatch.Alarm(
            self, "ObsidianDlqAlarm",
            alarm_name=n("obsidian-dlq-has-messages"),
            alarm_description="A write operation failed 3 times and landed in the dead letter queue.",
            metric=dlq.metric_approximate_number_of_messages_visible(
                period=Duration.minutes(5),
                statistic="Maximum",
            ),
            threshold=1,
            evaluation_periods=1,
            comparison_operator=cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
            treat_missing_data=cloudwatch.TreatMissingData.NOT_BREACHING,
        )
        dlq_messages_alarm.add_alarm_action(cw_actions.SnsAction(dlq_alert_topic))

        # AWS Budgets tracks total account spend, not per-stack spend — so this
        # is only created once (on the prod deploy) to avoid two overlapping
        # budgets fighting over the same account-wide cost data when a dev
        # stage stack is also deployed.
        if stage == "prod":
            budgets.CfnBudget(
                self, "ObsidianMonthlyBudget",
                budget=budgets.CfnBudget.BudgetDataProperty(
                    budget_type="COST",
                    time_unit="MONTHLY",
                    budget_limit=budgets.CfnBudget.SpendProperty(amount=20, unit="USD"),
                ),
                notifications_with_subscribers=[
                    budgets.CfnBudget.NotificationWithSubscribersProperty(
                        notification=budgets.CfnBudget.NotificationProperty(
                            notification_type="ACTUAL",
                            comparison_operator="GREATER_THAN",
                            threshold=80,
                            threshold_type="PERCENTAGE",
                        ),
                        subscribers=[budgets.CfnBudget.SubscriberProperty(
                            subscription_type="EMAIL", address="bryanjakevita@gmail.com"
                        )],
                    ),
                    budgets.CfnBudget.NotificationWithSubscribersProperty(
                        notification=budgets.CfnBudget.NotificationProperty(
                            notification_type="FORECASTED",
                            comparison_operator="GREATER_THAN",
                            threshold=100,
                            threshold_type="PERCENTAGE",
                        ),
                        subscribers=[budgets.CfnBudget.SubscriberProperty(
                            subscription_type="EMAIL", address="bryanjakevita@gmail.com"
                        )],
                    ),
                ],
            )

        # ══════════════════════════════════════════════════════════════════════
        # 4. S3 — Covers bucket (public) + Files bucket (private)
        # ══════════════════════════════════════════════════════════════════════
        covers_bucket = s3.Bucket(
            self, "CoversBucket",
            bucket_name=n("obsidian-covers-12345"),
            cors=[s3.CorsRule(
                allowed_methods=[
                    s3.HttpMethods.GET,
                    s3.HttpMethods.PUT,
                    s3.HttpMethods.HEAD,
                    s3.HttpMethods.POST,
                ],
                allowed_origins=["*"],
                allowed_headers=["*"],
                exposed_headers=["ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2"],
                max_age=3000,
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
            bucket_name=n("obsidian-files-12345"),
            cors=[s3.CorsRule(
                allowed_methods=[
                    s3.HttpMethods.GET,
                    s3.HttpMethods.PUT,
                    s3.HttpMethods.HEAD,
                    s3.HttpMethods.POST,
                ],
                allowed_origins=["*"],
                allowed_headers=["*"],
                exposed_headers=["ETag", "x-amz-server-side-encryption", "x-amz-request-id", "x-amz-id-2"],
                max_age=3000,
            )],
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # Expose resources for ApiStack
        self.user_pool = user_pool
        self.user_pool_client = user_pool_client
        self.user_pool_domain = user_pool_domain
        self.books_table = books_table
        self.profiles_table = profiles_table
        self.requests_table = requests_table
        self.notifications_table = notifications_table
        self.progress_table = progress_table
        self.audit_log_table = audit_log_table
        self.announcement_table = announcement_table
        self.covers_bucket = covers_bucket
        self.files_bucket = files_bucket
        self.queue = queue
        self.dlq = dlq

        # ══════════════════════════════════════════════════════════════════════
        # 5. AUTH TRIGGER (Cognito Signup Lifecycle)
        # ══════════════════════════════════════════════════════════════════════
        shared_code = _lambda.Code.from_asset("lambda")
        common_env = {
            "PROFILES_TABLE": profiles_table.table_name,
        }

        auth_trigger_fn = _lambda.Function(
            self, "AuthTriggerFn",
            function_name=n("obsidian-auth-trigger"),
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="auth_trigger.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment=common_env,
        )
        profiles_table.grant_write_data(auth_trigger_fn)

        user_pool.add_trigger(
            cognito.UserPoolOperation.POST_CONFIRMATION,
            auth_trigger_fn,
        )

        # ══════════════════════════════════════════════════════════════════════
        # 6. STACK OUTPUTS
        # ══════════════════════════════════════════════════════════════════════
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