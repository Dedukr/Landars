Star CPUtil
===========

The Linux binary is not committed (too large). The backend Docker image builds
Star's cputil from cloudprnt-sdk tag v2.0.1 and installs it at:

  /opt/star/cputil/cputil

Override with FESTIVAL_CPUTIL_PATH.

Local macOS (optional):

  curl -fsSL \
    "https://github.com/star-micronics/cloudprnt-sdk/archive/refs/tags/v2.0.1.tar.gz" \
    -o /tmp/cloudprnt-sdk.tar.gz
  tar -xzf /tmp/cloudprnt-sdk.tar.gz -C /tmp
  cd /tmp/cloudprnt-sdk-2.0.1/CloudPRNTSDKSamples/cputil
  dotnet publish -c Release -r osx-arm64 --self-contained true \
    -p:PublishSingleFile=true -o /path/to/backend/vendor/cputil-osx-arm64
  export FESTIVAL_CPUTIL_PATH=.../vendor/cputil-osx-arm64/cputil
