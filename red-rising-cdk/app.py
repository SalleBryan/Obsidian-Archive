import os
import subprocess
import sys

# cdk.json runs "python app.py", so whichever interpreter is first on PATH wins.
# With the virtualenv unactivated that is the system Python, which has no
# aws_cdk, and synth dies before a single stack is defined. Rather than rely on
# everyone remembering to activate first, re-run this file with the local .venv
# interpreter when the CDK is not importable. This falls through untouched in
# CI, where dependencies are installed into the runner's own Python.
_BOOTSTRAP_FLAG = "OBSIDIAN_CDK_BOOTSTRAPPED"


def _use_venv_interpreter_if_needed():
    try:
        import aws_cdk  # noqa: F401
        return
    except ModuleNotFoundError:
        # Already re-executed once: the venv itself is broken, so let the
        # real ImportError surface rather than looping.
        if os.environ.get(_BOOTSTRAP_FLAG):
            raise

    here = os.path.dirname(os.path.abspath(__file__))
    for candidate in (
        os.path.join(here, ".venv", "Scripts", "python.exe"),  # Windows
        os.path.join(here, ".venv", "bin", "python"),          # macOS / Linux
    ):
        if os.path.exists(candidate):
            completed = subprocess.run(
                [candidate, os.path.abspath(__file__), *sys.argv[1:]],
                env={**os.environ, _BOOTSTRAP_FLAG: "1"},
            )
            sys.exit(completed.returncode)

    raise SystemExit(
        "aws_cdk is not importable and no .venv was found next to app.py. "
        "Create one with: python -m venv .venv "
        "and install dependencies with: .venv/Scripts/pip install -r requirements.txt"
    )


_use_venv_interpreter_if_needed()

import aws_cdk as cdk
from red_rising_cdk.data_stack import ObsidianDataStack
from red_rising_cdk.api_stack import ObsidianApiStack

app = cdk.App()
# CDK_DEFAULT_ACCOUNT / CDK_DEFAULT_REGION are populated automatically from your
# active AWS CLI credentials at synth time, so no account ID is committed to source.
env = cdk.Environment(
    account=os.environ.get("CDK_DEFAULT_ACCOUNT"),
    region=os.environ.get("CDK_DEFAULT_REGION", "us-east-1"),
)

# Defaults to "prod" so a plain `cdk deploy` behaves exactly as it always has:
# same stack IDs, same physical resource names, touches nothing about the live
# environment. Deploy an isolated dev copy alongside it with:
#   cdk deploy --context stage=dev --all
stage = app.node.try_get_context("stage") or "prod"
stack_suffix = "" if stage == "prod" else f"-{stage}"

data_stack = ObsidianDataStack(app, f"RedRisingCdkStack{stack_suffix}", stage=stage, env=env)

ObsidianApiStack(
    app,
    f"ObsidianApiStack{stack_suffix}",
    env=env,
    stage=stage,
    user_pool=data_stack.user_pool,
    books_table=data_stack.books_table,
    profiles_table=data_stack.profiles_table,
    requests_table=data_stack.requests_table,
    notifications_table=data_stack.notifications_table,
    progress_table=data_stack.progress_table,
    audit_log_table=data_stack.audit_log_table,
    announcement_table=data_stack.announcement_table,
    covers_bucket=data_stack.covers_bucket,
    files_bucket=data_stack.files_bucket,
    queue=data_stack.queue,
)

app.synth()