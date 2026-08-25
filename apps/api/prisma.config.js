"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const config_1 = require("prisma/config");
/**
 * Prisma 7 ga tayyor konfiguratsiya.
 * `dotenv/config` ATAYLAB birinchi: prisma.config.ts ishlatilganda
 * Prisma `.env` ni o'zi yuklamaydi.
 */
exports.default = (0, config_1.defineConfig)({
    schema: 'prisma/schema.prisma',
    migrations: { path: 'prisma/migrations' },
});
//# sourceMappingURL=prisma.config.js.map