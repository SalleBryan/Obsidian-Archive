#!/usr/bin/env python3
"""Generate an OpenAPI 3.1 spec from the synthesized CloudFormation template.

Derived from the CDK output rather than hand-written, so the spec cannot drift
from the stack: if a route is added, removed or has its authorizer changed, the
regenerated spec reflects it and CI fails on the diff.

Reads cdk.out/ObsidianApiStack.template.json - run `cdk synth` first.

    python scripts/generate_openapi.py            # write docs/openapi.json
    python scripts/generate_openapi.py --check    # fail if the spec is stale
"""
import argparse
import json
import os
import sys

TEMPLATE = os.path.join("cdk.out", "ObsidianApiStack.template.json")
OUTPUT = os.path.join("docs", "openapi.json")

# Which Lambda ends up serving each path, for the description line. Taken from
# api_stack.py's wiring; purely documentation, nothing depends on it.
HANDLERS = {
    "/announcement": "reader", "/books": "reader/writer", "/books/mine": "reader",
    "/books/{bookId}": "reader/writer", "/books/{bookId}/auth": "reader",
    "/books/{bookId}/read": "upload", "/books/{bookId}/read-auth": "upload",
    "/upload/cover": "upload", "/upload/book": "upload",
    "/requests": "reader/writer", "/requests/{requestId}": "writer",
    "/profile": "profile", "/progress": "progress", "/progress/{bookId}": "progress",
    "/notifications": "reader/writer",
}


def _resource_paths(resources):
    """Rebuild each resource's full path by walking ParentId back to the root."""
    nodes, parents = {}, {}
    for name, res in resources.items():
        if res["Type"] != "AWS::ApiGateway::Resource":
            continue
        props = res["Properties"]
        nodes[name] = props["PathPart"]
        parent = props.get("ParentId")
        parents[name] = parent.get("Ref") if isinstance(parent, dict) and "Ref" in parent else None

    def full(name):
        part = nodes[name]
        parent = parents.get(name)
        return f"{full(parent)}/{part}" if parent in nodes else f"/{part}"

    return {name: full(name) for name in nodes}


def build_spec(template):
    resources = template["Resources"]
    paths_by_id = _resource_paths(resources)

    paths = {}
    for res in resources.values():
        if res["Type"] != "AWS::ApiGateway::Method":
            continue
        props = res["Properties"]
        method = props["HttpMethod"]
        if method == "OPTIONS":          # CORS preflight, not part of the contract
            continue

        ref = props.get("ResourceId", {})
        path = paths_by_id.get(ref.get("Ref"), "/") if isinstance(ref, dict) else "/"

        secured = props.get("AuthorizationType") == "COGNITO_USER_POOLS"
        op = {
            "summary": f"{method} {path}",
            "description": f"Handled by the {HANDLERS.get(path, 'admin')} Lambda.",
            "responses": {
                "200": {"description": "Success"},
                "400": {"description": "Invalid request"},
                "500": {"description": "Internal server error"},
            },
        }
        if secured:
            op["security"] = [{"CognitoUserPool": []}]
            op["responses"]["401"] = {
                "description": "Missing or expired token. Carries CORS headers so the "
                               "browser can surface the status instead of an opaque "
                               "network error."
            }
            op["responses"]["403"] = {"description": "Authenticated but not permitted"}
        else:
            op["security"] = []

        params = [
            {"name": seg[1:-1], "in": "path", "required": True, "schema": {"type": "string"}}
            for seg in path.split("/") if seg.startswith("{") and seg.endswith("}")
        ]
        if params:
            op["parameters"] = params

        paths.setdefault(path, {})[method.lower()] = op

    return {
        "openapi": "3.1.0",
        "info": {
            "title": "Obsidian Archive API",
            "version": "1.0.0",
            "description": (
                "Generated from the CDK-synthesized CloudFormation template by "
                "scripts/generate_openapi.py - do not edit by hand.\n\n"
                "Routes marked with CognitoUserPool require a Cognito ID token as "
                "`Authorization: Bearer <token>`. Admin routes additionally check the "
                "caller's verified email against the super-admin allowlist inside the "
                "Lambda; API Gateway only proves identity, not privilege."
            ),
        },
        "components": {
            "securitySchemes": {
                "CognitoUserPool": {
                    "type": "http", "scheme": "bearer", "bearerFormat": "JWT",
                    "description": "Cognito ID token, validated by an API Gateway authorizer.",
                }
            }
        },
        "paths": dict(sorted(paths.items())),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="exit non-zero if the committed spec is out of date")
    args = ap.parse_args()

    if not os.path.exists(TEMPLATE):
        sys.exit(f"{TEMPLATE} not found - run `cdk synth` first.")

    with open(TEMPLATE, encoding="utf-8") as f:
        spec = build_spec(json.load(f))
    rendered = json.dumps(spec, indent=2) + "\n"

    if args.check:
        if not os.path.exists(OUTPUT):
            sys.exit(f"{OUTPUT} is missing - run: python scripts/generate_openapi.py")
        with open(OUTPUT, encoding="utf-8") as f:
            if f.read() != rendered:
                sys.exit(f"{OUTPUT} is out of date - regenerate and commit it.")
        print(f"{OUTPUT} is up to date ({len(spec['paths'])} paths).")
        return

    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    with open(OUTPUT, "w", encoding="utf-8") as f:
        f.write(rendered)
    secured = sum(1 for p in spec["paths"].values() for op in p.values() if op.get("security"))
    total = sum(len(p) for p in spec["paths"].values())
    print(f"wrote {OUTPUT}: {len(spec['paths'])} paths, {total} operations, {secured} requiring auth")


if __name__ == "__main__":
    main()
