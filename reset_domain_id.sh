#!/bin/bash

UPDATE "Document" SET "domainId" = NULL WHERE "parentId" IS NOT NULL;
