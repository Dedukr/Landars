#!/bin/sh
# Safari refuses https://localhost when the certificate name is landarsfood.com.
# nginx serves localhost from /etc/nginx/localhost-tls (writable, inside the image).
# The mounted certs dir is read-only, so never write there:
#   - if it holds localhost.crt/.key (dev machine, trusted in the keychain), use those;
#   - otherwise (e.g. production, which has only the real certs) generate a throwaway pair.
set -e
src_dir=/etc/ssl/landarsfood
dst_dir=/etc/nginx/localhost-tls
cert="$dst_dir/localhost.crt"
key="$dst_dir/localhost.key"
mkdir -p "$dst_dir"
if [ -s "$src_dir/localhost.crt" ] && [ -s "$src_dir/localhost.key" ]; then
    cp "$src_dir/localhost.crt" "$cert"
    cp "$src_dir/localhost.key" "$key"
elif [ ! -s "$cert" ] || [ ! -s "$key" ]; then
    openssl req -x509 -newkey rsa:2048 -sha256 -days 825 -nodes \
        -keyout "$key" \
        -out "$cert" \
        -config /etc/nginx/localhost-cert.cnf
fi
chmod 644 "$cert"
chmod 600 "$key"
