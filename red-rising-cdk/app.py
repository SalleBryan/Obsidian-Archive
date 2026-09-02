import aws_cdk as cdk
from red_rising_cdk.red_rising_cdk_stack import RedRisingCdkStack
from red_rising_cdk.api_stack import ObsidianApiStack

app = cdk.App()
env = cdk.Environment(account="340752829171", region="us-east-1")

data_stack = RedRisingCdkStack(app, "RedRisingCdkStack", env=env)

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