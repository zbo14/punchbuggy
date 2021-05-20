#!/bin/bash

cd "$(dirname "$0")"/..

mkdir -p private

cd private

openssl req \
  -x509 \
  -days 3650 \
  -newkey rsa:3072 \
  -nodes \
  -keyout key.pem \
  -out cert.pem \
  -subj '/CN=punch.buggy/'

sudo chown -R punchbuggy .
