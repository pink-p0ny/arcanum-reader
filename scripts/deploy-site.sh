#!/usr/bin/env bash
# Publishes site/ to S3 and invalidates CloudFront. Needs the AWS CLI configured for account 727646484050.
set -euo pipefail
cd "$(dirname "$0")/.."

BUCKET="arcanum-reader-site-727646484050"
DIST_ID="${ARCANUM_SITE_DIST_ID:-$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='arcanum-reader.app'].Id | [0]" --output text)}"

aws s3 sync site/ "s3://$BUCKET/" --delete --only-show-errors \
  --exclude "*.png" --cache-control "public, max-age=300"
aws s3 sync site/ "s3://$BUCKET/" --only-show-errors \
  --exclude "*" --include "*.png" --cache-control "public, max-age=86400"

if [ -n "$DIST_ID" ] && [ "$DIST_ID" != "None" ]; then
  aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" --query Invalidation.Id --output text
fi
echo "deployed to https://arcanum-reader.app"
