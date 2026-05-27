// Re-export Prisma client så apps/api kan importere via @sakspilot/db
const { PrismaClient } = require('@prisma/client');
module.exports = { PrismaClient };
