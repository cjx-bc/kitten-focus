#!/bin/sh
set -eu
cd /opt/kitten-focus
docker run --rm -v /opt/kitten-focus/certificates:/etc/letsencrypt -v /opt/kitten-focus/challenges:/var/www/acme certbot/certbot:v5.10.0 renew --quiet --webroot -w /var/www/acme
docker exec kitten-focus-updates nginx -t
docker exec kitten-focus-updates nginx -s reload
