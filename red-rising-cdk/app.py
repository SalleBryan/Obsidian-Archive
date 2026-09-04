import os
import aws_cdk as cdk
from red_rising_cdk.data_stack import ObsidianDataStack
from red_rising_cdk.api_stack import ObsidianApiStack

app = cdk.App()
# CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION are populated automatically from your
# active AWS CLI credentials at synth time — no account ID committed to source.
env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
    region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
)

data_stack = ObsidianDataStack(app, "RedRisingCdkStack", env=env)

ObsidianApiStack(
    app,
    "ObsidianApiStack",
    env=env,
    user_pool=data_stack.user_pool,
    books_table=data_stack.books_table,
    profiles_table=data_stack.profiles_table,
    requests_table=data_stack.requests_table,
    notifications_table=data_stack.notifications_table,
    progress_table=data_stack.progress_table,
    covers_bucket=data_stack.covers_bucket,
    files_bucket=data_stack.files_bucket,
    queue=data_stack.queue,
)

app.synth()