from aws_cdk import (
    Stack,
    Duration,
    RemovalPolicy,
    CfnOutput,
    aws_dynamodb as dynamodb,
    aws_sqs as sqs,
    aws_lambda as _lambda,
    aws_lambda_event_sources as lambda_events,
    aws_apigateway as apigw,
    aws_s3 as s3,
    aws_s3_deployment as s3deploy,
    aws_cloudfront as cf,
    aws_cloudfront_origins as origins,
    aws_iam as iam,
)
from constructs import Construct


class RedRisingCdkStack(Stack):

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── 1. DynamoDB ────────────────────────────────────────────────────
        table = dynamodb.Table(
            self, "RedRisingTable",
            table_name="red-rising-table",
            partition_key=dynamodb.Attribute(
                name="book-num",
                type=dynamodb.AttributeType.NUMBER,
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,   
        )

        # ── 2. SQS Queue + Dead Letter Queue ───────────────────────────────
        dlq = sqs.Queue(
            self, "RedRisingDLQ",
            queue_name="red-rising-dlq",
            retention_period=Duration.days(14),
        )

        queue = sqs.Queue(
            self, "RedRisingQueue",
            queue_name="red-rising-queue",
            visibility_timeout=Duration.seconds(30),
            dead_letter_queue=sqs.DeadLetterQueue(
                max_receive_count=3,
                queue=dlq,
            ),
        )

        # ── 3. S3 — Images Bucket (public) ─────────────────────────────────
        images_bucket = s3.Bucket(
            self, "ImagesBucket",
            bucket_name="bryans-library-images-12345",
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


        # ── 5. Lambda Functions ─────────────────────────────────────────────
        shared_code = _lambda.Code.from_asset("lambda")

        # 5a. Writer: API GW POST /books to SQS
        writer_fn = _lambda.Function(
            self, "WriterFn",
            function_name="red-rising-writer",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="writer.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment={"QUEUE_URL": queue.queue_url},
        )
        queue.grant_send_messages(writer_fn)

        # 5b. Consumer: SQS to DynamoDB
        consumer_fn = _lambda.Function(
            self, "ConsumerFn",
            function_name="red-rising-consumer",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="consumer.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(30),
        )
        table.grant_read_write_data(consumer_fn)
        consumer_fn.add_event_source(
            lambda_events.SqsEventSource(queue, batch_size=10)
        )

        # 5c. Reader: GET /books → DynamoDB scan
        reader_fn = _lambda.Function(
            self, "ReaderFn",
            function_name="red-rising-reader",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="reader.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
        )
        table.grant_read_data(reader_fn)

        # 5d. Presigned URL: POST /upload → S3
        presigned_fn = _lambda.Function(
            self, "PresignedFn",
            function_name="red-rising-presigned",
            runtime=_lambda.Runtime.PYTHON_3_12,
            handler="presigned.lambda_handler",
            code=shared_code,
            timeout=Duration.seconds(10),
            environment={"BUCKET_NAME": images_bucket.bucket_name},
        )
        images_bucket.grant_put(presigned_fn)

        # ── 6. API Gateway ──────────────────────────────────────────────────
        api = apigw.RestApi(
            self, "RedRisingApi",
            rest_api_name="red-rising-api",
            deploy_options=apigw.StageOptions(stage_name="prod"),
            default_cors_preflight_options=apigw.CorsOptions(
                allow_origins=apigw.Cors.ALL_ORIGINS,
                allow_methods=apigw.Cors.ALL_METHODS,
                allow_headers=["Content-Type", "Authorization"],
            ),
        )

        # /books
        books = api.root.add_resource("books")
        books.add_method("GET",  apigw.LambdaIntegration(reader_fn))
        books.add_method("POST", apigw.LambdaIntegration(writer_fn))

        # /upload
        upload = api.root.add_resource("upload")
        upload.add_method("POST", apigw.LambdaIntegration(presigned_fn))


        # ── 9. Stack Outputs ────────────────────────────────────────────────
        CfnOutput(self, "ApiUrl",
            value=api.url,
            description="Paste this into App.jsx as API_BASE (without trailing slash)")

        CfnOutput(self, "ImagesBucketName",
            value=images_bucket.bucket_name)
        CfnOutput(self, "DLQUrl",
            value=dlq.queue_url,
            description="Dead Letter Queue — inspect failed messages here")