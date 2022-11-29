"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonSerializer = void 0;
exports.JsonSerializer = {
    serialize: (data) => JSON.stringify(data),
    unserialize: (data) => JSON.parse(data),
};
