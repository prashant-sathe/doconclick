#!/bin/sh
# Renews the Let's Encrypt cert (webroot method, no downtime) and reloads
# nginx so it picks up the renewed files. Meant to run from a host cron job
# in the project directory, e.g.:
#   0 3 * * 1 cd /home/ubuntu/doconclick && ./deploy/certbot-renew.sh >> /var/log/certbot-renew.log 2>&1
set -e

docker run --rm \
  -v doconclick-prod_letsencrypt:/etc/letsencrypt \
  -v doconclick-prod_certbot-www:/var/www/certbot \
  certbot/certbot renew --webroot -w /var/www/certbot

docker exec doconclick-prod-nginx-1 nginx -s reload
