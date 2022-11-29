"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AvroSerializer = exports.CacheAvroSchema = void 0;
const avsc_1 = __importDefault(require("avsc"));
exports.CacheAvroSchema = avsc_1.default.Type.forSchema({
    name: "Cache",
    type: "record",
    fields: [{ name: "data", type: ["string"] }],
});
exports.AvroSerializer = {
    serialize: (data) => String(exports.CacheAvroSchema.toBuffer(data)),
    unserialize: (data) => exports.CacheAvroSchema.fromBuffer(Buffer.from(data)),
};
