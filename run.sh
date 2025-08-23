#!/bin/bash -x

source .env

# docker run -d \
#   --name postgres \
#   -e POSTGRES_PASSWORD=$PGPASSWORD \
#   -v ~/postgres:/var/lib/postgresql/data \
#   -p $PGPORT:$PGPORT \
#   postgres:17.2
#
# sleep 10

npx prisma migrate dev

npm run dev
