"""Infrastructure assertions for the hardening applied after the security audit.

These synthesize the real stacks and assert on the resulting CloudFormation, so
a regression in the CDK definitions fails here rather than in production.
"""
import json

import aws_cdk as core
import aws_cdk.assertions as assertions
import pytest

from red_rising_cdk.data_stack import ObsidianDataStack
from red_rising_cdk.api_stack import ObsidianApiStack


@pytest.fixture(scope="module")
def stacks():
    app = core.App()
    data = ObsidianDataStack(app, "TestDataStack")
    api = ObsidianApiStack(
        app, "TestApiStack",
        user_pool=data.user_pool,
        books_table=data.books_table,
        profiles_table=data.profiles_table,
        requests_table=data.requests_table,
        notifications_table=data.notifications_table,
        progress_table=data.progress_table,
        audit_log_table=data.audit_log_table,
        announcement_table=data.announcement_table,
        covers_bucket=data.covers_bucket,
        files_bucket=data.files_bucket,
        queue=data.queue,
    )
    return (
        assertions.Template.from_stack(data),
        assertions.Template.from_stack(api),
    )


def _resources(template, kind):
    return template.find_resources(kind)


class TestDataProtection:
    def test_every_table_has_point_in_time_recovery(self, stacks):
        data, _ = stacks
        tables = _resources(data, "AWS::DynamoDB::Table")
        assert tables, "expected DynamoDB tables in the data stack"
        unprotected = [
            name for name, t in tables.items()
            if not t["Properties"]
            .get("PointInTimeRecoverySpecification", {})
            .get("PointInTimeRecoveryEnabled")
        ]
        assert unprotected == [], f"tables without PITR: {unprotected}"

    def test_queues_are_encrypted_at_rest(self, stacks):
        data, _ = stacks
        queues = _resources(data, "AWS::SQS::Queue")
        assert len(queues) == 2, "expected the main queue and its DLQ"
        unencrypted = [
            name for name, q in queues.items()
            if not (q["Properties"].get("SqsManagedSseEnabled")
                    or q["Properties"].get("KmsMasterKeyId"))
        ]
        assert unencrypted == [], f"unencrypted queues: {unencrypted}"

    def test_buckets_deny_insecure_transport(self, stacks):
        data, _ = stacks
        policies = _resources(data, "AWS::S3::BucketPolicy")
        assert len(policies) == 2, "expected a policy on both buckets"
        for name, p in policies.items():
            doc = json.dumps(p["Properties"]["PolicyDocument"])
            assert "aws:SecureTransport" in doc, f"{name} does not enforce TLS"

    def test_private_files_bucket_blocks_all_public_access(self, stacks):
        data, _ = stacks
        buckets = _resources(data, "AWS::S3::Bucket")
        private = [
            b for b in buckets.values()
            if "files" in json.dumps(b["Properties"].get("BucketName", ""))
        ]
        assert private, "expected to find the private files bucket"
        for b in private:
            cfg = b["Properties"]["PublicAccessBlockConfiguration"]
            assert all(cfg[k] for k in
                       ["BlockPublicAcls", "BlockPublicPolicy",
                        "IgnorePublicAcls", "RestrictPublicBuckets"])


class TestApiExposure:
    def test_stage_is_throttled(self, stacks):
        _, api = stacks
        stages = _resources(api, "AWS::ApiGateway::Stage")
        assert stages, "expected a deployed API stage"
        for name, s in stages.items():
            settings = s["Properties"].get("MethodSettings")
            assert settings, f"{name} has no method settings, so no throttle"
            for entry in settings:
                assert entry.get("ThrottlingRateLimit"), f"{name} has no rate limit"
                assert entry.get("ThrottlingBurstLimit"), f"{name} has no burst limit"

    def test_preflight_does_not_allow_every_origin(self, stacks):
        _, api = stacks
        methods = _resources(api, "AWS::ApiGateway::Method")
        options = [m for m in methods.values()
                   if m["Properties"].get("HttpMethod") == "OPTIONS"]
        assert options, "expected CORS preflight methods"
        for m in options:
            for r in m["Properties"]["Integration"]["IntegrationResponses"]:
                origin = r["ResponseParameters"].get(
                    "method.response.header.Access-Control-Allow-Origin")
                assert origin != "'*'", "preflight still allows any origin"


