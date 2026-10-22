#!/bin/sh
# Safari refuses https://localhost when the certificate name is landarsfood.com.
# Create a localhost certificate on first start if the mounted certs dir has none.
set -e
cert=/etc/ssl/landarsfood/localhost.crt
key=/etc/ssl/landarsfood/localhost.key
if [ -s "$cert" ] && [ -s "$key" ]; then
    exit 0
fi
openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
    -keyout "$key" \
    -out "$cert" \
    -config /etc/nginx/localhost-cert.cnf
chmod 644 "$cert"
chmod 600 "$key"
