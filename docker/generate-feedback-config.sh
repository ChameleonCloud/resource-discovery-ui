#!/bin/sh
# Writes the feedback secret into a runtime file
set -eu

cat <<EOF > /usr/share/nginx/html/env-config.js
window.__FEEDBACK_SECRET__ = "${FEEDBACK_SHARED_SECRET:-}";
EOF
