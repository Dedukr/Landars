#!/bin/bash
# Shared fail-closed policy for backup uploads and remote retention cleanup.
# Reads from production S3 remain available regardless of this policy.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../postgresql/storage_environment.sh"
