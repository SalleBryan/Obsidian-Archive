import aws_cdk as core
import aws_cdk.assertions as assertions

from red_rising_cdk.red_rising_cdk_stack import RedRisingCdkStack

# example tests. To run these tests, uncomment this file along with the example
# resource in red_rising_cdk/red_rising_cdk_stack.py
def test_sqs_queue_created():
    app = core.App()
    stack = RedRisingCdkStack(app, "red-rising-cdk")
    template = assertions.Template.from_stack(stack)

#     template.has_resource_properties("AWS::SQS::Queue", {
#         "VisibilityTimeout": 300
#     })
