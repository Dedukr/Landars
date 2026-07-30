Star CPUtil
===========

The Linux binary is not committed (too large). The backend Docker image builds
Star's cputil from cloudprnt-sdk tag v2.0.1 and installs it at:

  /opt/star/cputil/cputil

Override with FESTIVAL_CPUTIL_PATH.

Local macOS (optional):

  git clone --depth 1 --branch v2.0.1 \
    https://github.com/star-micronics/cloudprnt-sdk.git /tmp/cloudprnt-sdk
  cd /tmp/cloudprnt-sdk/CloudPRNTSDKSamples/cputil
  dotnet publish -c Release -r osx-arm64 --self-contained true \
    -p:PublishSingleFile=true -o /path/to/backend/vendor/cputil-osx-arm64
  export FESTIVAL_CPUTIL_PATH=.../vendor/cputil-osx-arm64/cputil
