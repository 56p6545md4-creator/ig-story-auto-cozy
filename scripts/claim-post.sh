#!/usr/bin/env bash
set -euo pipefail
# Called after Instagram processing, immediately before the irreversible publish.
test "$(TZ=Asia/Tokyo date +%F)" = "$POST_DATE"
TIME=$(TZ=Asia/Tokyo date +%H%M)
if (( 10#$TIME < 810 )); then exit 1; fi
echo "$POST_DATE" > pending_post.txt
git add -f pending_post.txt
git commit -m "Claim Instagram publication $POST_DATE"
git push origin HEAD:published
# If this push fails, media_publish is never called. If the process dies after
# this point, the next run fails closed for this date until human reconciliation.