class TestLeastPrivilege:
    def _policies_for(self, template, role_hint):
        out = []
        for name, p in _resources(template, "AWS::IAM::Policy").items():
            if role_hint.lower() in name.lower():
                out.append(json.dumps(p["Properties"]["PolicyDocument"]))
        return out

    def test_reader_lambda_has_no_write_permissions(self, stacks):
        _, api = stacks
        for doc in self._policies_for(api, "ReaderFn"):
            assert "dynamodb:PutItem" not in doc
            assert "dynamodb:DeleteItem" not in doc
            assert "dynamodb:UpdateItem" not in doc

    def test_consumer_lambda_cannot_touch_profiles(self, stacks):
        _, api = stacks
        docs = self._policies_for(api, "ConsumerFn")
        assert docs, "expected a policy for the consumer function"
        for doc in docs:
            assert "Profiles" not in doc, "consumer still has profiles access"

    def test_admin_stats_lambda_has_no_bucket_access(self, stacks):
        _, api = stacks
        docs = self._policies_for(api, "AdminFnServiceRole")
        assert docs, "expected a policy for the admin function"
        for doc in docs:
            assert "s3:DeleteObject" not in doc, "admin stats function can delete objects"


class TestObservability:
    def test_lambda_log_groups_have_finite_retention(self, stacks):
        data, api = stacks
        for template in (data, api):
            groups = _resources(template, "AWS::Logs::LogGroup")
            assert groups, "expected explicit log groups"
            for name, g in groups.items():
                assert g["Properties"].get("RetentionInDays"), \
                    f"{name} retains logs forever"

    def test_dead_letter_queue_is_alarmed(self, stacks):
        data, _ = stacks
        alarms = _resources(data, "AWS::CloudWatch::Alarm")
        assert alarms, "expected an alarm on the dead letter queue"


class TestErrorResponsesAreReadableByBrowsers:
    """API Gateway rejects unauthorized requests before the integration runs.
    Without CORS headers on those gateway responses the browser blocks the
    response and fetch() reports an opaque network error, so the frontend
    cannot tell an expired session from an outage."""

    REQUIRED_TYPES = {"UNAUTHORIZED", "ACCESS_DENIED", "DEFAULT_4XX", "DEFAULT_5XX"}

    def _gateway_responses(self, api):
        return {
            r["Properties"]["ResponseType"]: r["Properties"].get("ResponseParameters", {})
            for r in _resources(api, "AWS::ApiGateway::GatewayResponse").values()
        }

    def test_auth_failures_carry_cors_headers(self, stacks):
        _, api = stacks
        responses = self._gateway_responses(api)
        missing = self.REQUIRED_TYPES - responses.keys()
        assert not missing, f"gateway responses missing CORS: {sorted(missing)}"

    def test_allow_origin_is_a_literal_not_a_mapping_expression(self, stacks):
        # Asserting only that the key exists is not enough: a
        # method.request.header.Origin mapping is accepted by CloudFormation and
        # by API Gateway, yet emits no header at all on the wire. Only a quoted
        # literal actually reaches the client, so require that shape.
        _, api = stacks
        key = "gatewayresponse.header.Access-Control-Allow-Origin"
        for rtype, params in self._gateway_responses(api).items():
            value = params.get(key)
            assert value, f"{rtype} would still be opaque to the browser"
            assert value.startswith("'") and value.endswith("'"), (
                f"{rtype} uses {value!r}; gateway responses only emit quoted "
                "literals, mapping expressions are silently dropped"
            )

    def test_error_responses_do_not_allow_credentials(self, stacks):
        # Echoing Origin is safe here only because these carry no credentials.
        _, api = stacks
        for rtype, params in self._gateway_responses(api).items():
            assert "gatewayresponse.header.Access-Control-Allow-Credentials" not in params, \
                f"{rtype} pairs an echoed origin with credentials"
