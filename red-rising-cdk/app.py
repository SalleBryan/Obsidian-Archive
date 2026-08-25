import aws_cdk as cdk
from red_rising_cdk.red_rising_cdk_stack import RedRisingCdkStack

app = cdk.App()
RedRisingCdkStack(app, "RedRisingCdkStack",
    env=cdk.Environment(
        account="340752829171",
        region="us-east-1",
    )
)
app.synth()